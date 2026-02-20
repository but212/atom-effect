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
 * HTML sanitization for XSS mitigation using regex-based filtering.
 *
 * Faster than DOMParser but relies on pattern matching.
 * Neutralizes dangerous attributes (on*, protocols) instead of removing them entirely.
 *
 * **Note:** This is a best-effort defense layer, not a full-featured sanitizer.
 * For user-controlled rich text, prefer a dedicated library such as DOMPurify.
 */
export function sanitizeHtml(html: string): string {
  let safe = String(html ?? '');

  // 0. Pre-process: Remove null bytes and control characters (bypass vectors)
  // These are often used to bypass regex filters while browsers ignore them
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
  safe = safe.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  const baseline = safe;

  // 1. Remove dangerous tags entirely (content included or tag stripped)
  // Lightweight first pass — DOMPurify handles the full sanitization.
  // Note: svg/math are NOT removed — they have legitimate uses (icons, equations).
  // Their event handlers (on*) are already neutralized in step 3.
  // Also remove processing instructions <? ... ?> which can be abused in some contexts
  safe = safe.replace(/<\?[\s\S]*?\?>/g, '');

  // Loop tag removal to prevent nested reassembly bypass (e.g. "<scr<script>ipt>")
  const dangerousTagPattern =
    /(<(script|iframe|object|embed|base|meta|applet|noscript|form)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript|form)\b[^>]*\/?>)/gim;
  let prev: string;
  do {
    prev = safe;
    safe = safe.replace(dangerousTagPattern, '');
  } while (safe !== prev);

  // 2. Neutralize dangerous protocols (javascript:, vbscript:)
  // Simple whitespace-tolerant regex. Entity-based obfuscation is left to DOMPurify.
  // Step 0 already strips null bytes/control chars, so basic spacing tricks are caught here.
  const protocolRegex =
    /(j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t|v\s*b\s*s\s*c\s*r\s*i\s*p\s*t)\s*:/gi;
  safe = safe.replace(protocolRegex, 'data-unsafe-protocol:');

  // Separately handle dangerous data URIs (e.g. text/html, base64 encoded scripts)
  // Allows common inline images (data:image/...) including SVG while blocking executable payloads.
  const dangerousDataUriRegex =
    /data\s*:\s*(?:text\/html|application\/javascript|text\/javascript|text\/vbscript|text\/xml|application\/xhtml\+xml)/gim;
  safe = safe.replace(dangerousDataUriRegex, 'data-unsafe-protocol:');

  // 3. Neutralize event handlers (on* attributes)
  // Replaces "onclick=" with "data-unsafe-attr="
  safe = safe.replace(/\bon\w+\s*=/gim, 'data-unsafe-attr=');

  // 4. Neutralize CSS expressions (IE legacy but dangerous) and behavior
  safe = safe.replace(new RegExp(DANGEROUS_CSS_RE, 'gim'), 'data-unsafe-css:');

  if (safe !== baseline) {
    debug.warn(LOG_PREFIXES.BINDING, ERROR_MESSAGES.UNSAFE_CONTENT());
  }

  return safe;
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
