import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import type { ReactiveValue, RenderRoute, RouteDefinition, TemplateRoute } from './types';

/**
 * Checks if a given value is a reactive node (Atom or Computed).
 *
 * `isAtom` returns `true` for both plain atoms and computed atoms because
 * `ComputedAtomImpl` carries `ATOM_BRAND` in addition to `COMPUTED_BRAND`.
 * A separate `isComputed` check would therefore be redundant.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> {
  return isAtom(value);
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  return isReactive(source) ? (source as ReadonlyAtom<T>).value : (source as T);
}

// ============================================================================
// DOM helpers
// ============================================================================

/**
 * Generates a CSS selector string for a DOM element, suitable for debug output.
 * Returns `tagName#id` when an id is present, otherwise `tagName.class1.class2…`.
 */
export function getSelector(el: Element): string {
  const tagName = el.tagName.toLowerCase();
  if (el.id) return `${tagName}#${el.id}`;

  const classes = Array.from(el.classList);
  return classes.length > 0 ? `${tagName}.${classes.join('.')}` : tagName;
}

// ============================================================================
// HTML sanitization
// ============================================================================

// --- Constants used by sanitizeHtml / sanitizeAttributes ---

/** Global singleton parser — avoids the overhead of repeated instantiation. */
const parser = new DOMParser();

// HTML element tagName is always uppercase in browser DOM — no toLowerCase() needed.
const DANGEROUS_TAGS = new Set([
  'SCRIPT',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'BASE',
  'META',
  'APPLET',
  'NOSCRIPT',
  'FORM',
]);

const URL_ATTRS = new Set([
  'href',
  'src',
  'action',
  'formaction',
  'xlink:href',
  'data',
  'poster',
  'srcset',
  'background',
  'cite',
  'longdesc',
  'profile',
  'usemap',
  'classid',
  'codebase',
]);

const DANGEROUS_PROTOCOL_RE = /^\s*(?:javascript|vbscript)\s*:/i;

