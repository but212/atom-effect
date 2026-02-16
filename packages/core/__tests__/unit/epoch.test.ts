import { describe, expect, it, vi } from 'vitest';
import { SMI_MAX } from '@/constants';
import {
  currentEpoch,
  currentFlushEpoch,
  endFlush,
  flushExecutionCount,
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

    // 1. Should update current epoch
    expect(next).toBe(currentEpoch());
    expect(next).not.toBe(previous);

    // 2. Boundary Check (1 <= epoch <= SMI_MAX)
    // nextEpoch logic: (val + 1) & SMI_MAX || 1
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(SMI_MAX);
  });

  it('calculates next version with wrap-around', () => {
    // Pure function logic verification
    expect(nextVersion(1)).toBe(2);
    expect(nextVersion(SMI_MAX)).toBe(0);
  });

  it('manages flush lifecycle and state', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // 0. Initial State
    resetFlushState();
    expect(incrementFlushExecutionCount()).toBe(0); // Should not count when idle

    // 1. Start Flush
    expect(startFlush()).toBe(true);
    expect(currentFlushEpoch()).toBeGreaterThan(0);

    // 2. Prevent Re-entrancy
    expect(startFlush()).toBe(false);
    expect(consoleWarn).toHaveBeenCalled();

    // 3. Increment Counts
    expect(incrementFlushExecutionCount()).toBe(1);
    expect(incrementFlushExecutionCount()).toBe(2);
    expect(flushExecutionCount).toBe(2);

    // 4. Reset
    resetFlushState();
    expect(flushExecutionCount).toBe(0);
    expect(currentFlushEpoch()).toBe(0);

    // 5. Restartable
    expect(startFlush()).toBe(true);

    // Cleanup
    endFlush();
    consoleWarn.mockRestore();
  });
});
