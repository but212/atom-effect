/**
 * @module Form Field Atoms
 *
 * Responsibility:
 * Atom adapters that back a single form control: multi-source ownership resolution and
 * transform/onChange interception around a field lens.
 */

import {
  BRAND,
  getPathValue,
  mergeLenses,
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
 * Resolves which source atom owns a field path, mirroring the read precedence of a merged lens
 * (later sources win) while keeping writes partitioned to a single source. When no source defines
 * the path yet, the first source takes ownership.
 *
 * Ownership is resolved per operation, never cached: a source may gain or drop the path at any
 * time, and both the read and the write of a field must follow the current owner.
 *
 * @internal
 */
function resolveOwner(sources: WritableAtom<unknown>[], dotPath: string): WritableAtom<object> {
  const parts = dotPath.split('.');
  for (let i = sources.length - 1; i >= 0; i--) {
    const source = sources[i];
    if (source && getPathValue(source.peek(), parts) !== undefined) {
      return source as WritableAtom<object>;
    }
  }
  return sources[0] as WritableAtom<object>;
}

/**
 * Role: Multi-Source Field Atom
 *
 * Design Intent:
 * Backs one form field when {@link bindForm} is given several source atoms. Reads resolve through
 * the merged view, so a read depends on *every* source and therefore stays correct when ownership
 * moves after mount. Writes resolve the owning source at dispatch time and mutate only that source,
 * so a field never corrupts a sibling source.
 *
 * Constraint:
 * The read path must never be narrowed to a single source: doing so re-attaches the field to a
 * stale owner as soon as a later source defines the path.
 *
 * @internal
 */
export class MultiSourceField extends DelegatingAtom {
  readonly #sources: WritableAtom<unknown>[];
  readonly #parts: string[];

  constructor(sources: WritableAtom<unknown>[], dotPath: string) {
    super(mergeLenses(...(sources as WritableAtom<object>[])) as WritableAtom<object>);
    this.#sources = sources;
    this.#parts = dotPath.split('.');
  }

  get value(): unknown {
    // Tracking happens on the merged node, so every source is a dependency.
    return getPathValue(this.node.value, this.#parts);
  }

  set value(targetValue: unknown) {
    const owner = resolveOwner(this.#sources, this.#parts.join('.'));
    const current = owner.peek();
    const next = setDeepValue(current, this.#parts as never, 0, targetValue);
    if (next !== current) owner.value = next;
  }

  peek(): unknown {
    return getPathValue(this.node.peek(), this.#parts);
  }

  /**
   * The merged node notifies on any source change, so subscriber notification is filtered to the
   * cases where this field's own value actually changed.
   */
  subscribe(listener: (newValue?: unknown, oldValue?: unknown) => void): () => void {
    let previous = this.peek();
    return this.node.subscribe((newValue?: unknown) => {
      const current = getPathValue(newValue, this.#parts);
      if (shallowEqual(current, previous)) return;
      const old = previous;
      previous = current;
      listener(current, old);
    });
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
