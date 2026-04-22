import { BRAND, BrandFlags } from '@/symbols';
import type { Paths, PathValue, WritableAtom } from '../types';

/**
 * Creates a deep immutable copy of an object or array with a new value assigned at the specified path.
 *
 * Logic: Recursively traverses the object tree following the provided keys. It utilizes
 * structural sharing by only creating new object or array instances for the branches
 * affected by the update, while preserving references to unchanged sibling branches.
 *
 * @param obj - The source object or array to update.
 * @param keys - An array of path segments leading to the target property.
 * @param index - The current depth in the recursive traversal.
 * @param value - The new value to assign at the target path.
 * @returns A new object or array containing the updated value, or the original reference if no change occurred.
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  // Constraint: Block access to internal prototypes to prevent prototype pollution vulnerabilities.
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return obj;

  const isObj = obj != null && typeof obj === 'object';
  const curr = (isObj ? obj : {}) as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  // Optimization: Return the original reference if the value at the path remains identical (Object.is).
  if (Object.is(oldVal, newVal)) return obj;

  if (Array.isArray(curr)) {
    const copy = curr.slice();
    const idx = +key;
    // Logic: Validate the key as a numeric index to maintain a dense array layout where possible.
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
 * Retrieves a nested value from an object or array at the specified path.
 *
 * @param source - The object or array to traverse.
 * @param parts - An array of path segments.
 * @returns The value at the path, or undefined if the path is invalid or the source is nullish.
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  const len = parts.length;
  // Optimization: Uses a simple for-loop for traversal to minimize overhead in hot paths.
  for (let i = 0; i < len; i++) {
    if (res == null) return undefined;
    const key = parts[i]!;
    // Constraint: Prevent access to internal prototypes.
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
    res = (res as Record<string, unknown>)[key];
  }
  return res;
}

/**
 * Creates a two-way reactive "lens" for a specific nested property path.
 *
 * When to use:
 * - To read or write a specific sub-property of a large object-based atom without manual boilerplate.
 * - To create a scoped reactive view that only notifies when a specific nested property changes.
 * - To pass a slice of state to a child component or utility that only requires a subset of the root state.
 *
 * @param atom - The source atom containing the object.
 * @param path - A dot-separated string representing the path to the target property (e.g., 'profile.address.city').
 * @returns A new writable atom targeting the specified path.
 *
 * @example
 * ```typescript
 * import { atom, atomLens } from '@but212/atom-effect';
 *
 * const user = atom({ name: 'Alice', settings: { theme: 'dark' } });
 * const themeLens = atomLens(user, 'settings.theme');
 *
 * console.log(themeLens.value); // 'dark'
 * themeLens.value = 'light';    // Immutably updates the root 'user' atom.
 * ```
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  // Optimization: Pre-split the path string once during creation to avoid string manipulation during property access.
  const parts = path.includes('.') ? path.split('.') : [path];
  const unsubs = new Set<() => void>();

  /**
   * Terminates all internal subscriptions maintained by the lens.
   */
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
      // Logic: Cache the previous value locally to ensure that notifications are only
      // dispatched when the specific nested property changes, even if other parts of
      // the root atom are updated.
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
 * Composes an existing lens with a sub-path to create a more specific scoped view.
 *
 * When to use:
 * - To further drill down into an already existing lens.
 *
 * @param lens - The source lens atom.
 * @param path - Dot-separated sub-path relative to the lens.
 * @returns A new writable atom targeting the nested sub-path.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a lens factory bound to a specific root atom.
 *
 * When to use:
 * - To reduce boilerplate when creating multiple lenses from the same root atom.
 *
 * @param atom - The root atom to bind to.
 * @returns A factory function that accepts paths to create lenses.
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
