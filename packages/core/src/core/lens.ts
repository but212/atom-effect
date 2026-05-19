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

import { shallowEqual } from '@but212/atom-effect-utils';
import {
  ATOM_STATE_FLAGS,
  BRAND,
  BrandFlags,
  DEFAULT_EQUAL,
  EPOCH_CONSTANTS,
  KIND,
  type LENS_CONFIG,
  SMI_MAX,
} from '@/constants';
import { batch } from '@/index';
import type {
  DepBufferState,
  Equal,
  MergedDependencyValue,
  ReactiveNode,
  ReactiveNodeBase,
  SubscriberTarget,
  WritableAtom,
} from '@/types';
import { debug, generateId, mergeAtomValues } from '@/utils';

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
  if (proto === Object.prototype || proto === null) {
    return { ...container, [key]: value };
  }

  const next = Object.create(proto);
  Object.assign(next, container);
  (next as Record<string, unknown>)[key] = value;
  return next;
}

/**
 * Logic: Immutable Deep Update
 * @internal
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;
  const key = keys[index]!;
  if (obj == null || typeof obj !== 'object' || isForbiddenKey(key)) return obj;

  const oldVal = obj instanceof Map ? obj.get(key) : (obj as Record<string, unknown>)[key];
  const newVal = setDeepValue(oldVal, keys, index + 1, value);

  if (DEFAULT_EQUAL(oldVal, newVal)) return obj;
  return cloneAndSet(obj as object, key, newVal);
}

/**
 * Logic: Deep Read
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

// ============================================================================
// Core Engine
// ============================================================================

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
abstract class BaseLens implements ReactiveNodeBase {
  public flags: number = 0;
  public version: number = 0;
  public _lastSeenEpoch: number = EPOCH_CONSTANTS.UNINITIALIZED;
  public _nextEpoch: number | undefined = undefined;
  public _trackEpoch: number = 0;
  public _trackCount: number = 0;
  public _error: Error | null = null;
  public _k: typeof KIND.Obj = KIND.Obj;
  public readonly id: number = generateId() & SMI_MAX;

  public _storage: {
    slots: null;
    deps: DepBufferState | null;
  } = {
    slots: null,
    deps: null,
  };

  get isDisposed() {
    return (this.flags & ATOM_STATE_FLAGS.DISPOSED) !== 0;
  }
  get isComputed() {
    return false;
  }
  get isRejected() {
    return false;
  }
  get hasError() {
    return false;
  }
}

class LensImpl<T extends object, P extends string>
  extends BaseLens
  implements WritableAtom<PathValue<T, P>>, ReactiveNode<void>
{
  #root: WritableAtom<T>;
  #path: P;
  #parts: string[];
  #isDangerous: boolean;
  #listeners = new Set<SubscriberTarget<PathValue<T, P>>>();
  #sharedUnsub: (() => void) | null = null;
  #prevValue: PathValue<T, P> | undefined;

  constructor(root: WritableAtom<T>, path: P) {
    super();
    this.#root = root;
    this.#path = path;
    this.#parts = path.split('.');
    this.#isDangerous = this.#parts.some(isForbiddenKey);
    debug.attachDebugInfo(this, 'lens', this.id, path);
  }

  get value(): PathValue<T, P> {
    return this.#getValue(this.#root.value);
  }

  set value(newVal: PathValue<T, P>) {
    if (this.#isDangerous) return;
    const cur = this.#root.peek();
    const next = setDeepValue(cur, this.#parts, 0, newVal);

    if (next !== cur) {
      this.#root.value = next as T;
    }
  }

  peek(): PathValue<T, P> {
    return this.#getValue(this.#root.peek());
  }

  subscribe(listener: SubscriberTarget<PathValue<T, P>>): () => void {
    if (this.#listeners.size === 0) {
      this.#prevValue = this.peek();
      this.#sharedUnsub = this.#root.subscribe(() => this.#notify());
    }
    this.#listeners.add(listener);
    let self: LensImpl<T, P> | undefined = this;
    let lis: SubscriberTarget<PathValue<T, P>> | undefined = listener;
    return () => {
      if (self && lis) {
        self.#listeners.delete(lis);
        if (self.#listeners.size === 0 && self.#sharedUnsub) {
          const unsub = self.#sharedUnsub;
          self.#sharedUnsub = null;
          unsub();
        }
        self = undefined;
        lis = undefined;
      }
    };
  }

  subscriberCount(): number {
    return this.#listeners.size;
  }

  dispose(): void {
    this.#sharedUnsub?.();
    this.#sharedUnsub = null;
    this.#listeners.clear();
  }

  #getValue(source: T): PathValue<T, P> {
    return (this.#isDangerous ? undefined : getPathValue(source, this.#parts)) as PathValue<T, P>;
  }

  #notify(): void {
    const nv = this.peek();
    if (!DEFAULT_EQUAL(nv, this.#prevValue)) {
      const ov = this.#prevValue as PathValue<T, P>;
      this.#prevValue = nv;
      for (const listener of this.#listeners) {
        if (typeof listener === 'function') {
          listener(nv, ov);
        } else {
          listener.execute();
        }
      }
    }
  }

  // Path flattening metadata
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
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  const brand = (atom as unknown as { [BRAND]?: number })[BRAND] || 0;
  if ((brand & BrandFlags.Lens) !== 0) {
    const parent = atom as unknown as { _root: WritableAtom<T>; _path: string };
    const combined = `${parent._path}.${path as string}`;
    return atomLens(parent._root, combined as Paths<T>) as unknown as WritableAtom<PathValue<T, P>>;
  }

  return new LensImpl(atom, path as string) as unknown as WritableAtom<PathValue<T, P>>;
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
  extends BaseLens
  implements WritableAtom<MergedDependencyValue<L>>, ReactiveNode<void>
{
  #lenses: L;
  #listeners = new Set<SubscriberTarget<MergedDependencyValue<L>>>();
  #unsubs: (() => void)[] = [];
  #prevValue: MergedDependencyValue<L> | undefined;

  constructor(lenses: L) {
    super();
    this.#lenses = lenses;
    debug.attachDebugInfo(this, 'merged-lens', this.id);
  }

  get value(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses) as MergedDependencyValue<L>;
  }

  set value(newVal: MergedDependencyValue<L>) {
    batch(() => {
      for (let i = 0; i < this.#lenses.length; i++) {
        this.#lenses[i]!.value = newVal;
      }
    });
  }

  peek(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses, true) as MergedDependencyValue<L>;
  }

  subscribe(listener: SubscriberTarget<MergedDependencyValue<L>>): () => void {
    if (this.#listeners.size === 0) {
      this.#prevValue = this.peek();
      const notify = () => this.#notify();
      for (let i = 0; i < this.#lenses.length; i++) {
        this.#unsubs.push(this.#lenses[i]!.subscribe(notify));
      }
    }
    this.#listeners.add(listener);
    let self: MergedLensImpl<L> | undefined = this;
    let lis: SubscriberTarget<MergedDependencyValue<L>> | undefined = listener;
    return () => {
      if (self && lis) {
        self.#listeners.delete(lis);
        if (self.#listeners.size === 0) {
          const unsubs = self.#unsubs;
          self.#unsubs = [];
          for (const unsub of unsubs) unsub();
        }
        self = undefined;
        lis = undefined;
      }
    };
  }

  subscriberCount(): number {
    return this.#listeners.size;
  }

  dispose(): void {
    for (const unsub of this.#unsubs) unsub();
    this.#unsubs.length = 0;
    this.#listeners.clear();
  }

  #notify(): void {
    const nv = this.peek();
    if (!shallowEqual(nv, this.#prevValue)) {
      const ov = this.#prevValue;
      this.#prevValue = nv;
      for (const listener of this.#listeners) {
        if (typeof listener === 'function') {
          listener(nv, ov);
        } else {
          listener.execute();
        }
      }
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