const DANGEROUS_CSS_RE =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
  /(?:expression\s*\(|behavior\s*:|(?:\\[0-9a-f]{1,6}\s*|[\s\x00-\x20/'"])*(?:j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t|d\s*a\s*t\s*a)\s*:(?!image\/))/i;

/** Module-level constant — avoids recreating the RegExp on every call. */
const DANGEROUS_CSS_URL_RE = /url\s*\(\s*(?:["']?\s*)?(?:javascript|vbscript)\s*:/i;

// --- Helpers ---

/**
 * Internal helper to sanitize all attributes of a given element in-place.
 *
 * Iterates in reverse so live-index removal via `removeAttribute` is safe
 * without copying the NamedNodeMap into a temporary array.
 * Lowercase conversion is deferred (lazy) to only the checks that require it.
 */
function sanitizeAttributes(el: Element): void {
  for (let i = el.attributes.length - 1; i >= 0; i--) {
    const attr = el.attributes[i]!;
    const rawName = attr.name;

    // Remove event handlers (on*) — prefix check is case-insensitive via lowercase
    const nameLower = rawName.toLowerCase();
    if (nameLower.startsWith('on')) {
      el.removeAttribute(rawName);
      continue;
    }

    // Remove dangerous protocols in URL attributes (lazy: only when name matches)
    if (URL_ATTRS.has(nameLower) && DANGEROUS_PROTOCOL_RE.test(attr.value)) {
      el.removeAttribute(rawName);
      continue;
    }

    // Remove dangerous data URIs (excluding safe images) — check raw value, trim once
    const trimmed = attr.value.trimStart();
    const trimmedLower = trimmed.toLowerCase();
    if (trimmedLower.startsWith('data:') && !trimmedLower.startsWith('data:image/')) {
      el.removeAttribute(rawName);
      continue;
    }

    // Remove style attributes containing dangerous CSS
    if (nameLower === 'style' && DANGEROUS_CSS_RE.test(attr.value)) {
      el.removeAttribute(rawName);
    }
  }
}

/**
 * HTML sanitization for XSS mitigation using native DOMParser.
 *
 * Parses the input string into a document, removes dangerous tags (script,
 * iframe, etc.) entirely, and strips dangerous attributes (event handlers,
 * javascript: URLs, unsafe data URIs, dangerous CSS). Finally serialises the
 * cleaned document back to a string.
 *
 * **Note:** This is a best-effort defense layer, not a full-featured sanitizer.
 * For user-controlled rich text, prefer a dedicated library such as DOMPurify.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Strip null bytes before parsing: DOMParser converts \x00 → \ufffd which
  // can split dangerous protocol strings (e.g. "java\x00script:" → "java\ufffds…")
  // and bypass the DANGEROUS_PROTOCOL_RE check in sanitizeAttributes.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching null bytes for XSS sanitization
  const safeHtml = html.replace(/\x00/g, '');

  const doc = parser.parseFromString(safeHtml, 'text/html');

  // TreeWalker visits only Element nodes without allocating a static NodeList.
  // createTreeWalker(root, SHOW_ELEMENT) — NodeFilter.SHOW_ELEMENT = 0x1
  const walker = doc.createTreeWalker(doc, 0x1);
  const toRemove: Element[] = [];

  let node = walker.nextNode();
  while (node !== null) {
    const el = node as Element;
    if (DANGEROUS_TAGS.has(el.tagName)) {
      // Collect for deferred removal — mutating the tree during traversal
      // would invalidate the walker's current position.
      toRemove.push(el);
    } else {
      sanitizeAttributes(el);
    }
    node = walker.nextNode();
  }

  for (const el of toRemove) {
    el.remove();
  }

  // Serialize: combine head and body content.
  const headContent = doc.head ? doc.head.innerHTML : '';
  const bodyContent = doc.body ? doc.body.innerHTML : '';
  const serialized = headContent + bodyContent;

  // Defense-in-depth: re-encode any dangerous tag openers that may survive
  // parser re-serialization (e.g. JSDOM edge cases). Covers all DANGEROUS_TAGS,
  // not just <script>, so the fallback is consistent with the removal pass above.
  const finalized = serialized.replace(
    /<(script|iframe|object|embed|base|meta|applet|noscript|form)(?=[\s/>]|$)/gi,
    (_, tag: string) => `&lt;${tag}`
  );

  // Warn when sanitization changed anything: either the DOM removal pass
  // stripped dangerous tags/attributes, or the defense-in-depth regex had to
  // escape a dangerous tag opener that survived re-serialization (JSDOM edge case).
  // Compare against safeHtml (null-byte-stripped input) rather than the original
  // html to avoid false positives from DOMParser normalization of malformed markup.
  if (finalized !== safeHtml) {
    debug.warn(LOG_PREFIXES.BINDING, ERROR_MESSAGES.UNSAFE_CONTENT());
  }

  return finalized;
}

// ============================================================================
// Security guards (used by binding layer)
// ============================================================================

/**
 * Returns `true` when `attrName` is a URL-bearing attribute and `value`
 * contains a `javascript:` or `vbscript:` protocol.
 * Used by `bindAttr` to guard URL-bearing attributes.
 */
export function isDangerousUrl(attrName: string, value: string): boolean {
  if (!URL_ATTRS.has(attrName.toLowerCase())) return false;
  return DANGEROUS_PROTOCOL_RE.test(value);
}

/**
 * Returns `true` when a CSS property value contains a dangerous protocol
 * inside a `url()` function (e.g. `background-image: url("javascript:…")`).
 */
export function isDangerousCssValue(value: string): boolean {
  // Fast pre-check before running the full regex
  if (!value.toLowerCase().includes('url(')) return false;
  return DANGEROUS_CSS_URL_RE.test(value);
}

// ============================================================================
// Route type guards
// ============================================================================

/** Narrows a `RouteDefinition` to `TemplateRoute`. */
export function isTemplateRoute(r: RouteDefinition): r is TemplateRoute {
  return typeof (r as TemplateRoute).template === 'string';
}

/** Narrows a `RouteDefinition` to `RenderRoute`. */
export function isRenderRoute(r: RouteDefinition): r is RenderRoute {
  return typeof (r as RenderRoute).render === 'function';
}

// ============================================================================
// General utilities
// ============================================================================

/**
 * Shallow equality check for plain objects.
 * Returns `true` if both objects have the same own keys with identical (`===`) values.
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  return keysA.every((key) => objA[key] === objB[key]);
}

/**
 * Computes the Longest Increasing Subsequence (LIS) of old-position indices.
 *
 * Used by `atomList` to minimise DOM moves during reconciliation: items whose
 * old-position index appears in the LIS are already in the correct relative
 * order and do not need to be moved.
 *
 * Sentinel value: `-1` means "not present in the old list" and is skipped.
 *
 * Time complexity: O(N log N). Space complexity: O(N).
 */
export function getLIS(arr: Int32Array | number[]): Int32Array {
  const len = arr.length;
  if (len === 0) return new Int32Array(0);

  // predecessors[i] records the index in `arr` that preceded i in the LIS,
  // or -1 if i was the first element. Initialised to -1 so unvisited slots
  // are distinguishable from a valid predecessor at index 0.
  const predecessors = new Int32Array(len).fill(-1);
  const result = new Int32Array(len);
  let resultLen = 0;

  for (let i = 0; i < len; i++) {
    const val = arr[i];
    // `undefined` can only occur for a plain `number[]` under noUncheckedIndexedAccess;
    // Int32Array always returns a number. Both cases are treated as absent.
    if (val === undefined || val === -1) continue;

    const lastIdx = resultLen > 0 ? result[resultLen - 1] : undefined;
    if (resultLen === 0 || (lastIdx !== undefined && (arr[lastIdx] ?? -1) < val)) {
      predecessors[i] = lastIdx ?? -1;
      result[resultLen++] = i;
      continue;
    }

    // Binary search for the leftmost result position whose value >= val
    let left = 0;
    let right = resultLen - 1;
    while (left < right) {
      const mid = (left + right) >>> 1;
      const midIdx = result[mid];
      if (midIdx !== undefined && (arr[midIdx] ?? -1) < val) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    const leftIdx = result[left];
    if (leftIdx !== undefined && val < (arr[leftIdx] ?? Number.MAX_SAFE_INTEGER)) {
      if (left > 0) {
        predecessors[i] = result[left - 1] ?? -1;
      }
      result[left] = i;
    }
  }

  // Back-track through predecessors to reconstruct the LIS indices.
  const lis = new Int32Array(resultLen);
  if (resultLen > 0) {
    let curr: number | undefined = result[resultLen - 1];
    for (let i = resultLen - 1; i >= 0 && curr !== undefined && curr !== -1; i--) {
      lis[i] = curr;
      curr = predecessors[curr];
    }
  }

  return lis;
}
