import type { Dependency } from '@/types';

/**
 * Represents an entity that consumes dependencies (sinks).
 * Usually a computed property, an effect, or a temporary listener.
 */
export interface DependencySubscriber {
  /**
   * Registers a dependency relationship.
   * Called by the dependency when it is accessed.
   */
  addDependency(dep: Dependency): void;
}

/**
 * Represents an executable reactive unit.
 * Something that can be run to re-establish its state or side-effects.
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * The intersection of tracking and execution.
 * A complete Reactive Node usually implements both.
 */
export interface DependencyTracker
  extends Partial<DependencySubscriber>,
    Partial<ExecutableSubscriber> {}

/**
 * A loose type for functions that *might* want to track dependencies,
 * or simple callbacks used in tests/adhoc contexts.
 */
export type TrackableFunction = (() => void) & Partial<DependencySubscriber>;

/**
 * The union of all things that can sit on the `TrackingContext` stack.
 */
export type Listener = DependencyTracker | TrackableFunction;
