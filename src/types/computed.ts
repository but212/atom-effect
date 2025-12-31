import { ReadonlyAtom } from './atom';

export type AsyncStateType = 'idle' | 'pending' | 'resolved' | 'rejected';

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
  invalidate(): void;
  dispose(): void;
}
