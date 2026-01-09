import { IS_DEV, SMI_MAX } from './constants';

let collectorEpoch = 0;

export function nextEpoch(): number {
  collectorEpoch = ((collectorEpoch + 1) | 0) & SMI_MAX;
  return collectorEpoch;
}

export function currentEpoch(): number {
  return collectorEpoch;
}

// === Infinite Loop Detection State ===

export let flushEpoch = 0;
export let flushExecutionCount = 0;
let isFlushing = false;

export function startFlush(): boolean {
  if (isFlushing) {
    if (IS_DEV) {
      console.warn(
        'Warning: startFlush() called during flush - ignored to prevent infinite loop detection bypass'
      );
    }
    return false;
  }

  isFlushing = true;
  flushEpoch = (flushEpoch + 1) & SMI_MAX;
  flushExecutionCount = 0;
  return true;
}

export function endFlush(): void {
  isFlushing = false;
}

export function incrementFlushExecutionCount(): number {
  if (!isFlushing) return 0;
  return ++flushExecutionCount;
}

export function resetFlushState(): void {
  flushEpoch = 0;
  flushExecutionCount = 0;
  isFlushing = false;
}
