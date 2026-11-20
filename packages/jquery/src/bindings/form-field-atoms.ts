/**
 * @module Form Field Atoms
 *
 * Responsibility:
 * Resolves a form field across multiple source atoms.
 */

import {
  BRAND,
  BrandFlags,
  getPathValue,
  type SubscriberTarget,
  setDeepValue,
  type WritableAtom,
} from '@but212/atom-effect';
import { shallowEqual } from '@but212/atom-effect-utils';

export type NonEmptySources = readonly [WritableAtom<unknown>, ...WritableAtom<unknown>[]];

/**
 * Logic: Field Ownership
 * Resolves which source atom owns a field path, mirroring the read precedence of a merged view
 * (later sources win) while keeping writes partitioned to a single source. When no source defines
 * the path yet, the first source takes ownership.
 *
 * Ownership is resolved per operation, never cached: a source may gain or drop the path at any
 * time, and both the read and the write of a field must follow the current owner.
 *
 * @internal
 */
function resolveOwner(sources: NonEmptySources, parts: string[]): WritableAtom<object> {
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (source && getPathValue(source.peek(), parts) !== undefined) {
      return source as WritableAtom<object>;
    }
  }
  return sources[0] as WritableAtom<object>;
}

/** Bitwise flag indicating disposed state across all reactive nodes. @internal */
const DISPOSED_FLAG = 1 << 0;

let nextMultiSourceFieldId = 1;

/**
 * Role: Multi-Source Field Atom
 *
 * Design Intent:
 * Backs one form field when {@link bindForm} is given several source atoms. Reads resolve through
 * direct path evaluation across sources, registering a dependency on every source without shallow-merging
 * parent objects. Writes resolve the owning source at dispatch time and mutate only that source,
 * preserving sibling keys in nested objects across sources.
 *
 * @internal
 */
export class MultiSourceField implements WritableAtom<unknown> {
  readonly #sources: NonEmptySources;
  readonly #parts: string[];
  readonly #activeUnsubs = new Set<() => void>();
  readonly id: number = ++nextMultiSourceFieldId;
  flags: number = 0;
  _lastSeenEpoch: number = -1;

  constructor(sources: NonEmptySources, dotPath: string) {
    this.#sources = sources;
    this.#parts = dotPath.split('.');
  }

  get isDisposed(): boolean {
    return (this.flags & DISPOSED_FLAG) !== 0;
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.flags |= DISPOSED_FLAG;
    const active = Array.from(this.#activeUnsubs);
    this.#activeUnsubs.clear();
    for (let i = 0; i < active.length; i++) {
      active[i]?.();
    }
  }

  get value(): unknown {
    let resolved: unknown;
    for (let i = 0; i < this.#sources.length; i++) {
      const source = this.#sources[i];
      if (!source) continue;
      const val = getPathValue(source.value, this.#parts);
      if (val !== undefined || i === 0) {
        resolved = val;
      }
    }
    return resolved;
  }

  set value(targetValue: unknown) {
    if (this.isDisposed) return;
    const owner = resolveOwner(this.#sources, this.#parts);
    const current = owner.peek();
    const next = setDeepValue(current, this.#parts as never, 0, targetValue);
    if (next !== current) owner.value = next;
  }

  peek(): unknown {
    for (let i = this.#sources.length - 1; i >= 0; i--) {
      const source = this.#sources[i];
      if (source) {
        const val = getPathValue(source.peek(), this.#parts);
        if (val !== undefined) return val;
      }
    }
    return getPathValue(this.#sources[0].peek(), this.#parts);
  }

  subscribe(listener: SubscriberTarget<unknown>): () => void {
    if (this.isDisposed) return () => {};
    let previous = this.peek();
    const isFn = typeof listener === 'function';
    const unsubs = this.#sources.map((source) =>
      source.subscribe(() => {
        if (this.isDisposed) return;
        const current = this.peek();
        if (!shallowEqual(current, previous)) {
          const old = previous;
          previous = current;
          if (isFn) {
            listener(current, old);
          } else {
            listener.execute();
          }
        }
      })
    );
    const unsub = () => {
      this.#activeUnsubs.delete(unsub);
      for (let i = 0; i < unsubs.length; i++) unsubs[i]?.();
    };
    this.#activeUnsubs.add(unsub);
    return unsub;
  }

  subscriberCount(): number {
    return this.#activeUnsubs.size;
  }

  get version(): number {
    let max = 0;
    for (let i = 0; i < this.#sources.length; i++) {
      const v = this.#sources[i]?.version ?? 0;
      if (v > max) max = v;
    }
    return max;
  }
  get isComputed(): boolean {
    return false;
  }
  get isRejected(): boolean {
    return false;
  }
  get hasError(): boolean {
    return false;
  }
  get [BRAND](): number {
    return (BrandFlags.Atom | BrandFlags.Writable) as number;
  }
}
