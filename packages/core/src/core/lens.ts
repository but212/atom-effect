/**
 * @module LensEngine
 *
 * Responsibility:
 * Provides two-way reactive lenses for type-safe deep state management.
 * Orchestrates immutable deep updates with structural sharing and path flattening.
 *
 * Design Intent:
 * Enables granular subscriptions to nested properties of complex state objects,
 * minimizing re-renders.
 *
 * Security: Prototype Pollution Guard
 * Prevents unauthorized modifications to object prototypes during deep updates
 * by blacklisting sensitive keys like `__proto__`.
 */

import { Result, shallowEqual } from '@but212/atom-effect-utils';
import { BRAND, BrandFlags, DEFAULT_EQUAL, type LENS_CONFIG, STATE_FLAGS } from '@/constants';
import { BaseNode, nodeNotifySubscribers, nodeSubscribe, nodeSubscriberCount } from '@/core/base';
import { batch } from '@/index';
import type {
  Equal,
  MergedDependencyValue,
  ReactiveNode,
  SubscriberTarget,
  WritableAtom,
} from '@/types';
import { debug, mergeAtomValues } from '@/utils';

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
function cloneAndSet(container: object, key: string, value: unknown): object {
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
  const clonedObject = Object.assign(Object.create(objectPrototype), container);
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
    targetObject instanceof Map ? targetObject.get(key) : Reflect.get(targetObject, key);
  const newValue = setDeepValue(previousValue, keys, index + 1, value);

  return DEFAULT_EQUAL(previousValue, newValue)
    ? targetObject
    : cloneAndSet(targetObject, key, newValue);
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
        : Reflect.get(
            typeof resolvedValue === 'object' || typeof resolvedValue === 'function'
              ? resolvedValue
              : Object(resolvedValue),
            part
          );
  }
  return resolvedValue;
}

/**
 * Role: Orchestrator for a Single-Property Reactive Lens.
 *
 * Optimization: Monomorphic Access
 * Uses public fields for engine compatibility to ensure consistent V8 hidden
 * class shapes in the reactive hot-path.
 *
 * Logic: Shared Subscription
 * Only subscribes to the root atom when the lens itself has active listeners,
 * preventing memory leaks and unnecessary computations for unused lenses.
 *
 * @internal
 */
/**
 * Base class providing common engine properties for reactive nodes to guarantee consistent
 * hidden class shapes and monomorphic hot-path access in V8.
 *
 * @internal
 */
abstract class BaseLens<T = unknown> extends BaseNode<T> {
  _nextEpoch: number | undefined = undefined;
  _trackEpoch = 0;
  _trackCount = 0;
  _error: Error | null = null;
}

class LensImpl<T extends object, P extends string>
  extends BaseLens<PathValue<T, P>>
  implements WritableAtom<PathValue<T, P>>, ReactiveNode<PathValue<T, P>>
{
  #root: WritableAtom<T>;
  #path: P;
  #parts: string[];
  #sharedUnsubscribeCallback: (() => void) | null = null;
  #previousValue: PathValue<T, P> | undefined;

  constructor(root: WritableAtom<T>, path: P) {
    super();
    this.#root = root;
    this.#path = path;
    this.#parts = path.split('.');
    debug.attachDebugInfo(this, 'lens', this.id, path);
  }

  get value(): PathValue<T, P> {
    return this.#getValue(this.#root.value);
  }

  set value(newValue: PathValue<T, P>) {
    const currentValue = this.#root.peek();
    const updatedValue = setDeepValue(currentValue, this.#parts, 0, newValue);
    if (updatedValue !== currentValue) this.#root.value = updatedValue;
  }

  peek(): PathValue<T, P> {
    return this.#getValue(this.#root.peek());
  }

  subscribe(listener: SubscriberTarget<PathValue<T, P>>): () => void {
    const innerUnsubscribeCallback = Result.unwrap(nodeSubscribe(this, listener));
    if (this.isDisposed) {
      return innerUnsubscribeCallback;
    }
    if (nodeSubscriberCount(this) === 1) {
      this.#previousValue = this.peek();
      this.#sharedUnsubscribeCallback = this.#root.subscribe(() => this.#notify());
    }
    return () => {
      innerUnsubscribeCallback();
      if (nodeSubscriberCount(this) === 0 && this.#sharedUnsubscribeCallback) {
        const unsubscribeCallback = this.#sharedUnsubscribeCallback;
        this.#sharedUnsubscribeCallback = null;
        unsubscribeCallback();
      }
    };
  }

  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  dispose(): void {
    this.flags |= STATE_FLAGS.DISPOSED;
    this.#sharedUnsubscribeCallback?.();
    this.#sharedUnsubscribeCallback = null;
    this._subscriberSlots?.clear();
  }

  #getValue(source: T): PathValue<T, P> {
    return getPathValue(source, this.#parts);
  }

  #notify(): void {
    const nextValue = this.peek();
    if (!DEFAULT_EQUAL(nextValue, this.#previousValue)) {
      const oldValue = this.#previousValue;
      this.#previousValue = nextValue;
      nodeNotifySubscribers(this, nextValue, oldValue);
    }
  }

  get _root() {
    return this.#root;
  }
  get _path() {
    return this.#path;
  }
  get [BRAND]() {
    return BrandFlags.Atom | BrandFlags.Writable | BrandFlags.Lens;
  }
}

/**
 * Creates a reactive, two-way Lens into a nested property of an atom.
 *
 * When to use:
 * - To bind UI inputs to specific fields in a large state object.
 * - To minimize re-renders by subscribing only to a specific sub-path.
 * - To create "slices" of state that can be passed to components.
 *
 * Logic: Path Flattening
 * If the source atom is already a lens, this factory flattens the path
 * (e.g., lens(lens(a, 'b'), 'c') -> lens(a, 'b.c')) to reduce proxy overhead.
 *
 * @param atom - The source atom or lens to derive from.
 * @param path - A dot-separated string representing the path to the property.
 * @returns A writable atom representing the value at the specified path.
 *
 * @example
 * ```typescript
 * import { atom, atomLens } from '@but212/atom-effect';
 *
 * const user = atom({ profile: { name: 'Alice', age: 25 } });
 *
 * // Create a two-way lens for the 'name' property
 * const nameLens = atomLens(user, 'profile.name');
 *
 * console.log(nameLens.value); // 'Alice'
 * nameLens.value = 'Bob';      // Updates user.value.profile.name
 * ```
 */
interface LensNode {
  // biome-ignore lint/suspicious/noExplicitAny: type-erased root atom
  _root: WritableAtom<any>;
  _path: string;
}

function isLensNode(atom: unknown): atom is LensNode {
  return atom != null && typeof atom === 'object' && '_root' in atom && '_path' in atom;
}

export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const brand = atom[BRAND] || 0;
  if (brand & BrandFlags.Lens) {
    if (isLensNode(atom)) {
      return atomLens(atom._root, `${atom._path}.${path}` as P);
    }
  }
  return new LensImpl(atom, path);
}

