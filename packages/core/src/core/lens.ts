import { BRAND, BrandFlags } from '@/symbols';
import type { Paths, PathValue, WritableAtom } from '../types';

/**
 * Internal recursive helper for creating deep immutable copies with structural sharing.
 * Optimized for performance: avoids Regex overhead and minimizes object allocations.
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  // Fast string-based safety check instead of Regex
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return obj;

  const isObj = obj != null && typeof obj === 'object';
  const curr = (isObj ? obj : {}) as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  // Return original if value is unchanged (structural sharing)
  if (Object.is(oldVal, newVal)) return obj;

  if (Array.isArray(curr)) {
    const copy = curr.slice();
    const idx = +key;
    // Check for valid array index (positive integer, non-empty)
    if (key.trim() !== '' && idx >= 0 && idx % 1 === 0) {
      copy[idx] = newVal;
    } else {
      (copy as unknown as Record<string, unknown>)[key] = newVal;
    }
    return copy;
  }

  const res = { ...curr };
  res[key] = newVal;
  return res;
}

/**
 * Helper to retrieve a nested value from an object/array at a given path.
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    if (res == null) return undefined;
    const key = parts[i]!;
    // Performance: Fast string comparison avoids Regex overhead in hot paths
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    res = (res as Record<string, unknown>)[key];
  }
  return res;
}

/**
 * Creates a two-way "lens" for a specific property path on an object-based atom.
 *
 * @example
 * const store = atom({ user: { name: 'Alice' } });
 * const nameLens = atomLens(store, 'user.name');
 * console.log(nameLens.value); // 'Alice'
 * nameLens.value = 'Bob'; // Updates store.user.name immutably
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const parts = path.includes('.') ? path.split('.') : [path];
  const unsubs = new Set<() => void>();
  const dispose = () => {
    unsubs.forEach((u) => u());
    unsubs.clear();
  };

  return {
    get value() {
      return getPathValue(atom.value, parts) as PathValue<T, P>;
    },
    set value(newVal: PathValue<T, P>) {
      const cur = atom.peek(),
        next = setDeepValue(cur, parts, 0, newVal);
      if (next !== cur) atom.value = next as T;
    },
    peek: () => getPathValue(atom.peek(), parts) as PathValue<T, P>,
    subscribe(listener: (nv: PathValue<T, P>, ov: PathValue<T, P>) => void) {
      // Local tracking of prevValue cuts getPathValue calls by 50% during root updates
      let prevValue = getPathValue(atom.peek(), parts) as PathValue<T, P>;

      const unsub = atom.subscribe((np) => {
        const nv = getPathValue(np, parts) as PathValue<T, P>;
        if (!Object.is(nv, prevValue)) {
          const ov = prevValue;
          prevValue = nv;
          listener(nv, ov);
        }
      });
      unsubs.add(unsub);
      return () => {
        unsub();
        unsubs.delete(unsub);
      };
    },
    subscriberCount: () => unsubs.size,
    dispose,
    // [Symbol.dispose]: dispose,
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Composes an existing lens with a sub-path to create a deeper lens.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a lens factory bound to a specific atom.
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
