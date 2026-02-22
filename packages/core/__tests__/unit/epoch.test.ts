import { describe, expect, it, vi } from 'vitest';
import { SMI_MAX } from '@/constants';
import {
  currentEpoch,
  currentFlushEpoch,
  endFlush,
  incrementFlushExecutionCount,
  nextEpoch,
  nextVersion,
  resetFlushState,
  startFlush,
} from '@/internal/epoch';

describe('epoch', () => {
  it('generates sequential non-zero epochs', () => {
    const previous = currentEpoch();
    const next = nextEpoch();

    expect(next).not.toBe(previous);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(SMI_MAX);
  });

  it('calculates next version with wrap-around', () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(SMI_MAX)).toBe(0);
  });

  it('manages flush lifecycle and state', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    resetFlushState();
    expect(incrementFlushExecutionCount()).toBe(0); // idle — no counting

    expect(startFlush()).toBe(true);
    const epochAfterStart = currentFlushEpoch();
    expect(epochAfterStart).toBeGreaterThan(0);

    // Re-entrancy blocked — epoch must not advance
    expect(startFlush()).toBe(false);
    expect(consoleWarn).toHaveBeenCalled();
    expect(currentFlushEpoch()).toBe(epochAfterStart);

    expect(incrementFlushExecutionCount()).toBe(1);
    expect(incrementFlushExecutionCount()).toBe(2);

    // endFlush resets isFlushing — increments return 0, restart allowed
    endFlush();
    expect(incrementFlushExecutionCount()).toBe(0);
    expect(startFlush()).toBe(true);

    endFlush();
    consoleWarn.mockRestore();
  });
});
