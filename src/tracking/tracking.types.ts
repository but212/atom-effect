import type { Dependency } from '@/types';

/** Subscriber capable of tracking dependencies. */
export interface DependencySubscriber {
  /** Registers a dependency. */
  addDependency: (dep: Dependency) => void;
}

/** Subscriber capable of being executed. */
export interface ExecutableSubscriber {
  /** Triggers the execution logic. */
  execute: () => void;
}

/** Combined interface for tracking and execution. */
export interface DependencyTracker {
  addDependency?: (dep: Dependency) => void;
  execute?: () => void;
}

/** A function that may optionally include dependency tracking. */
export type TrackableFunction = (() => void) & Partial<DependencySubscriber>;

/** A listener that is either a structured tracker or a plain callback. */
export type Listener = DependencyTracker | TrackableFunction;

/** Internal guard to verify if a value is a non-null object. */
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Checks if the value implements the DependencySubscriber interface. */
export function hasDependencyMethod(value: unknown): value is DependencySubscriber {
  if (isNonNullObject(value)) {
    return typeof value.addDependency === 'function';
  }
  if (typeof value === 'function') {
    return typeof (value as TrackableFunction).addDependency === 'function';
  }
  return false;
}

/** Checks if the value is a function with an addDependency method. */
export function isTrackableFunction(
  value: unknown
): value is TrackableFunction & DependencySubscriber {
  return (
    typeof value === 'function' && typeof (value as TrackableFunction).addDependency === 'function'
  );
}

/** Checks if the value is a plain function without tracking capabilities. */
export function isPlainListener(value: unknown): value is () => void {
  return (
    typeof value === 'function' && typeof (value as TrackableFunction).addDependency !== 'function'
  );
}

/** Checks if the value implements the ExecutableSubscriber interface. */
export function hasExecuteMethod(value: unknown): value is ExecutableSubscriber {
  return isNonNullObject(value) && typeof value.execute === 'function';
}
