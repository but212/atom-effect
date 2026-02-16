import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { atom } from '@/core/atom';
import { effect } from '@/core/effect';
import { batch } from '@/internal/batch';
import { resetFlushState, startFlush } from '@/internal/epoch';

describe('Infinite Loop Detection (Epoch Based)', () => {
  afterEach(() => {
    resetFlushState();
  });

  it('should detect infinite loop in a batched flush cycle', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const count = atom(0);
    let executions = 0;

    // Run batch - it should NOT throw, but should log error
    batch(() => {
      effect(() => {
        executions++;
        const val = count.value;
        if (val < 200) {
          count.value = val + 1;
        }
      });
      count.value = 1;
    });

    // Verify error was logged
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected \(per-effect\)/),
      })
    );

    expect(executions).toBeGreaterThan(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT);
    expect(executions).toBeLessThan(200);

    consoleSpy.mockRestore();
  });

  it('should NOT allow bypassing detection by calling startFlush inside effect', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const count = atom(0);
    let executions = 0;

    batch(() => {
      effect(() => {
        executions++;
        const val = count.value;

        // Try to bypass detection
        startFlush();

        if (val < 200) {
          count.value = val + 1;
        }
      });
      count.value = 1;
    });

    // Should still detect loop
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected \(per-effect\)/),
      })
    );

    // Should warn about bypass attempt
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('startFlush() called during flush')
    );

    expect(executions).toBeLessThan(200);
    expect(executions).toBeGreaterThan(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT);

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('should allow valid executions within limit without triggering detection', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const count = atom(0);
    let executions = 0;
    const LIMIT = SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT - 5;

    batch(() => {
      effect(() => {
        executions++;
        const val = count.value;
        if (val < LIMIT) {
          count.value = val + 1;
        }
      });
      count.value = 1;
    });

    // Should complete all iterations without triggering infinite loop detection
    expect(executions).toBeGreaterThanOrEqual(LIMIT);
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected/),
      })
    );

    consoleSpy.mockRestore();
  });
});
