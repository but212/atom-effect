/**
 * @module LensEngine
 *
 * Responsibility:
 * Provides two-way reactive lenses for type-safe deep state management.
 * Orchestrates immutable deep updates with structural sharing and path flattening.
 *
 * Design Intent:
 * Enables granular subscriptions to nested properties of complex state objects,
 * minimizing re-renders and preventing prototype pollution through strict
 * security guards.
 */

import { shallowEqual } from '@but212/atom-effect-utils';
import { BRAND, BrandFlags, DEFAULT_EQUAL, type LENS_CONFIG } from '@/constants';
import { batch } from '@/index';
import type { Equal, MergedDependencyValue, WritableAtom } from '@/types';
import { mergeAtomValues } from '@/utils';

/**
 * Logic: Numeric Key Conversion
 * Casts numeric string literals to numbers to ensure correct array index typing.
 */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/**
 * Logic: Broad Index Detection
 * Detects if a type contains a broad string indexer (e.g., Record<string, any>).
 */
export type HasBroadStringKey<T> = string extends keyof T ? true : false;

/** @public */
export type StringIndexValue<T> = T extends Record<string, infer V> ? V : never;

/** @public */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Logic: Recursion Termination
 * Defines primitive and built-in types that terminate recursive path exploration.
 */
export type TerminalTypes =
  | Date
  | RegExp
  | Map<unknown, unknown>
  | Set<unknown>
  | Promise<unknown>
  | Function;

/**
 * Computes a union of all valid dot-separated paths for type T.
 *
 * Constraint: Recursion Safety
 * If T contains a broad string indexer, it returns `string` to prevent
 * infinite union generation and TypeScript recursion errors.
 */
export type Paths<T, D extends unknown[] = []> =
  // biome-ignore lint/suspicious/noExplicitAny: 'any' check is required to prevent infinite recursion in paths
  Equal<T, any> extends true
    ? string
    : D['length'] extends typeof LENS_CONFIG.MAX_PATH_DEPTH
      ? never
      : T extends TerminalTypes
        ? never
        : T extends readonly unknown[]
          ? NonNullable<ArrayElement<T>> extends object
            ? `${number}` | `${number}.${Paths<NonNullable<ArrayElement<T>>, [...D, 1]>}`
            : `${number}`
          : T extends object
            ? HasBroadStringKey<T> extends true
              ? string
              : {
                  [K in keyof T & (string | number)]: T[K] extends Function
                    ? never
                    : NonNullable<T[K]> extends object
                      ? `${K}` | `${K}.${Paths<NonNullable<T[K]>, [...D, 1]>}`
                      : `${K}`;
                }[keyof T & (string | number)]
            : never;

/**
 * Logic: Path Resolution
 * Resolves the type of the value located at a specific dot-path string.
 */
export type PathValue<T, P extends string> =
  // biome-ignore lint/suspicious/noExplicitAny: 'any' check is required for correct path resolution
  Equal<T, any> extends true
    ? // biome-ignore lint/suspicious/noExplicitAny: 'any' check is required for correct path resolution
      any
    : P extends `${infer K}.${infer Rest}`
      ? NonNullable<T> extends readonly unknown[]
        ? K extends `${number}`
          ? PathValue<NonNullable<ArrayElement<NonNullable<T>>>, Rest>
          : never
        : HasBroadStringKey<NonNullable<T>> extends true
          ? PathValue<NonNullable<StringIndexValue<NonNullable<T>>>, Rest>
          : StringKeyToNumber<K> extends keyof NonNullable<T>
            ? PathValue<
                NonNullable<NonNullable<T>[StringKeyToNumber<K> & keyof NonNullable<T>]>,
                Rest
              >
            : never
      : NonNullable<T> extends readonly unknown[]
        ? P extends `${number}`
          ? NonNullable<ArrayElement<NonNullable<T>>>
          : never
        : HasBroadStringKey<NonNullable<T>> extends true
          ? NonNullable<StringIndexValue<NonNullable<T>>>
          : StringKeyToNumber<P> extends keyof NonNullable<T>
            ? NonNullable<T>[StringKeyToNumber<P> & keyof NonNullable<T>]
            : never;

