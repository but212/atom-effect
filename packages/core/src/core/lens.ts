import { BRAND, BrandFlags } from '@/symbols';
import type { Paths, PathValue, WritableAtom } from '../types';

/**
 * Creates a deep immutable copy with a new leaf value.
 *
 * Why:
 * To ensure that only the modified branch of the object tree is recreated,
 * preserving reference equality for all unchanged sibling branches. This
 * maximizes performance in downstream `memo` or `equal` checks.
 *
 * Caution: Prototype Pollution
 * Segments like `__proto__` are explicitly ignored to prevent security
 * vulnerabilities during recursive path traversal.
 *
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  if (key === '__proto__' || key === 'constructor' || key === 'prototype') return obj;

  const isObj = obj != null && typeof obj === 'object';
  const curr = (isObj ? obj : {}) as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  // Optimization: If the leaf value is identical, return the original branch.
  if (Object.is(oldVal, newVal)) return obj;

  const res = (Array.isArray(curr) ? [...curr] : { ...curr }) as Record<string, unknown>;
  res[key] = newVal;
  return res;
}

/**
 * Safely resolves a nested value from a source object.
 * @internal
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  for (let i = 0; i < parts.length; i++) {
    if (res == null) return undefined;
    res = (res as Record<string, unknown>)[parts[i]!];
  }
  return res;
}

/**
 * Creates a two-way reactive view (Lens) for a nested property.
 *
 * When to use:
 * - To observe or mutate a specific field in a large state object.
 * - To minimize re-renders by only notifying when the specific field changes.
 *
 * Logic: Upstream Propagation
 * Setting a value on the lens triggers an immutable update on the root atom
 * using `setDeepValue`.
 *
 * Logic: Noise Filtering
 * The lens subscription only triggers its listeners if the resolved
 * nested value has changed, ignoring updates to other branches of the
 * root object.
 *
 * @example
 * ```typescript
 * const store = atom({ user: { id: 1, name: 'Bob' } });
 * const nameLens = atomLens(store, 'user.name');
 *
 * nameLens.subscribe(name => console.log(name)); // Only logs if name changes
 * nameLens.value = 'Alice'; // Root store is now { user: { id: 1, name: 'Alice' } }
 * ```
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>>;
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const parts = (path as string).split('.');
  const isDangerous = parts.some(
    (p) => p === '__proto__' || p === 'constructor' || p === 'prototype'
  );
  const unsubs = new Set<() => void>();

  const getValue = isDangerous ? () => undefined : (src: unknown) => getPathValue(src, parts);

  return {
    get value() {
      return getValue(atom.value);
    },
    set value(newVal: unknown) {
      if (isDangerous) return;
      const cur = atom.peek();
      const next = setDeepValue(cur, parts, 0, newVal);
      if (next !== cur) atom.value = next as T;
    },
    peek: () => getValue(atom.peek()),
    subscribe(listener: (nv: unknown, ov: unknown) => void) {
      let prevValue = getValue(atom.peek());

      const unsub = atom.subscribe((np) => {
        const nv = getValue(np);
        // Logic: Scoped Notification
        // Only notify the lens subscriber if the resolved slice is different.
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
    dispose: () => {
      unsubs.forEach((u) => u());
      unsubs.clear();
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Composes an existing lens with a sub-path.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Factory for creating multiple lenses bound to a single root atom.
 *
 * @example
 * ```typescript
 * const useLens = lensFor(configAtom);
 * const theme = useLens('ui.theme');
 * const locale = useLens('lang.locale');
 * ```
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