/**
 * Role: Implementation of a Unified Merged Lens.
 *
 * Logic: Multi-Write Batching
 * When setting a value on a merged lens, all underlying lenses are updated
 * within a single `batch()` to prevent intermediate inconsistent states.
 *
 * @internal
 */
class MergedLensImpl<L extends WritableAtom<unknown>[]>
  extends BaseLens<MergedDependencyValue<L>>
  implements WritableAtom<MergedDependencyValue<L>>, ReactiveNode<MergedDependencyValue<L>>
{
  #lenses: L;
  #unsubscribeCallbacks: (() => void)[] = [];
  #previousValue: MergedDependencyValue<L> | undefined;

  constructor(lenses: L) {
    super();
    this.#lenses = lenses;
    debug.attachDebugInfo(this, 'merged-lens', this.id);
  }

  get value(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses);
  }

  set value(newValue: MergedDependencyValue<L>) {
    batch(() => {
      for (const lens of this.#lenses) lens.value = newValue;
    });
  }

  peek(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses, true);
  }

  subscribe(listener: SubscriberTarget<MergedDependencyValue<L>>): () => void {
    const innerUnsub = Result.unwrap(nodeSubscribe(this, listener));
    if (this.isDisposed) {
      return innerUnsub;
    }
    if (nodeSubscriberCount(this) === 1) {
      this.#previousValue = this.peek();
      const notifyCallback = () => this.#notify();
      for (const lens of this.#lenses) {
        this.#unsubscribeCallbacks.push(lens.subscribe(notifyCallback));
      }
    }
    return () => {
      innerUnsub();
      if (nodeSubscriberCount(this) === 0) {
        const unsubscribeCallbacks = this.#unsubscribeCallbacks;
        this.#unsubscribeCallbacks = [];
        for (const unsubscribeCallback of unsubscribeCallbacks) unsubscribeCallback();
      }
    };
  }

  subscriberCount(): number {
    return nodeSubscriberCount(this);
  }

  dispose(): void {
    this.flags |= STATE_FLAGS.DISPOSED;
    for (const unsubscribeCallback of this.#unsubscribeCallbacks) unsubscribeCallback();
    this.#unsubscribeCallbacks.length = 0;
    this._subscriberSlots?.clear();
  }

  #notify(): void {
    const nextValue = this.peek();
    if (!shallowEqual(nextValue, this.#previousValue)) {
      const oldValue = this.#previousValue;
      this.#previousValue = nextValue;
      nodeNotifySubscribers(this, nextValue, oldValue);
    }
  }

  get [BRAND]() {
    return BrandFlags.Atom | BrandFlags.Writable;
  }
}

/**
 * Merges multiple writable lenses into a single unified lens.
 *
 * When to use:
 * - To synchronize multiple fields across different state trees.
 * - To create a single "form" atom from multiple disparate source atoms.
 *
 * @param lenses - A list of writable atoms/lenses to merge.
 * @returns A unified writable atom that synchronizes all input lenses.
 *
 * @example
 * ```typescript
 * const firstName = atom('Alice');
 * const lastName = atom('Smith');
 *
 * const fullName = mergeLenses(firstName, lastName);
 *
 * // Sets both firstName and lastName to 'Bob'
 * fullName.value = 'Bob';
 * ```
 */
export function mergeLenses<L extends WritableAtom<unknown>[]>(
  ...lenses: L
): WritableAtom<MergedDependencyValue<L>> {
  return new MergedLensImpl(lenses);
}

/**
 * Composes an existing lens with a new sub-path.
 *
 * Logic: Composition
 * This is a semantic alias for {@link atomLens}. It creates a new lens
 * starting from the value of the provided lens and navigating down the
 * specified path.
 *
 * @param lens - The base lens to compose from.
 * @param path - The sub-path relative to the base lens.
 * @returns A new lens targeting the nested property.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a lens factory for a specific atom.
 *
 * When to use:
 * - To create multiple lenses from the same root atom without repeating the root.
 * - To enhance readability when defining many field bindings for a single state object.
 *
 * @param atom - The root atom to create lenses for.
 * @returns A function that accepts a path and returns a lens for that path.
 *
 * @example
 * ```typescript
 * const user = atom({ profile: { name: 'Alice', age: 25 } });
 * const userLens = lensFor(user);
 *
 * const nameLens = userLens('profile.name');
 * const ageLens = userLens('profile.age');
 * ```
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