/**
 * Security: Prototype Pollution Guard
 * Protects internal JavaScript properties from unauthorized modification via dot-paths.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @internal */
const isForbiddenKey = (key: string) => FORBIDDEN_KEYS.has(key);

/**
 * Optimization: Structural Sharing
 * Creates a shallow copy of the container and updates a specific key.
 * Ensures that unchanged sibling branches maintain reference equality.
 *
 * Reason:
 * By maintaining reference equality for unchanged branches, we allow
 * downstream reactive nodes to perform net-zero suppression.
 *
 * @internal
 */
function cloneAndSet(container: object, key: string, value: unknown): object {
  if (Array.isArray(container)) {
    const next = [...container];
    (next as unknown as Record<string, unknown>)[key] = value;
    return next;
  }

  if (container instanceof Map) {
    const next = new Map(container);
    next.set(key, value);
    return next;
  }

  const proto = Object.getPrototypeOf(container);

  // Optimization: Fast-path for plain objects.
  if (proto === Object.prototype || proto === null) {
    return { ...container, [key]: value };
  }

  // Logic: Class Instance Preservation
  // Ensures class instances maintain their prototype chain and methods
  // after an immutable update.
  const next = Object.create(proto);
  Object.assign(next, container);
  (next as Record<string, unknown>)[key] = value;
  return next;
}

// ============================================================================
// Core Engine
// ============================================================================

/** @internal */
interface LensInternal<T = unknown> extends WritableAtom<T> {
  _root: WritableAtom<object>;
  _path: string;
}

/**
 * Logic: Immutable Deep Update
 * Performs a recursive update along a key path.
 *
 * Optimization: Net-zero Suppression
 * Returns the original object if the new leaf value is identical (via Object.is),
 * preventing unnecessary allocations and downstream notification cascades.
 *
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;

  // Resilience: Terminates update if the target path is non-traversable.
  if (obj == null || typeof obj !== 'object' || isForbiddenKey(key)) {
    return obj;
  }

  // Logic: Heterogeneous Collection Support (Object, Array, Map)
  const oldVal = obj instanceof Map ? obj.get(key) : (obj as Record<string, unknown>)[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (DEFAULT_EQUAL(oldVal, newVal)) {
    return obj;
  }

  return cloneAndSet(obj as object, key, newVal);
}

/**
 * Logic: Deep Read
 * Traverses a source object to retrieve a value at a specified path.
 * Supports standard properties and Map collections.
 *
 * @internal
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    if (res == null) return undefined;
    if (res instanceof Map) {
      res = res.get(parts[i]);
    } else {
      res = (res as Record<string, unknown>)[parts[i]!];
    }
  }
  return res;
}

/**
 * Creates a reactive, two-way Lens into a nested property of an atom.
 *
 * When to use:
 * - To expose a specific sub-field of a complex state object to a component.
 * - To implement "noise filtering": the lens only notifies subscribers if its
 *   target nested value changes, regardless of other root atom updates.
 * - For type-safe deep state manipulation without manual boilerplate.
 *
 * @param atom - The root WritableAtom to project from.
 * @param path - A dot-separated string representing the path to the property.
 * @returns A WritableAtom that synchronizes with the nested property.
 *
 * @example
 * ```typescript
 * import { atom, atomLens, effect } from '@but212/atom-effect';
 *
 * const user = atom({ profile: { name: 'Alice', score: 10 } });
 * const scoreLens = atomLens(user, 'profile.score');
 *
 * effect(() => console.log('Score updated:', scoreLens.value));
 *
 * scoreLens.value = 20; // Propagates update to 'user' atom and triggers effect.
 * ```
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  // Optimization: Path Flattening
  // If the target is already a lens, paths are merged to avoid deep
  // subscription chains and redundant intermediate notifications.
  const brand = (atom as unknown as { [BRAND]?: number })[BRAND] || 0;
  if ((brand & BrandFlags.Lens) !== 0) {
    const parent = atom as unknown as LensInternal<T>;
    const combined = `${parent._path}.${path}` as P;
    return atomLens(parent._root as WritableAtom<T>, combined) as WritableAtom<PathValue<T, P>>;
  }

  const parts = (path as string).split('.');
  const isDangerous = parts.some(isForbiddenKey);

  let sharedUnsub: (() => void) | null = null;
  let prevValue: unknown;
  const listeners = new Set<(nv: unknown, ov: unknown) => void>();

  const getValue = (source: unknown) => (isDangerous ? undefined : getPathValue(source, parts));

  const notify = () => {
    const nv = getValue(atom.peek());
    if (!DEFAULT_EQUAL(nv, prevValue)) {
      const ov = prevValue;
      prevValue = nv;
      listeners.forEach((l) => l(nv, ov));
    }
  };

  return {
    get value() {
      return getValue(atom.value);
    },
    set value(newVal: unknown) {
      if (isDangerous) return;
      const cur = atom.peek();
      const next = setDeepValue(cur, parts, 0, newVal);

      if (next !== cur) {
        atom.value = next as T;
      }
    },
    peek: () => getValue(atom.peek()),
    subscribe(listener: (nv: unknown, ov: unknown) => void) {
      if (listeners.size === 0) {
        prevValue = getValue(atom.peek());
        sharedUnsub = atom.subscribe(notify);
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && sharedUnsub) {
          sharedUnsub();
          sharedUnsub = null;
        }
      };
    },
    subscriberCount: () => listeners.size,
    dispose: () => {
      sharedUnsub?.();
      sharedUnsub = null;
      listeners.clear();
    },
    // Metadata for path flattening logic
    _root: atom,
    _path: path as string,
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable | BrandFlags.Lens,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Chains a lens with a further sub-path to create a more specific projection.
 *
 * @param lens - The existing lens to extend.
 * @param path - The additional sub-path to append.
 *
 * @example
 * ```typescript
 * const userLens = atomLens(rootAtom, 'user');
 * const nameLens = composeLens(userLens, 'name');
 * ```
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a factory for generating multiple lenses from a single root atom.
 *
 * @param atom - The root atom to project from.
 * @returns A factory function that accepts a path and returns a lens.
 *
 * @example
 * ```typescript
 * const fromUser = lensFor(userAtom);
 * const nameLens = fromUser('name');
 * const ageLens = fromUser('age');
 * ```
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);

/**
 * Logic: Two-way Snapshot Merging
 * Merges multiple writable lenses into a single unified lens with a flattened type.
 * Updates to the merged lens are distributed back to the individual source lenses
 * within a single atomic batch.
 *
 * @param lenses - A variadic list of lenses to merge.
 * @returns A unified WritableAtom.
 *
 * @example
 * ```typescript
 * const merged = mergeLenses(nameLens, scoreLens);
 * merged.value = { name: 'Bob', score: 25 }; // Batched update to source atoms.
 * ```
 */
