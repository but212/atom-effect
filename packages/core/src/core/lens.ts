import { BRAND, BrandFlags } from '@/symbols';
import type { WritableAtom } from '../types';

/** Casts numeric string literals to numbers for correct array index typing. */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/** Detects if a type has a broad string indexer (e.g., Record<string, any>). */
export type HasBroadStringKey<T> = string extends keyof T ? true : false;

export type StringIndexValue<T> = T extends Record<string, infer V> ? V : never;

export type ArrayElement<T> = T extends readonly (infer U)[] ? U : never;

/**
 * Depth limit for recursive path generation to prevent TypeScript recursion errors
 * and IDE lag in complex schemas.
 */
export type MaxDepth = 8;

/** Types that stop the recursive path exploration. */
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
 *
 * Logic: If the source type T is 'any', we resolve to 'unknown' to satisfy
 * strict type checking while acknowledging that the leaf could be anything.
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

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Core engine for immutable deep updates.
 *
 * Why:
 * It ensures structural sharing—only the path being modified is cloned.
 * Sibling branches retain reference equality, maximizing `memo` efficiency.
 *
 * Performance:
 * Returns the original `obj` if the new value is identical (via `Object.is`).
 *
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  // Security: Prevent prototype pollution via malicious path segments.
  if (FORBIDDEN_KEYS.has(key)) return obj;

  // Resilience: Returns source if the path doesn't exist to prevent accidental schema creation.
  if (obj == null || typeof obj !== 'object') return obj;

  const curr = obj as Record<string, unknown>;
  const oldVal = curr[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (Object.is(oldVal, newVal)) return obj;

  if (Array.isArray(curr)) {
    const next = [...curr];
    (next as unknown as Record<string, unknown>)[key] = newVal;
    return next;
  }

  if (curr instanceof Map) {
    const next = new Map(curr);
    next.set(key, newVal);
    return next;
  }

  if (curr instanceof Set) {
    const next = new Set(curr);
    (next as unknown as Record<string, unknown>)[key] = newVal;
    return next;
  }

  // Why Object.create: Ensures that class instances keep their methods/prototype
  // after an immutable update.
  const next = Object.create(Object.getPrototypeOf(curr));
  Object.assign(next, curr);
  next[key] = newVal;
  return next;
}

/**
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
 * - When you need to pass a specific sub-field (e.g., `user.address.zip`) to a component.
 * - To prevent a component from re-rendering when unrelated parts of the root state change.
 *
 * Behavior:
 * - Updates to the lens propagate immutably to the root atom.
 * - Subscriptions only trigger if the specific nested value changes (Noise Filtering).
 *
 * Example:
 * ```ts
 * const userAtom = atom({ profile: { name: 'Alice', age: 25 } });
 * const nameLens = atomLens(userAtom, 'profile.name');
 *
 * nameLens.subscribe(name => console.log(`Name is now ${name}`));
 * nameLens.value = 'Bob'; // Updates root userAtom; triggers console.log
 * ```
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const parts = (path as string).split('.');
  const isDangerous = parts.some((p) => FORBIDDEN_KEYS.has(p));

  const listeners = new Set<(nv: unknown, ov: unknown) => void>();
  let sharedUnsub: (() => void) | null = null;
  let prevValue: unknown;

  const getValue = (source: unknown) => (isDangerous ? undefined : getPathValue(source, parts));

  /**
   * Propagates changes from the root atom to lens subscribers.
   * Logic: Performs an Object.is check on the leaf value to filter out noise from
   * other branches of the root object.
   */
  const notify = (nextParent?: T) => {
    if (nextParent === undefined) return;
    const nv = getValue(nextParent);
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
      if (next !== cur) atom.value = next as T;
    },
    peek: () => getValue(atom.peek()),
    subscribe(listener: (nv: unknown, ov: unknown) => void) {
      // Lazy Subscription: Only listens to the root atom if the lens has its own subscribers.
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
      if (sharedUnsub) sharedUnsub();
      sharedUnsub = null;
      listeners.clear();
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Chains a lens with a further sub-path.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a factory for generating multiple lenses from a single root atom.
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
