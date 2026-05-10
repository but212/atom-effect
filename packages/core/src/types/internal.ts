import type { KIND } from '@/constants';
import type { DependencyId } from './base';
import type { Dependency, Subscriber } from './reactive';

/**
 * Internal state for the reactive tracking system.
 * @internal
 */
export interface TrackingContext {
  stack: (DependencySubscriber | null)[];
  current: DependencySubscriber | null;
}

/**
 * Interface for nodes capable of recording reactive dependencies.
 * @internal
 */
export interface DependencySubscriber {
  addDependency(dep: Dependency): void;
}

/**
 * Interface for nodes that can be scheduled for re-execution.
 * @internal
 */
export interface ExecutableSubscriber {
  execute(): void;
}

/**
 * Unified interface for nodes that both consume dependencies and execute logic.
 * @internal
 */
export interface DependencyTracker extends DependencySubscriber, ExecutableSubscriber {}

/** @internal */
export type SubscriberKind = (typeof KIND)[keyof typeof KIND];

/** @internal */
export type SubscriberTarget<T> = ((newValue?: T, oldValue?: T) => void) | Subscriber;

/** Diagnostic metrics for memory and resource management. @internal */
export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}

/**
 * Internal interface for engine instrumentation and debugging.
 * @internal
 */
export interface DebugConfig {
  enabled: boolean;
  warnInfiniteLoop: boolean;
  trackGraph: boolean;
  warn(condition: boolean, message: string): void;
  attachDebugInfo(obj: object, type: string, id: number, customName?: string): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
  trackUpdate(id: DependencyId, name?: string): void;
  registerNode(node: object & { id: DependencyId }): void;
  trackEvaluationFailure(id: DependencyId): void;
  dumpGraph(): Record<string, unknown>[];
}

/**
 * Metadata for reactive nodes used in hot paths.
 * @internal
 */
export interface InternalNode {
  _trackEpoch: number;
  _trackCount: number;
  _error: Error | null;
  isRejected: boolean;
}
