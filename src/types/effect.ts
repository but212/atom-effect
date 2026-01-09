export interface EffectOptions {
  sync?: boolean;
  maxExecutionsPerSecond?: number;
  maxExecutionsPerFlush?: number;
  trackModifications?: boolean;
}

export interface EffectObject {
  dispose(): void;
  run(): void;
  readonly isDisposed: boolean;
  readonly executionCount: number;
}

export type EffectFunction = () => void | (() => void) | Promise<undefined | (() => void)>;
