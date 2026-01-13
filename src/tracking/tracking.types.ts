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
