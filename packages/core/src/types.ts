import type { AsyncState } from '@/constants';
import type { DependencyLink } from '@/core/dep-tracking';

export interface AtomOptions {
  sync?: boolean;
}

export interface ReadonlyAtom<T = unknown> {
  readonly value: T;
  subscribe(listener: (newValue?: T, oldValue?: T) => void): () => void;
  peek(): T;
}

export interface WritableAtom<T = unknown> extends ReadonlyAtom<T> {
  value: T;
  dispose(): void;
}

export type Branded<T, Brand> = T & { readonly __brand: Brand };
export type DependencyId = Branded<number, 'DependencyId'>;

export interface Poolable {
  reset(): void;
}
export interface Subscriber {
  execute(): void;
}

export interface Dependency {
  readonly id: DependencyId;
  version: number;
  flags: number;
  _lastSeenEpoch: number;
  _tempUnsub?: (() => void) | undefined;
  _modifiedAtEpoch?: number;
  subscribe(listener: (() => void) | Subscriber): () => void;
  peek?(): unknown;
  value?: unknown;
}

export interface DependencyEntry<T extends object = Dependency> {
  ref: WeakRef<T>;
  unsubscribe: () => void;
}

export interface DebugConfig {
  enabled: boolean;
  maxDependencies: number;
  warnInfiniteLoop: boolean;
  warn(condition: boolean, message: string): void;
  checkCircular(dep: Dependency, current: object): void;
  attachDebugInfo(obj: object, type: string, id: number): void;
  getDebugName(obj: object | null | undefined): string | undefined;
  getDebugType(obj: object | null | undefined): string | undefined;
}

export type TransformFunction<T, U> = (value: T) => U;
export interface ComputationContext {
  links: DependencyLink[];
}
export type AsyncStateType = (typeof AsyncState)[keyof typeof AsyncState];

export interface ComputedOptions<T = unknown> {
  equal?: (a: T, b: T) => boolean;
  defaultValue?: T;
  lazy?: boolean;
  onError?: (error: Error) => void;
}

export interface ComputedAtom<T = unknown> extends ReadonlyAtom<T> {
  readonly state: AsyncStateType;
  readonly hasError: boolean;
  readonly lastError: Error | null;
  readonly isPending: boolean;
  readonly isResolved: boolean;
  readonly errors: readonly Error[];
  readonly isValid: boolean;
  invalidate(): void;
  dispose(): void;
}

export interface EffectExecutionContext {
  prevLinks: DependencyLink[];
  nextLinks: DependencyLink[];
}

export interface EffectOptions {
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  trackModifications?: boolean;
  onError?: (error: unknown) => void;
}

export interface EffectObject {
  dispose(): void;
  run(): void;
  readonly isDisposed: boolean;
  readonly executionCount: number;
}

export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;

export interface IScheduler<T> {
  markDirty(atom: T): void;
  scheduleNotify(atom: T): void;
}

export interface IAtom {
  readonly id: number;
  version: number;
  _internalNotifySubscribers(): void;
  recompute?(): void;
}

export interface PoolStats {
  acquired: number;
  released: number;
  rejected: { frozen: number; tooLarge: number; poolFull: number };
  leaked: number;
  poolSize: number;
}
