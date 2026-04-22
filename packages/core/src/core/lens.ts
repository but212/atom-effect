import { BRAND, BrandFlags } from '@/symbols';
import type { Paths, PathValue, WritableAtom } from '../types';

/**
 * Internal recursive helper for creating deep immutable copies with structural sharing.
 *
 * Logic: Recursively traverses the object path and creates new object/array instances
 * only for modified branches to maintain structural sharing.
 *
 * Optimization: Uses literal string comparisons instead of regular expressions
 * to eliminate path-parsing overhead during deep updates.
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return obj;

  const isObj = obj != null && typeof obj === 'object';
  const curr = (isObj ? obj : {}) as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (Object.is(oldVal, newVal)) return obj;

  if (Array.isArray(curr)) {
    const copy = curr.slice();
    const idx = +key;
    // Logic: Check for valid array index (positive integer, non-empty) to preserve array dense layout.
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
 *
 * Optimization: Uses a simple for-loop and fast string comparisons to avoid
 * performance penalties in hot paths.
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    if (res == null) return undefined;
    const key = parts[i]!;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    res = (res as Record<string, unknown>)[key];
  }
  return res;
}

/**
 * Creates a two-way "lens" for a specific property path on an object-based atom.
 *
 * When to use:
 * - To read/write a specific nested property of an atom without boilerplate.
 * - To create a scoped reactive view of a larger state object.
 * - To pass a slice of state to a component or logic that only cares about a sub-property.
 *
 * @param atom - The source atom containing the object.
 * @param path - Dot-separated path to the target property (e.g., 'user.profile.name').
 * @returns A new writable atom that targets the specific path.
 *
 * @example
 * ```typescript
 * const store = atom({ user: { name: 'Alice' } });
 * const nameLens = atomLens(store, 'user.name');
 *
 * console.log(nameLens.value); // 'Alice'
 * nameLens.value = 'Bob'; // Updates store.user.name immutably
 * ```
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
      // Optimization: Local tracking of prevValue cuts getPathValue calls by 50% during root updates.
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
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * When to use:
 * - Composing an existing lens with a sub-path to create a more specific view.
 *
 * @example
 * ```typescript
 * const userLens = atomLens(store, 'user');
 * const nameLens = composeLens(userLens, 'name');
 * ```
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * When to use:
 * - Creating a lens factory bound to a specific root atom to reduce boilerplate
 *   when creating multiple lenses.
 *
 * @example
 * ```typescript
 * const lensify = lensFor(store);
 * const nameLens = lensify('user.name');
 * const emailLens = lensify('user.email');
 * ```
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
