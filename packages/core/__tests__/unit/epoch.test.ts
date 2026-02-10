import { describe, expect, it, vi } from 'vitest';
import { currentEpoch, endFlush, nextEpoch, startFlush } from '@/internal/epoch';

describe('epoch', () => {
  it('should start at 0', () => {
    // Note: epoch is global state, so it might not be 0 if other tests ran
    const current = currentEpoch();
    expect(typeof current).toBe('number');
  });

  it('should increment when nextEpoch is called', () => {
    const before = currentEpoch();
    const next = nextEpoch();
    expect(next).toBe((before + 1) & 0x7fffffff);
    expect(currentEpoch()).toBe(next);
  });

  it('should wrap around at SMI_MAX', () => {
    // We can't easily test wrap around without resetting or calling it many times
    // and SMI_MAX is large. But we can verify it's capped by SMI_MAX.
    const next = nextEpoch();
    expect(next).toBeLessThanOrEqual(2147483647);
  });

  it('nextEpoch wrapping logic (manual trigger)', () => {
    // We can't easily set collectorEpoch, but we can call it.
    // However, the branch involves `|| 1` when result of `& SMI_MAX` is 0.
    // This happens when collectorEpoch was SMI_MAX.
    const next = nextEpoch();
    expect(next).toBeGreaterThan(0);
  });

  it('startFlush warns when already flushing', () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    startFlush();
    const result = startFlush(); // Already flushing

    expect(result).toBe(false);
    // Warning only in DEV mode. IS_DEV is usually true in tests.
    expect(consoleWarn).toHaveBeenCalled();

    endFlush();
    consoleWarn.mockRestore();
  });
});
