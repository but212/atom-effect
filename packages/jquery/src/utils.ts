import type { ComputedAtom, ReactiveValue, ReadonlyAtom } from './types';

/**
 * Checks if a given value is a reactive object (Atom or Computed).
 * A reactive object is expected to have a 'value' property and a 'subscribe' method.
 *
 * @param value - The value to check.
 * @returns True if the value is reactive, false otherwise.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> | ComputedAtom<unknown> {
  return value !== null && typeof value === 'object' && 'value' in value && 'subscribe' in value;
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 * If the source is reactive, it returns its current value; otherwise, it returns the source itself.
 *
 * @template T - The type of the value.
 * @param source - The reactive value or raw value to extract from.
 * @returns The extracted raw value.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  if (isReactive(source)) {
    return (source as ReadonlyAtom<T>).value;
  }
  return source as T;
}

/**
 * Generates a CSS selector string for a DOM element.
 * Accepts both raw Element and JQuery objects for flexibility.
 * This is primarily used for debugging and logging purposes to identify elements.
 *
 * @param el - The DOM element or JQuery object to generate a selector for.
 * @returns A string representing the element's ID, classes, or tag name.
 */
export function getSelector(el: Element | JQuery): string {
  if (!el) return 'unknown';
  // Handle JQuery objects by extracting the first DOM element
  const domEl = 'jquery' in el ? (el as JQuery)[0] : (el as Element);
  if (!domEl) return 'unknown';

  if (domEl.id) return `#${domEl.id}`;
  if (domEl.className) {
    const classes = String(domEl.className).split(/\s+/).filter(Boolean).join('.');
    return classes ? `${domEl.tagName.toLowerCase()}.${classes}` : domEl.tagName.toLowerCase();
  }
  return domEl.tagName.toLowerCase();
}

/**
 * Longest Increasing Subsequence (LIS)
 * Optimized for hardware: Uses Int32Array for memory locality and cache hits.
 * Time Complexity: O(N log N), Space Complexity: O(N) but contiguous.
 */
export function getLIS(arr: Int32Array | number[]): Int32Array {
  const len = arr.length;
  if (len === 0) return new Int32Array(0);

  // predecessors: pointer to previous index in LIS for backtracking (N indices)
  const predecessors = new Int32Array(len);
  // result: indices of the currently found longest increasing subsequence
  const result = new Int32Array(len);
  let resultLen = 0;

  for (let i = 0; i < len; i++) {
    const val = arr[i]!;
    if (val === -1) continue;

    if (resultLen === 0 || arr[result[resultLen - 1]!]! < val) {
      predecessors[i] = resultLen > 0 ? result[resultLen - 1]! : -1;
      result[resultLen++] = i;
      continue;
    }

    // Binary search for insertion point
    let left = 0,
      right = resultLen - 1;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (arr[result[mid]!]! < val) left = mid + 1;
      else right = mid;
    }

    if (val < arr[result[left]!]!) {
      if (left > 0) predecessors[i] = result[left - 1]!;
      result[left] = i;
    }
  }

  // Backtracking to reconstruct the LIS in the correct order
  const lis = new Int32Array(resultLen);
  for (let i = resultLen - 1, v = result[resultLen - 1]!; i >= 0; i--) {
    lis[i] = v;
    v = predecessors[v]!;
  }

  return lis;
}

const camelCache: Record<string, string> = Object.create(null);

/**
 * Converts a dash-case string to camelCase with caching for performance.
 * Used for CSS property conversions during reactive binding.
 */
export function toCamelCase(str: string): string {
  if (str in camelCache) return camelCache[str]!;

  if (!str.includes('-')) {
    camelCache[str] = str;
    return str;
  }

  const camel = str.replace(/-./g, (match) => match.charAt(1).toUpperCase());
  camelCache[str] = camel;
  return camel;
}
