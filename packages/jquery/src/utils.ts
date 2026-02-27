import type { ReadonlyAtom } from '@but212/atom-effect';
import { isAtom } from '@but212/atom-effect';
import type { RenderRoute, RouteDefinition, TemplateRoute } from './types';

// ============================================================================
// Reactive helpers
// ============================================================================

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

// ============================================================================
// DOM helpers
// ============================================================================

/**
 * Generates a CSS selector-like string for a DOM element, suitable for debug
 * output. Returns `tagName#id` when an id is present, otherwise
 * `tagName.class1.class2…`.
 *
 * ⚠ Not a valid CSS selector — do NOT pass this to `querySelector()`.
 * Element IDs and class names may contain characters with special meaning in
 * CSS selectors (e.g. `.`, `[`, `(`). This helper is intended solely for
 * human-readable console/log messages.
 */
export function getSelector(el: Element): string {
  const tagName = el.tagName.toLowerCase();
  if (el.id) return `${tagName}#${el.id}`;

  const list = el.classList;
  const len = list.length;
  if (len === 0) return tagName;

  let selector = tagName;
  for (let i = 0; i < len; i++) {
    selector += `.${list[i]!}`;
  }
  return selector;
}

// ============================================================================
// Shared low-level helpers
// ============================================================================

/** Portable own-property check. Prefer over `in` to exclude prototype keys. */
export const hasOwn = Object.prototype.hasOwnProperty;

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
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;

  for (let i = 0; i < keysA.length; i++) {
    const key = keysA[i]!;
    if (!hasOwn.call(objB, key) || objA[key] !== objB[key]) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// DOM reconciliation algorithm
// ============================================================================

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
