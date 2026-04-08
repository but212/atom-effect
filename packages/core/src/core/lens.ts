/**
 * @file lens.ts
 * @description Provides bidirectional, fine-grained lenses for object-based atoms.
 * Lenses allow focused access to nested properties while maintaining reactivity
 * and structural sharing.
 */

import { COMPUTED_STATE_FLAGS } from '../constants';
import { ATOM_BRAND, WRITABLE_BRAND } from '../symbols';
import type { Paths, PathValue, Subscriber, WritableAtom } from '../types';
import { ReactiveNode } from './base';
import { nextVersion } from './scheduler';
import { trackingContext } from './tracking';

const { DISPOSED, IS_COMPUTED } = COMPUTED_STATE_FLAGS;

/**
 * Creates a deep immutable copy of an object/array with a value updated at a specific path.
 * Uses structural sharing to preserve references for unchanged branches.
 *
 * @param obj - The source object or array.
 * @param keys - Array of keys representing the path.
 * @param index - Current index in the keys array.
 * @param value - The new value to set.
 * @returns A new object/array with the value updated, or the original if no change occurred.
 */
export function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  const curr = (obj != null && typeof obj === 'object' ? obj : {}) as Record<string, unknown>;
  const old = curr[key];
  const next = setDeepValue(old, keys, index + 1, value);

  // Identity check for structural sharing
  if (Object.is(old, next)) return obj;

  if (Array.isArray(curr)) {
    const arr = curr.slice();
    const idx = Number.parseInt(key, 10);
    if (!Number.isNaN(idx)) {
      arr[idx] = next;
    } else {
      (arr as unknown as Record<string, unknown>)[key] = next;
    }
    return arr;
  }
  return { ...curr, [key]: next };
}

/**
 * Traverses an object/array to retrieve a value at a specific path.
 *
 * Traverses an object/array to retrieve a value at a specific path.
 *
 * @param source - The object or array to traverse.
 * @param parts - Array of keys representing the path.
 * @returns The value at the path, or undefined if traversal fails.
 */
export function getPathValue(source: unknown, parts: string[]): unknown {
  let res = source;
  const len = parts.length;
  for (let i = 0; i < len; i++) {
    if (res == null) return undefined;
    res = (res as Record<string, unknown>)[parts[i]!];
  }
  return res;
}

/**
 * Internal implementation of a reactive lens.
 *
 * Acts as a first-class ReactiveNode, bridging a parent atom and reactive consumers.
 * Features:
 * 1. Fine-grained notifications: Only notifies if the lensed path actually changes.
 * 2. Optimized dependency tracking: Prevents direct dependency on the parent atom.
 * 3. Lazy subscription: Only connects to the parent atom when it has active subscribers.
 *
 * @template T - The type of the root object.
 * @template P - The dot-notation path string.
 * @internal
 */
