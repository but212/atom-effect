/**
 * @module LensPath
 *
 * Responsibility:
 * Type-level path computation and immutable deep read/write helpers shared by lenses.
 *
 * Security: Prototype Pollution Guard
 * Prevents unauthorized modifications to object prototypes during deep updates
 * by blacklisting sensitive keys like `__proto__`.
 */

import { DEFAULT_EQUAL, type LENS_CONFIG } from '@/constants';
import type { Equal } from '@/types';

/**
 * Logic: Numeric Key Conversion
 * Casts numeric string literals to numbers to ensure correct array index typing.
 */
export type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;

/** Symbol protocol for cloning class instances updated through a lens. */
export const LENS_CLONE: unique symbol = Symbol.for('atom-effect/lens-clone') as never;

/** Implement this protocol when lens updates need to preserve private state or internal slots. */
export interface LensCloneable<T extends object = object> {
  [LENS_CLONE](): T;
}

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
  | ((...args: never[]) => unknown);

/**
 * Logic: Path Generation
 * Computes a union of all valid dot-separated paths for type T.
 *
 * Constraint: Depth Limit
 * Recursion is capped by `LENS_CONFIG.MAX_PATH_DEPTH` to prevent infinite
 * type instantiation for circular or deeply nested structures.
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
                  [K in keyof T & (string | number)]: T[K] extends (...args: never[]) => unknown
                    ? never
                    : NonNullable<T[K]> extends object
                      ? `${K}` | `${K}.${Paths<NonNullable<T[K]>, [...D, 1]>}`
                      : `${K}`;
                }[keyof T & (string | number)]
            : never;

/**
 * Logic: Path Resolution
 * Resolves the type of the value located at a specific dot-path string.
 * Supports array indices, record keys, and nested objects.
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
 * Blacklists keys that could be exploited to modify object prototypes.
 */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** @internal */
const isForbiddenKey = (key: string) => FORBIDDEN_KEYS.has(key);

/**
 * Optimization: Structural Sharing
 * Creates a shallow copy of the container and applies the update.
 * Supports Arrays, Maps, and plain Objects while preserving prototypes.
 * @internal
 */
type CloneContainer = Record<string, unknown> | unknown[] | Map<string, unknown>;

function cloneAndSet(container: CloneContainer, key: string, value: unknown): object {
  if (Array.isArray(container)) {
    const clonedArray = [...container];
    Reflect.set(clonedArray, key, value);
    return clonedArray;
  }
  if (container instanceof Map) {
    return new Map(container).set(key, value);
  }
  const objectPrototype = Object.getPrototypeOf(container);
  if (objectPrototype === Object.prototype || objectPrototype === null) {
    return { ...container, [key]: value };
  }
  const cloneMethod = Reflect.get(container, LENS_CLONE);
  let clonedObject: Record<string, unknown>;
  if (typeof cloneMethod === 'function') {
    const cloneResult: unknown = Reflect.apply(cloneMethod, container, []);
    if (
      cloneResult === container ||
      cloneResult === null ||
      typeof cloneResult !== 'object' ||
      Object.getPrototypeOf(cloneResult) !== objectPrototype
    ) {
      throw new TypeError('Lens clone hook must return a fresh object with the same prototype.');
    }
    clonedObject = cloneResult as Record<string, unknown>;
  } else {
    clonedObject = Object.assign(Object.create(objectPrototype), container);
  }
  clonedObject[key] = value;
  return clonedObject;
}

/**
 * Logic: Immutable Deep Update
 * @internal
 */
export function setDeepValue(
  targetObject: unknown,
  keys: string[],
  index: number,
  value: unknown
  // biome-ignore lint/suspicious/noExplicitAny: returns type-erased dynamic value
): any {
  if (index === keys.length) return value;
  const key = keys[index];
  if (
    key === undefined ||
    targetObject == null ||
    typeof targetObject !== 'object' ||
    isForbiddenKey(key)
  )
    return targetObject;

  const previousValue =
    targetObject instanceof Map
      ? targetObject.get(key)
      : (targetObject as Record<string, unknown>)[key];
  const newValue = setDeepValue(previousValue, keys, index + 1, value);

  return DEFAULT_EQUAL(previousValue, newValue)
    ? targetObject
    : cloneAndSet(targetObject as CloneContainer, key, newValue);
}

/**
 * Logic: Deep Read
 * @internal
 */
// biome-ignore lint/suspicious/noExplicitAny: returns type-erased dynamic path value
export function getPathValue(sourceObject: unknown, parts: string[]): any {
  let resolvedValue = sourceObject;
  for (const part of parts) {
    if (resolvedValue == null || isForbiddenKey(part)) return undefined;
    resolvedValue =
      resolvedValue instanceof Map
        ? resolvedValue.get(part)
        : typeof resolvedValue === 'object' || typeof resolvedValue === 'function'
          ? (resolvedValue as Record<string, unknown>)[part]
          : Object(resolvedValue)[part as keyof object];
  }
  return resolvedValue;
}
