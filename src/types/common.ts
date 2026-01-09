/**
 * Interface for poolable objects
 */
export interface Poolable {
  reset(): void;
}

/**
 * Subscriber interface for dependency notifications
 */
export interface Subscriber {
  execute(): void;
}

/**
 * Interface for subscribable dependencies
 */
export interface Dependency {
  readonly id: number;
  version: number;
  /**
   * Last epoch seen by this dependency (used for invalidation)
   */
  _lastSeenEpoch: number;

  /**
   * Temporary field for O(N) sync strategy (avoiding Map/indexOf)
   * @internal
   */
  _tempUnsub?: (() => void) | undefined;

  /**
   * Epoch when this dependency was last modified (for debug/tracking)
   * @internal
   */
  _modifiedAtEpoch?: number;

  /**
   * Epoch when this dependency was last visited (for circular check)
   * @internal
   */
  _visitedEpoch?: number;

  /**
   * Subscribe to dependency updates
   */
  subscribe(listener: (() => void) | Subscriber): () => void;

  /**
   * Peek at value without subscribing
   */
  peek?(): unknown;

  /**
   * Current value (if cached)
   */
  value?: unknown;
}

/**
 * WeakRef-based dependency entry structure
 */
export interface DependencyEntry<T extends object = Dependency> {
  ref: WeakRef<T>;
  unsubscribe: () => void;
}

/**
 * Debug configuration interface
 */
export interface DebugConfig {
  enabled: boolean;
  maxDependencies: number;
  warnInfiniteLoop: boolean;
  warn(condition: boolean, message: string): void;
  checkCircular(dep: unknown, current: unknown, visited?: Set<unknown>): void;
  attachDebugInfo(obj: object, type: string, id: number): void;
  getDebugName(obj: unknown): string | undefined;
  getDebugType(obj: unknown): string | undefined;
}

/**
 * Transform function type
 */
export type TransformFunction<T, U> = (value: T) => U;
