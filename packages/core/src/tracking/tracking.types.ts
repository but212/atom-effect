import type { Dependency } from '@/types';

/**
 * Dependency consumer.
 */
export interface DependencySubscriber {
  /**
   * Registers dependency.
   */
  addDependency(dep: Dependency): void;
}

/**
 * Executable unit.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Dependency tracker.
 */
export interface DependencyTracker
  extends Partial<DependencySubscriber>,
    Partial<ExecutableSubscriber> {}

/**
 * Trackable function.
 */
export type TrackableFunction = (() => void) & Partial<DependencySubscriber>;

/**
 * Listener.
 */
export type Listener = DependencyTracker | TrackableFunction;
