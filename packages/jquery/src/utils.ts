import type { ComputedAtom, ReactiveValue, ReadonlyAtom } from './types';

/**
 * Checks if a given value is a reactive object (Atom or Computed).
 * Robust check for correctness: must have both 'value' property and 'subscribe' method.
 */
export function isReactive(value: unknown): value is ReadonlyAtom<unknown> | ComputedAtom<unknown> {
  return value !== null && typeof value === 'object' && 'value' in value && 'subscribe' in value;
}

/**
 * Extracts the underlying raw value from a ReactiveValue.
 * Optimized for hot path by inlining the reactive check with high correctness.
 */
export function getValue<T>(source: ReactiveValue<T>): T {
  if (source !== null && typeof source === 'object' && 'value' in source && 'subscribe' in source) {
    return (source as ReadonlyAtom<T>).value;
  }
  return source as T;
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