export class LensImpl<T extends object, P extends Paths<T>>
  extends ReactiveNode<PathValue<T, P>>
  implements WritableAtom<PathValue<T, P>>, Subscriber
{
  /** The parent atom this lens is derived from. @internal */
  readonly _parent: WritableAtom<T>;

  /** The full dot-notation path string. Used for lens composition/flattening. @internal */
  readonly _fullPath: string;

  /** Pre-split path parts for efficient traversal. */
  private readonly _parts: string[];

  /** Unsubscribe function for the parent atom. Active only when this lens has subscribers. */
  private _unsubParent: (() => void) | null = null;

  /** Cached last value to detect changes and provide old values to subscribers. */
  private _lastValue: PathValue<T, P> | undefined;

  /** @internal */
  readonly [ATOM_BRAND] = true;
  /** @internal */
  readonly [WRITABLE_BRAND] = true;

  constructor(parent: WritableAtom<T>, path: string) {
    super();
    this.flags |= IS_COMPUTED;
    this._parent = parent;
    this._fullPath = path;
    this._parts = path.includes('.') ? path.split('.') : [path];
  }

  /**
   * Retrieves the current lensed value and registers it as a dependency.
   */
  get value(): PathValue<T, P> {
    const ctx = trackingContext.current;
    if (ctx != null) ctx.addDependency(this);

    const val = this._currentValue();

    // Pull-based versioning: If the lens is not currently subscribed to the parent,
    // it must manually check for changes and update its version during access.
    if (!this._unsubParent) {
      this._syncVersion(val);
    }

    return val;
  }

  /**
   * Updates the lensed property by creating a new immutable root state.
   */
  set value(newVal: PathValue<T, P>) {
    if (this.isDisposed) return;
    const cur = this._parent.peek();
    const next = setDeepValue(cur, this._parts, 0, newVal);

    // Only commit if the root object changed (structural sharing handled in setDeepValue)
    if (next !== cur) {
      this._parent.value = next as T;
    }
  }

  /**
   * Reads the current value without registering a dependency.
   */
  peek(): PathValue<T, P> {
    return this._currentValue();
  }

  /**
   * Helper to retrieve the current value at the lensed path.
   */
  private _currentValue(): PathValue<T, P> {
    return getPathValue(this._parent.peek(), this._parts) as PathValue<T, P>;
  }

  /**
   * Synchronizes the internal version and cached value for pull-based validation.
   */
  private _syncVersion(currentVal: PathValue<T, P>): void {
    if (!Object.is(currentVal, this._lastValue)) {
      this._lastValue = currentVal;
      this.version = nextVersion(this.version);
    }
  }

  /**
   * Subscribes to changes. Activates parent connection on first subscriber.
   *
   * @param listener - Callback or Subscriber object.
   */
  override subscribe(
    listener: ((newValue?: PathValue<T, P>, oldValue?: PathValue<T, P>) => void) | Subscriber
  ): () => void {
    const isFirst = this.subscriberCount() === 0;
    const unsub = super.subscribe(listener);

    // Lazy activation: Connect to parent only when needed
    if (isFirst) {
      this._lastValue = this.peek();
      this._unsubParent = this._parent.subscribe(this);
    }

    return () => {
      unsub();
      // Lazy deactivation: Disconnect from parent when silent
      if (this.subscriberCount() === 0 && this._unsubParent) {
        this._unsubParent();
        this._unsubParent = null;
      }
    };
  }

  /**
   * Callback invoked by the parent atom.
   * Performs a granular dirty check to decide if subscribers should be notified.
   *
   * @internal
   */
  execute(): void {
    const nextVal = this.peek();
    const prevVal = this._lastValue;

    // Granular Filtering: Only bump version and notify if OUR slice changed
    if (!Object.is(nextVal, prevVal)) {
      this._lastValue = nextVal;
      this.version = nextVersion(this.version);
      this._notifySubscribers(nextVal, prevVal);
    }
  }

  /**
   * Disposes the lens, disconnecting from parent and clearing internal state.
   */
  dispose(): void {
    if (this.isDisposed) return;

    if (this._unsubParent) {
      this._unsubParent();
      this._unsubParent = null;
    }
    this._slots = null;
    this.flags |= DISPOSED;
  }

  /**
   * Explicit Resource Management support.
   */
  [Symbol.dispose](): void {
    this.dispose();
  }

  /**
   * Performs a granular dirty check for the engine.
   *
   * @internal
   */
  protected override _isDirty(): boolean {
    return this._deepDirtyCheck();
  }

  /**
   * Performs a deep dirty check for the engine.
   *
   * @internal
   */
  protected override _deepDirtyCheck(): boolean {
    const nextVal = this.peek();
    return !Object.is(nextVal, this._lastValue);
  }
}

/**
 * Creates a two-way reactive lens for a specific property path on an object-based atom.
 *
 * Lenses automatically flatten nested paths (e.g., lens(lens(root, 'a'), 'b') => lens(root, 'a.b'))
 * to minimize reactive node overhead and improve performance.
 *
 * @example
 * const user = atom({ profile: { name: 'Alice' } });
 * const nameLens = atomLens(user, 'profile.name');
 *
 * console.log(nameLens.value); // 'Alice'
 * nameLens.value = 'Bob'; // Updates user atom immutably
 *
 * @param atom - The source writable atom.
 * @param path - Dot-notation string representing the property path.
 * @returns A writable atom focused on the specified path.
 */
export function atomLens<T extends object, P extends Paths<T>>(
  atom: WritableAtom<T>,
  path: P
): WritableAtom<PathValue<T, P>> {
  // Path Flattening: prevents deep chains of reactive nodes by merging paths.
  // root -> lens(user) -> lens(name) becomes a single root -> lens(user.name).
  if (atom instanceof LensImpl) {
    const fullPath = `${atom._fullPath}.${path}`;
    return new LensImpl(atom._parent as WritableAtom<object>, fullPath) as unknown as WritableAtom<
      PathValue<T, P>
    >;
  }

  return new LensImpl(atom, path as string) as unknown as WritableAtom<PathValue<T, P>>;
}

/**
 * Composes an existing lens with a sub-path to create a deeper focused lens.
 *
 * @param lens - An existing lens.
 * @param path - Sub-path from the lens's value.
 * @returns A deeper lens.
 */
export const composeLens = <T extends object, P extends Paths<T>>(lens: WritableAtom<T>, path: P) =>
  atomLens(lens, path);

/**
 * Creates a lens factory bound to a specific atom for cleaner DSL.
 *
 * @example
 * const l = lensFor(store);
 * const name = l('user.name');
 * const age = l('user.age');
 *
 * @param atom - The source atom.
 * @returns A factory function for creating lenses from the atom.
 */
export const lensFor =
  <T extends object>(atom: WritableAtom<T>) =>
  <P extends Paths<T>>(path: P) =>
    atomLens(atom, path);
