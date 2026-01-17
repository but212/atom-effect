import type { AsyncState } from '@/constants';
import type { ReadonlyAtom } from './atom';

/** Type derived from AsyncState constant values */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

/** Configuration options for creating a computed atom. */
export interface ComputedOptions<T = unknown> {
  /** Optional custom equality check for values. Defaults to `Object.is`. */
  equal?: (a: T, b: T) => boolean;
  /** Initial value to return while an async computation is pending. */
  defaultValue?: T;
  /** If true, the computation is deferred until the value is first accessed. */
  lazy?: boolean;
  /** Optional error handler for computation failures. */
  onError?: (error: Error) => void;
}

/** Represents a reactive atom whose value is derived from other reactive state. */
export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  /** Current asynchronous state of the computation. */
  readonly state: AsyncStateType;
  /** true if self or any dependency has an error. */
  readonly hasError: boolean;
  /** The error object from the last failed computation, if any. */
  readonly lastError: Error | null;
  /** true if an asynchronous computation is currently in progress. */
  readonly isPending: boolean;
  /** true if the computation has successfully completed and has a value. */
  readonly isResolved: boolean;
  /** Accumulated errors from self and all dependencies (immutable). */
  readonly errors: readonly Error[];
  /** true if no errors in self or dependencies (inverse of hasError). */
  readonly isValid: boolean;
  /** Manually invalidates the cached value, forcing recomputation on next access. */
  invalidate(): void;
  /** Disposed of the computed atom and its subscriptions. */
  dispose(): void;
}
