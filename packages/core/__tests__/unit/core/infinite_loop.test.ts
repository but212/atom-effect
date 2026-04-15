import { afterEach, describe, expect, it, vi } from 'vitest';
import { SCHEDULER_CONFIG } from '@/constants';
import { batch, resetFlushState, startFlush } from '@/core/scheduler';
import { atom, effect } from '@/index';

describe('Infinite Loop Detection (Epoch Based)', () => {
  afterEach(() => {
    resetFlushState();
  });

  it('detects loop, logs error, and disposes the effect', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const count = atom(0);
    let executions = 0;

    const e = effect(() => {
      executions++;
      const val = count.value;
      if (val < 200) count.value = val + 1;
    });

    batch(() => {
      count.value = 1;
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected \(per-effect\)/),
      })
    );
    expect(executions).toBeGreaterThan(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT);
    expect(executions).toBeLessThan(200);
    expect(e.isDisposed).toBe(true);

    consoleSpy.mockRestore();
  });

  it('does not affect sibling effects when one triggers loop detection', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const trigger = atom(0);
    const other = atom(0);

    effect(() => {
      const val = trigger.value;
      if (val < 200) trigger.value = val + 1;
    });

    const sibling = effect(() => {
      other.value;
    });

    batch(() => {
      trigger.value = 1;
    });

    expect(sibling.isDisposed).toBe(false);
    sibling.dispose();
    consoleSpy.mockRestore();
  });

  it('respects custom maxExecutionsPerFlush option', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const CUSTOM_LIMIT = 10;
    const count = atom(0);
    let executions = 0;

    batch(() => {
      effect(
        () => {
          executions++;
          const val = count.value;
          if (val < 200) count.value = val + 1;
        },
        { maxExecutionsPerFlush: CUSTOM_LIMIT }
      );
      count.value = 1;
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected \(per-effect\)/),
      })
    );
    expect(executions).toBeGreaterThan(CUSTOM_LIMIT);
    expect(executions).toBeLessThan(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT);

    consoleSpy.mockRestore();
  });

  it('does not allow bypassing detection via startFlush() inside effect', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const count = atom(0);

    batch(() => {
      effect(() => {
        const val = count.value;
        startFlush(); // bypass attempt — should be ignored
        if (val < 200) count.value = val + 1;
      });
      count.value = 1;
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected \(per-effect\)/),
      })
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('startFlush() called during flush')
    );

    consoleSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('completes normally when executions stay within limit', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const LIMIT = SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT - 5;
    const count = atom(0);
    let executions = 0;

    batch(() => {
      effect(() => {
        executions++;
        const val = count.value;
        if (val < LIMIT) count.value = val + 1;
      });
      count.value = 1;
    });

    expect(executions).toBeGreaterThanOrEqual(LIMIT);
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected/),
      })
    );

    consoleSpy.mockRestore();
  });

  it('resets per-effect counter between flushes so accumulated count does not false-trigger', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const HALF = Math.floor(SCHEDULER_CONFIG.MAX_EXECUTIONS_PER_EFFECT / 2);
    const count = atom(0);

    const e = effect(() => {
      count.value;
    });

    batch(() => {
      for (let i = 0; i < HALF; i++) count.value = i;
    });
    batch(() => {
      for (let i = 0; i < HALF; i++) count.value = i + 100;
    });

    expect(e.isDisposed).toBe(false);
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringMatching(/Infinite loop detected/),
      })
    );

    e.dispose();
    consoleSpy.mockRestore();
  });

  it('disposes looping effect while preserving unrelated effects', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const loopAtom = atom(0);
    const cleanAtom = atom(0);

    const looper = effect(() => {
      const val = loopAtom.value;
      if (val < 200) loopAtom.value = val + 1;
    });
    const clean = effect(() => {
      cleanAtom.value;
    });

    batch(() => {
      loopAtom.value = 1;
    });

    expect(looper.isDisposed).toBe(true);
    expect(clean.isDisposed).toBe(false);

    clean.dispose();
    consoleSpy.mockRestore();
  });
});
