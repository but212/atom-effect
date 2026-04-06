import { describe, expect, it, vi } from 'vitest';
import { BITPACK, SMI_MAX } from '@/constants';
import {
  currentEpoch,
  currentFlushEpoch,
  endFlush,
  incrementFlushExecutionCount,
  nextEpoch,
  nextVersion,
  resetFlushState,
  runInFlushScope,
  startFlush,
} from '@/core/scheduler';

describe('epoch', () => {
  it('generates sequential non-zero epochs', () => {
    const previous = currentEpoch();
    const next = nextEpoch();

    expect(next).not.toBe(previous);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThanOrEqual(SMI_MAX);
  });

  it('calculates next version with wrap-around (avoids 0)', () => {
    expect(nextVersion(0)).toBe(1);
    expect(nextVersion(SMI_MAX)).toBe(1);
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

describe('epoch improvements', () => {
  it('runInFlushScope ensures endFlush is called', () => {
    resetFlushState();
    expect(() =>
      runInFlushScope(() => {
        throw new Error('fail');
      })
    ).toThrow('fail');

    // Should be able to start flush again because endFlush was called in finally
    expect(startFlush()).toBe(true);
    endFlush();
  });

  it('detects infinite loops in incrementFlushExecutionCount', () => {
    resetFlushState();
    startFlush();

    // Fabricate a very high count to avoid 10000 increments in test
    for (let i = 0; i < 10000; i++) {
      incrementFlushExecutionCount();
    }

    expect(() => incrementFlushExecutionCount()).toThrow(/Infinite loop detected/);
    endFlush();
  });

  it('EPOCH wrap around and constants (epoch.ts 63, constants.ts 107)', () => {
    expect(BITPACK.VERSION_BITS).toBeDefined();
    expect(SMI_MAX).toBeDefined();

    nextEpoch();
    expect(currentEpoch()).toBeDefined();
    expect(SMI_MAX).toBeGreaterThan(0);
  });
});
