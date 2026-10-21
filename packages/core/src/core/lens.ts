/**
 * @module LensEngine
 *
 * Responsibility:
 * Provides two-way reactive lenses for type-safe deep state management.
 * Orchestrates immutable deep updates with structural sharing and path flattening.
 *
 * Design Intent:
 * Push-based subscriptions to a lens notify only when the sub-path value actually changes.
 * A pull-based read of `lens.value` inside a tracked scope registers a dependency on the
 * root atom, so it re-runs when any part of the root changes.
 */

import { shallowEqual } from '@but212/atom-effect-utils';
import { BRAND, BrandFlags, DEFAULT_EQUAL, ERROR_MESSAGES, STATE_FLAGS } from '@/constants';
import {
  BaseNode,
  nodeGetSubscriberCount,
  nodeNotifySubscribers,
  nodeSubscribe,
} from '@/core/base';
import type { MergedDependencyValue, ReactiveNode, SubscriberTarget, WritableAtom } from '@/types';
import { debug, mergeAtomValues } from '@/utils';
import { getPathValue, type Paths, type PathValue, setDeepValue } from './lens-path';
import { batch } from './scheduler';

/**
 * Base class providing common engine properties for reactive nodes to guarantee consistent
 * hidden class shapes and monomorphic hot-path access in V8.
 *
 * Logic: Shared Subscription
 * Only attaches to the upstream source(s) while the lens itself has active listeners,
 * preventing memory leaks and unnecessary computations for unused lenses.
 * `subscribe()` is granular: it re-notifies only when the lens value changes under `_equals`.
 *
 * @internal
 */
abstract class BaseLens<T = unknown> extends BaseNode<T> {
  _nextEpoch: number | undefined = undefined;
  _trackEpoch = 0;
  _trackCount = 0;
  _error: Error | null = null;
  #previousValue: T | undefined;

  abstract peek(): T;
  protected abstract _equals(nextValue: T, previousValue: T | undefined): boolean;
  /** Subscribes to the upstream source(s); invoked when the first listener arrives. */
  protected abstract _attach(onSourceChange: () => void): void;
  /** Releases every upstream subscription; must be safe to call repeatedly. */
  protected abstract _detach(): void;

  subscribe(listener: SubscriberTarget<T>): () => void {
    const wasEmpty = nodeGetSubscriberCount(this) === 0;
    const innerUnsubscribe = nodeSubscribe(this, listener);
    if (this.isDisposed) {
      return innerUnsubscribe;
    }
    if (wasEmpty && nodeGetSubscriberCount(this) === 1) {
      this.#previousValue = this.peek();
      this._attach(() => this.#notify());
    }
    return () => {
      innerUnsubscribe();
      if (nodeGetSubscriberCount(this) === 0) this._detach();
    };
  }

  dispose(): void {
    this.flags |= STATE_FLAGS.DISPOSED;
    this._detach();
    this._subscriberSlots?.clear();
  }

  #notify(): void {
    const nextValue = this.peek();
    if (!this._equals(nextValue, this.#previousValue)) {
      const oldValue = this.#previousValue;
      this.#previousValue = nextValue;
      nodeNotifySubscribers(this, nextValue, oldValue);
    }
  }
}

/**
 * Role: Orchestrator for a Single-Property Reactive Lens.
 *
 * A pull-based read of `value`/`peek()` tracks the root atom instead, so a tracked
 * scope re-runs on any root write, even one that leaves this path unchanged.
 *
 * @internal
 */
class LensImpl<T extends object, P extends string>
  extends BaseLens<PathValue<T, P>>
  implements WritableAtom<PathValue<T, P>>, ReactiveNode<PathValue<T, P>>
{
  #root: WritableAtom<T>;
  #path: P;
  #parts: string[];
  #sharedUnsubscribeCallback: (() => void) | null = null;

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
    if (this.isDisposed) return;
    // A merged root cannot partition a sub-path write: its setter forwards the whole value to
    // every source, which would overwrite fields the caller never touched. Reads stay legal.
    if (((this.#root[BRAND] || 0) & BrandFlags.Merged) !== 0) {
      throw new Error(ERROR_MESSAGES.LENS_WRITE_THROUGH_MERGED_ROOT(this.#path));
    }
    const currentValue = this.#root.peek();
    const updatedValue = setDeepValue(currentValue, this.#parts, 0, newValue);
    if (updatedValue !== currentValue) this.#root.value = updatedValue;
  }

  peek(): PathValue<T, P> {
    return this.#getValue(this.#root.peek());
  }

  protected _equals(
    nextValue: PathValue<T, P>,
    previousValue: PathValue<T, P> | undefined
  ): boolean {
    return DEFAULT_EQUAL(nextValue, previousValue);
  }

  protected _attach(onSourceChange: () => void): void {
    this.#sharedUnsubscribeCallback = this.#root.subscribe(onSourceChange);
  }

  protected _detach(): void {
    const unsubscribeCallback = this.#sharedUnsubscribeCallback;
    this.#sharedUnsubscribeCallback = null;
    unsubscribeCallback?.();
  }

  #getValue(source: T): PathValue<T, P> {
    return getPathValue(source, this.#parts);
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
 * - To re-notify subscribers only when a specific sub-path changes (via `.subscribe()`).
 * - To create "slices" of state that can be passed to components.
 *
 * Logic: Path Flattening
 * If the source atom is already a lens, this factory flattens the path
 * (e.g., lens(lens(a, 'b'), 'c') -> lens(a, 'b.c')) to reduce proxy overhead.
 *
 * @param atom The source atom or lens to derive from.
 * @param path A dot-separated string representing the path to the property.
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

  constructor(lenses: L) {
    super();
    this.#lenses = lenses;
    debug.attachDebugInfo(this, 'merged-lens', this.id);
  }

  get value(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses);
  }

  set value(newValue: MergedDependencyValue<L>) {
    if (this.isDisposed) return;
    batch(() => {
      for (const lens of this.#lenses) lens.value = newValue;
    });
  }

  peek(): MergedDependencyValue<L> {
    return mergeAtomValues(this.#lenses, true);
  }

  protected _equals(
    nextValue: MergedDependencyValue<L>,
    previousValue: MergedDependencyValue<L> | undefined
  ): boolean {
    return shallowEqual(nextValue, previousValue);
  }

  protected _attach(onSourceChange: () => void): void {
    for (const lens of this.#lenses) {
      this.#unsubscribeCallbacks.push(lens.subscribe(onSourceChange));
    }
  }

  protected _detach(): void {
    const unsubscribeCallbacks = this.#unsubscribeCallbacks;
    this.#unsubscribeCallbacks = [];
    for (const unsubscribeCallback of unsubscribeCallbacks) unsubscribeCallback();
  }

  get [BRAND]() {
    return BrandFlags.Atom | BrandFlags.Writable | BrandFlags.Merged;
  }
}

/**
 * Merges multiple writable lenses into a single unified lens.
 *
 * When to use:
 * - To synchronize multiple fields across different state trees.
 * - To create a single "form" atom from multiple disparate source atoms.
 *
 * @param lenses A list of writable atoms/lenses to merge.
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
 * @param lens The base lens to compose from.
 * @param path The sub-path relative to the base lens.
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
 * @param atom The root atom to create lenses for.
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
