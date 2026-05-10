import type { AsyncState } from '@/constants';

/** A unique monotonic identifier for reactive dependencies. */
export type DependencyId = number;

/**
 * Interface for objects requiring explicit resource release (timers, observers, listeners).
 */
export interface Disposable {
  /**
   * Releases internal resources and detaches from the reactive graph.
   */
  dispose(): void;
}

/** Represents the possible states of an asynchronous reactive node. */
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];
