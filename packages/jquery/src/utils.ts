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

  const tagName = dom.tagName.toLowerCase();
  const id = dom.id;
  if (id) return `${tagName}#${id}`;

  const classes = dom.classList;
  let selector = tagName;

  if (classes && classes.length > 0) {
    for (let i = 0; i < classes.length; i++) {
      selector += `.${classes[i]}`;
    }
  }

  return selector;
}

/**
 * Basic HTML sanitization for XSS mitigation.
 * Note: This is NOT a replacement for a full-featured sanitizer like DOMPurify.
 * It prevents common attacks like <script> tags and javascript: protocols.
 * 
 * Advanced HTML sanitization using native DOMParser.
 * Parses HTML, traverses the tree, and removes dangerous tags/attributes.
 * Much more robust than regex-based approaches.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // 0. Pre-process: Remove null bytes and control characters (bypass vectors)
  // These are often used to bypass filters while browsers ignore them
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Intentionally matching control characters for XSS sanitization
  const safeHtml = html.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  const parser = new DOMParser();
  const doc = parser.parseFromString(safeHtml, 'text/html');

  // 1. Remove dangerous tags
  const dangerousTags = [
    'script',
    'iframe',
    'object',
    'embed',
    'base',
    'meta',
    'applet',
    'noscript',
    'form',
  ];
  dangerousTags.forEach((tag) => {
    // Query entire doc to catch head/body items
    const nodes = doc.querySelectorAll(tag);
    nodes.forEach((node) => node.remove());
  });

  // 2. Clear dangerous attributes (on*, javascript:)
  const allElements = doc.querySelectorAll('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    if (!el) continue;
    const attrs = el.attributes;

    // Reverse loop because we might remove attributes
    for (let j = attrs.length - 1; j >= 0; j--) {
      const attr = attrs[j];
      if (!attr) continue;
      const name = attr.name.toLowerCase();
      const val = attr.value.toLowerCase();

      // Remove event handlers
      if (name.startsWith('on')) {
        el.removeAttribute(name);
        continue;
      }

      // Remove dangerous protocols in URL attributes
      if (URL_ATTRS.has(name) && DANGEROUS_PROTOCOL_RE.test(val)) {
        el.removeAttribute(name);
        continue;
      }

      // Remove dangerous data URIs
      // Matches data:text/html, data:application/javascript, etc.
      if (val.trim().startsWith('data:') && !val.trim().startsWith('data:image/')) {
        el.removeAttribute(name);
        continue;
      }

      // 3. Special handling for 'style' attributes (Internal string sanitization)
      if (name === 'style' && DANGEROUS_CSS_RE.test(attr.value)) {
        // We could selectively strip parts, but total removal of the attribute is safer for suspicious CSS
        el.removeAttribute(name);
      }
    }
  }

  // Serialize: combine head (for styles) and body.
  // doc.head might be null if no head parsed, doc.body might be null (unlikely but safe to check)
  const headContent = doc.head ? doc.head.innerHTML : '';
  const bodyContent = doc.body ? doc.body.innerHTML : '';

  // Final pass: Encode any remaining <script strings to capture text nodes
  // that might look like tags but were parsed as text (e.g. <scr<script>ipt>)
  // This is defense-in-depth against parser confusion vectors.
  return (headContent + bodyContent).replace(/<script/gi, '&lt;script');
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

/** Regex to match dangerous CSS properties and functions (e.g., expression(), behavior:, javascript:). */
const DANGEROUS_CSS_RE =
  /(?:expression\(|behavior\s*:|(?:\\[0-9a-f]{1,6}\s*|[\s\x00-\x20\/'"])*j\s*a\s*v\s*a\s*s\s*c\s*r\s*i\s*p\s*t\s*:)/i;

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
