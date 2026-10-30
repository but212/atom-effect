/**
 * @module Form Field Atoms
 *
 * Responsibility:
 * Atom adapters that back a single form control: multi-source ownership resolution and
 * transform/onChange interception around a field lens.
 */

import {
  BRAND,
  BrandFlags,
  getPathValue,
  type Paths,
  type PathValue,
  setDeepValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import { Result, shallowEqual } from '@but212/atom-effect-utils';
import type { FormOptions } from '@/types';

/**
 * Role: Delegating Atom Base
 *
 * Forwards the reactive-node surface (identity, version, flags, brand, lifecycle) to a wrapped
 * node, so subclasses only define how reads, writes and subscriptions differ from it.
 *
 * @internal
 */
abstract class DelegatingAtom implements WritableAtom<unknown> {
  protected readonly node: WritableAtom<unknown>;

  constructor(node: WritableAtom<unknown>) {
    this.node = node;
  }

  abstract get value(): unknown;
  abstract set value(targetValue: unknown);

  peek(): unknown {
    return this.node.peek();
  }

  subscribe(listener: (newValue?: unknown, oldValue?: unknown) => void): () => void {
    return this.node.subscribe(listener);
  }

  subscriberCount(): number {
    return this.node.subscriberCount();
  }

  dispose(): void {
    this.node.dispose();
  }

  get isDisposed(): boolean {
    return (this.node as unknown as { isDisposed?: boolean }).isDisposed ?? false;
  }

  get id(): number {
    return this.node.id;
  }
  get version(): number {
    return this.node.version;
  }
  get flags(): number {
    return this.node.flags;
  }
  get _lastSeenEpoch(): number {
    return this.node._lastSeenEpoch;
  }
  get isComputed(): boolean {
    return this.node.isComputed;
  }
  get isRejected(): boolean {
    // SAFETY: `isRejected` exists on the reactive node at runtime but is absent from the public
    // `WritableAtom` type, so the delegation cannot be typed directly.
    return (this.node as unknown as { isRejected: boolean }).isRejected ?? false;
  }
  get hasError(): boolean {
    return this.node.hasError;
  }
  get [BRAND](): number {
    return this.node[BRAND] ?? 0;
  }
}

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
function resolveOwner(sources: WritableAtom<unknown>[], parts: string[]): WritableAtom<object> {
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
  readonly #sources: WritableAtom<unknown>[];
  readonly #parts: string[];
  readonly id: number = ++nextMultiSourceFieldId;
  flags: number = 0;
  _lastSeenEpoch: number = -1;

  constructor(sources: WritableAtom<unknown>[], dotPath: string) {
    this.#sources = sources;
    this.#parts = dotPath.split('.');
  }

  get isDisposed(): boolean {
    return (this.flags & DISPOSED_FLAG) !== 0;
  }

  dispose(): void {
    this.flags |= DISPOSED_FLAG;
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
    return getPathValue(this.#sources[0]?.peek(), this.#parts);
  }

  subscribe(listener: (newValue?: unknown, oldValue?: unknown) => void): () => void {
    if (this.isDisposed) return () => {};
    let previous = this.peek();
    const unsubs = this.#sources.map((source) =>
      source.subscribe(() => {
        const current = this.peek();
        if (!shallowEqual(current, previous)) {
          const old = previous;
          previous = current;
          listener(current, old);
        }
      })
    );
    return () => {
      for (let i = 0; i < unsubs.length; i++) unsubs[i]?.();
    };
  }

  subscriberCount(): number {
    let total = 0;
    for (let i = 0; i < this.#sources.length; i++) {
      total += this.#sources[i]?.subscriberCount() ?? 0;
    }
    return total;
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

/**
 * Role: Interception Wrapper Class
 *
 * Design Intent:
 * Direct WritableAtom implementation delegating to baseLens, avoiding Proxy overhead
 * and repeated .bind() dynamic allocations on hot path.
 *
 * @internal
 */
export class InterceptedLens<T extends object, U> extends DelegatingAtom {
  readonly #name: string;
  readonly #transform: FormOptions<U>['transform'];
  readonly #onChange: FormOptions<U>['onChange'];

  constructor(
    name: string,
    baseLens: WritableAtom<PathValue<T, Paths<T>>>,
    options: FormOptions<U>
  ) {
    super(baseLens);
    this.#name = name;
    this.#transform = options.transform;
    this.#onChange = options.onChange;
  }

  get value(): PathValue<T, Paths<T>> {
    return this.node.value as PathValue<T, Paths<T>>;
  }

  set value(targetValue: unknown) {
    let transformed = targetValue;
    const transform = this.#transform;
    if (transform) {
      const transformResult = Result.tryCatch(() => transform(this.#name, targetValue));
      if (Result.isErr(transformResult)) {
        console.error(
          `[bindForm] Transform error in field "${this.#name}":`,
          transformResult.error
        );
      } else {
        transformed = transformResult.value;
      }
    }
    this.node.value = transformed;
    const onChange = this.#onChange;
    if (onChange) {
      const onChangeResult = Result.tryCatch(() =>
        untracked(() => onChange(this.#name, transformed))
      );
      if (Result.isErr(onChangeResult)) {
        console.error(`[bindForm] onChange error in field "${this.#name}":`, onChangeResult.error);
      }
    }
  }
}
