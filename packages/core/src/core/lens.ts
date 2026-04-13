import { BRAND, BrandFlags } from '@/symbols';
import type { Paths, PathValue, WritableAtom } from '../types';

/** Blocks prototype pollution and dangerous object member access */
const SAFE_KEY_PATTERN = /^(?:__proto__|constructor|prototype)$/;

/**
 * Internal recursive helper for creating deep immutable copies with structural sharing.
 * Only clones nodes along the path where changes occur.
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  if (SAFE_KEY_PATTERN.test(key)) return obj;

  const curr = (obj != null && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (Object.is(oldVal, newVal)) return obj;

  // Handle Array cloning with index awareness
  if (Array.isArray(curr)) {
    const arr = curr.slice();
    const idx = Number(key);
    if (!Number.isNaN(idx) && Number.isInteger(idx)) {
      arr[idx] = newVal;
    } else {
      (arr as unknown as Record<string, unknown>)[key] = newVal;
    }
    return arr;
  }

  return { ...curr, [key]: newVal };
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
    if (SAFE_KEY_PATTERN.test(key)) return undefined;
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
      const unsub = atom.subscribe((np, op) => {
        const nv = getPathValue(np, parts) as PathValue<T, P>,
          ov = getPathValue(op, parts) as PathValue<T, P>;
        if (!Object.is(nv, ov)) listener(nv, ov);
      });
      unsubs.add(unsub);
      return () => {
        unsub();
        unsubs.delete(unsub);
      };
    },
    subscriberCount: () => unsubs.size,
    dispose,
    [Symbol.dispose]: dispose,
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
