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
  _lastSeenEpoch: number;
  subscribe(listener: (() => void) | Subscriber): () => void;
  peek?(): unknown;
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
