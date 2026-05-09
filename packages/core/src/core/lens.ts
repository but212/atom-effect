import { BRAND, BrandFlags } from '@/symbols';
import type { WritableAtom } from '../types';

/**
 * Logic: Numeric Key Conversion
 * Casts numeric string literals to numbers for correct array index typing.
 */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/**
 * Logic: Broad Index Detection
 * Detects if a type has a broad string indexer (e.g., Record<string, any>).
 */
export type HasBroadStringKey<T> = string extends keyof T ? true : false;

/** @public */
export type StringIndexValue<T> = T extends Record<string, infer V> ? V : never;

/** @public */
export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Constraint: Depth limit for recursive path generation to prevent TypeScript
 * recursion errors and IDE lag in complex schemas.
 */
export type MaxDepth = 8;

/**
 * Logic: Recursion Termination
 * Types that stop the recursive path exploration.
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
 * Constraint: If T has a broad string indexer, it returns `string` to avoid
 * infinite union generation.
 */
export type Paths<T, D extends unknown[] = []> = 0 extends 1 & T
  ? string
  : D['length'] extends MaxDepth
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
 * Resolves the type of a value at a given dot-path string.
 */
export type PathValue<T, P extends string> = 0 extends 1 & T
  ? unknown
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
 * Security: Protects internal JS properties from being modified via dot-paths.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * @internal
 * Optimization: Structural Sharing
 * Creates a shallow copy of the container and updates one of its keys.
 * Ensures that unchanged sibling branches retain reference equality.
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

  // Optimization: Fast-path for plain objects (the most common case)
  if (proto === Object.prototype || proto === null) {
    return { ...container, [key]: value };
  }

  // Reason: Ensures class instances maintain their prototype and methods
  // after an immutable update.
  const next = Object.create(proto);
  Object.assign(next, container);
  (next as Record<string, unknown>)[key] = value;
  return next;
}

// ============================================================================
// Core Engine
// ============================================================================

/**
 * Core engine for recursive immutable deep updates.
 *
 * Optimization: Net-zero suppression
 * Returns the original object if the leaf value is identical (Object.is),
 * preventing unnecessary allocation and downstream notifications.
 *
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;

  // Security: Prevent prototype pollution
  // Resilience: Guard against non-object targets in the path
  if (FORBIDDEN_KEYS.has(key) || obj == null || typeof obj !== 'object') {
    return obj;
  }

  // Logic: Heterogeneous Collection Support
  // Uniformly handles entries for both standard objects and Map instances.
  const oldVal = obj instanceof Map ? obj.get(key) : (obj as Record<string, unknown>)[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (Object.is(oldVal, newVal)) {
    return obj;
  }

  return cloneAndSet(obj as object, key, newVal);
}

/**
 * Reads a value from a nested path.
 * Supports standard property access and Map.get().
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
 * Creates a reactive, two-way Lens into a nested atom property.
 *
 * When to use:
 * - When a component only needs a specific sub-field of a complex state object.
 * - To implement "noise filtering": the lens only notifies subscribers if its
 *   specific nested value changes, even if other parts of the root atom update.
 * - For type-safe deep state management.
 *
 * @param atom - The root WritableAtom to project from.
 * @param path - A dot-separated string representing the path to the nested property.
 *
 * @example
 * const user = atom({ profile: { name: 'Alice', score: 10 } });
 * const scoreLens = atomLens(user, 'profile.score');
 *
 * $.effect(() => console.log('Score:', scoreLens.value));
 * scoreLens.value = 20; // Propagates to 'user' atom.
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const parts = (path as string).split('.');

  // Security: Pre-validate path segments to prevent access to forbidden keys.
  const isDangerous = parts.some((p) => FORBIDDEN_KEYS.has(p));

  const listeners = new Set<(nv: unknown, ov: unknown) => void>();
  let sharedUnsub: (() => void) | null = null;
  let prevValue: unknown;

  const getValue = (source: unknown) => (isDangerous ? undefined : getPathValue(source, parts));

  /**
   * Logic: Noise Filtering
   * Only triggers lens subscribers if the resolved leaf value is different
   * from the previously tracked value.
   */
  const notify = () => {
    const nv = getValue(atom.peek());
    if (!Object.is(nv, prevValue)) {
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

      // Optimization: Only write to root if the mutation resulted in a new reference.
      if (next !== cur) {
        atom.value = next as T;
      }
    },
    peek: () => getValue(atom.peek()),
    subscribe(listener: (nv: unknown, ov: unknown) => void) {
      // Optimization: Lazy Subscription
      // The lens only subscribes to the root atom when it has its first listener.
      // It detaches automatically when the last listener disappears.
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
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Chains a lens with a further sub-path to create a more specific lens.
 *
 * @example
 * const userLens = atomLens(rootAtom, 'user');
 * const nameLens = composeLens(userLens, 'name');
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a factory function for generating multiple lenses from a single root atom.
 *
 * @example
 * const fromUser = lensFor(userAtom);
 * const nameLens = fromUser('name');
 * const ageLens = fromUser('age');
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
