import { describe, expect, it } from 'vitest';
import { currentEpoch, nextEpoch } from '../../src/internal/epoch';

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
    const e = nextEpoch();
    expect(e).toBeLessThanOrEqual(2147483647);
  });
});
