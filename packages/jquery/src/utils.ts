import { isAtom, isComputed } from '@but212/atom-effect';
import type { ComputedAtom, ReactiveValue, ReadonlyAtom } from './types';

/**
 * Checks if a given value is a reactive object (Atom or Computed).
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> | ComputedAtom<unknown> {
  return isAtom(value) || isComputed(value);
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  return isReactive(source) ? source.value : (source as T);
}

/**
 * Generates a CSS selector string for a DOM element.
 * Optimized for zero-allocation parsing using native classList.
 */
export function getSelector(el: Element | JQuery): string {
  if (!el) return 'unknown';
  const dom = 'jquery' in el ? (el as JQuery)[0] : (el as Element);
  if (!dom) return 'unknown';

  const id = dom.id;
  if (id && typeof id === 'string') return `#${id}`;

  const tagName = dom.tagName.toLowerCase();
  const classes = dom.classList;

  if (classes && classes.length > 0) {
    let res = tagName;
    for (let i = 0, len = classes.length; i < len; i++) {
      const cls = classes[i];
      if (cls) res += `.${cls}`;
    }
    return res;
  }
  return tagName;
}

/**
 * Basic HTML sanitization for XSS mitigation.
 * Note: This is NOT a replacement for a full-featured sanitizer like DOMPurify.
 * It prevents common attacks like <script> tags and javascript: protocols.
 */
export function sanitizeHtml(html: string): string {
  let safe = String(html ?? '');

  // 0. Pre-process: Remove null bytes and control characters (bypass vectors)
  // These are often used to bypass regex filters while browsers ignore them
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
  safe = safe.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // 1. Remove dangerous tags entirely (content included or tag stripped)
  // Lightweight first pass — DOMPurify handles the full sanitization.
  // Note: svg/math are NOT removed — they have legitimate uses (icons, equations).
  // Their event handlers (on*) are already neutralized in step 3.
  // Also remove processing instructions <? ... ?> which can be abused in some contexts
  safe = safe.replace(/<\?[\s\S]*?\?>/g, '');

  // Loop tag removal to prevent nested reassembly bypass (e.g. "<scr<script>ipt>")
  const dangerousTagPattern =
    /(<(script|iframe|object|embed|base|meta|applet|noscript)\b[^>]*>([\s\S]*?)<\/\2>|<(script|iframe|object|embed|base|meta|applet|noscript)\b[^>]*\/?>)/gim;
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
  // expression(...), behavior:url(...)
  safe = safe
    .replace(/expression\s*\(/gim, 'data-unsafe-css(')
    .replace(/behavior\s*:/gim, 'data-unsafe-css:');

  return safe;
}

/**
 * Checks if a given attribute value contains a dangerous protocol (javascript:, vbscript:).
 * Used by atomAttr/bindAttr to guard URL-bearing attributes.
 */
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

export function isDangerousUrl(attrName: string, value: string): boolean {
  if (!URL_ATTRS.has(attrName.toLowerCase())) return false;
  return DANGEROUS_PROTOCOL_RE.test(value);
}

/**
 * Checks if a CSS value contains dangerous protocols in url() functions.
 * e.g. background-image: url("javascript:alert(1)")
 */
export function isDangerousCssValue(value: string): boolean {
  // fast check for url(
  if (!value.toLowerCase().includes('url(')) return false;

  // Check for dangerous protocols inside url(...)
  // Pattern matches: url(  ['"]?  protocol:
  const dangerousCssUrlRe = /url\s*\(\s*(?:["']?\s*)?(?:javascript|vbscript)\s*:/i;
  return dangerousCssUrlRe.test(value);
}

/**
 * Shallow equality check for plain objects.
 * Returns true if both objects have the same keys with identical values (===).
 */
export function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  const objB = b as Record<string, unknown>;
  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if ((a as Record<string, unknown>)[key] !== objB[key]) return false;
  }
  return true;
}

/**
 * Longest Increasing Subsequence (LIS)
 * Optimized for hardware and TypeScript strict null checks.
 * Time Complexity: O(N log N), Space Complexity: $O(N)$.
 */
export function getLIS(arr: Int32Array | number[]): Int32Array {
  const len = arr.length;
  if (len === 0) return new Int32Array(0);

  const predecessors = new Int32Array(len);
  const result = new Int32Array(len);
  let resultLen = 0;

  for (let i = 0; i < len; i++) {
    const val = arr[i];
    if (val === undefined || val === -1) continue;

    const lastIdx = resultLen > 0 ? result[resultLen - 1] : undefined;
    if (resultLen === 0 || (lastIdx !== undefined && (arr[lastIdx] ?? -1) < val)) {
      predecessors[i] = lastIdx ?? -1;
      result[resultLen++] = i;
      continue;
    }

    // Binary search for insertion point
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