export function mergeLenses<L extends WritableAtom<unknown>[]>(
  ...lenses: L
): WritableAtom<MergedDependencyValue<L>> {
  type MergedValue = MergedDependencyValue<L>;

  let prevValue: MergedValue | undefined;
  const listeners = new Set<(nv?: MergedValue, ov?: MergedValue) => void>();
  const unsubs: (() => void)[] = [];

  const notify = () => {
    const nv = mergeAtomValues(lenses, true) as MergedValue;
    if (!shallowEqual(nv, prevValue)) {
      const ov = prevValue;
      prevValue = nv;
      for (const listener of listeners) {
        listener(nv, ov);
      }
    }
  };

  return {
    get value() {
      return mergeAtomValues(lenses) as MergedValue;
    },
    set value(newVal: MergedValue) {
      batch(() => {
        for (let i = 0; i < lenses.length; i++) {
          lenses[i]!.value = newVal;
        }
      });
    },
    peek: () => mergeAtomValues(lenses, true) as MergedValue,
    subscribe: (listener: (nv?: MergedValue, ov?: MergedValue) => void) => {
      if (listeners.size === 0) {
        prevValue = mergeAtomValues(lenses, true) as MergedValue;
        for (let i = 0; i < lenses.length; i++) {
          unsubs.push(lenses[i]!.subscribe(notify));
        }
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          for (const unsub of unsubs) unsub();
          unsubs.length = 0;
        }
      };
    },
    subscriberCount: () => listeners.size,
    dispose: () => {
      for (const unsub of unsubs) unsub();
      unsubs.length = 0;
      listeners.clear();
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<MergedValue>;
}
