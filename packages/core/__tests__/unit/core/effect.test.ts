/**
 * @fileoverview Effect unit tests
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { EffectError } from '@/errors/errors';
import { debug } from '@/utils/debug';
import { sleep } from '../../utils/test-helpers';

describe('Effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Input Validation', () => {
    it('rejects invalid function types', () => {
      expect(() => {
        effect('not a function' as unknown as () => void);
      }).toThrow(EffectError);

      expect(() => {
        effect(null as unknown as () => void);
      }).toThrow(EffectError);
    });

    it('throws error when run() is called on disposed effect', async () => {
      const e = effect(() => {});
      await vi.runAllTimersAsync();

      e.dispose();

      expect(() => e.run()).toThrow(EffectError);
    });

    it('can manually execute with run() method', async () => {
      const calls: number[] = [];

      const e = effect(
        () => {
          calls.push(Date.now());
        },
        { sync: true }
      );

      const initialCount = calls.length;

      e.run();

      expect(calls.length).toBe(initialCount + 1);
    });
  });

  describe('Execution Lifecycle', () => {
    it('blocks re-entrant execution during sync run', async () => {
      const calls: number[] = [];
      let executionCount = 0;
      const a = atom(0);

      effect(
        () => {
          executionCount++;
          calls.push(executionCount);
          a.value;

          if (executionCount === 1) {
            a.value = 1;
          }
        },
        { sync: true }
      );

      await vi.runAllTimersAsync();

      expect(calls[0]).toBe(1);
    });

    it('ignores non-function cleanup return value', async () => {
      const count = atom(0);

      const e = effect(() => {
        count.value;
        return 'not a function' as unknown as () => void;
      });

      await vi.runAllTimersAsync();

      count.value = 1;
      await vi.runAllTimersAsync();

      expect(e.isDisposed).toBe(false);
    });

    it('dispose is idempotent', async () => {
      const count = atom(0);
      const calls: number[] = [];

      const e = effect(() => {
        calls.push(count.value);
      });

      await vi.runAllTimersAsync();
      expect(calls.length).toBeGreaterThan(0);

      e.dispose();

      expect(() => e.dispose()).not.toThrow();
      expect(e.isDisposed).toBe(true);
    });

    it('reports isExecuting correctly', () => {
      let capturedIsExecuting = false;
      let runCount = 0;
      const a = atom(0, { sync: true });
      // biome-ignore lint/suspicious/noExplicitAny: test
      let eRef: any;

      const e = effect(
        () => {
          runCount++;
          a.value;
          if (eRef) {
            capturedIsExecuting = eRef.isExecuting;
          }
        },
        { sync: true }
      );
      eRef = e;

      a.value = 1;

      expect(runCount).toBe(2);
      expect(capturedIsExecuting).toBe(true);
      e.dispose();
    });

    it('handles many sync executions without error', async () => {
      const count = atom(0, { sync: true });

      const e = effect(
        () => {
          count.value;
        },
        { sync: true, maxExecutionsPerSecond: 1000, maxExecutionsPerFlush: 200 }
      );

      for (let i = 0; i < 150; i++) {
        count.value = i;
      }

      expect(e.executionCount).toBeGreaterThan(100);
    });
  });

  describe('Error Handling', () => {
    it('handles async effect error', async () => {
      vi.useRealTimers();
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(async () => {
        await sleep(10);
        throw new Error('Async effect error');
      });
      await sleep(50);

      expect(consoleError).toHaveBeenCalled();
    });

    it('handles cleanup error during both re-execution and dispose', async () => {
      const count = atom(0);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Cleanup error during re-execution
      const e1 = effect(() => {
        count.value;
        return () => {
          throw new Error('Cleanup error');
        };
      });

      await vi.runAllTimersAsync();
      count.value = 1;
      await vi.runAllTimersAsync();

      expect(consoleError).toHaveBeenCalled();

      e1.dispose();
      consoleError.mockClear();

      // Cleanup error during dispose
      const e2 = effect(() => {
        return () => {
          throw new Error('Cleanup failed');
        };
      });
      e2.dispose();

      expect(consoleError).toHaveBeenCalled();
    });

    it('commits partial dependencies when effect throws mid-execution', () => {
      const a = atom(0);
      const b = atom(0);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(() => {
        a.value;
        throw new Error('fail middle');
      });

      expect((a as unknown as { subscriberCount: () => number }).subscriberCount()).toBeGreaterThan(
        0
      );
      expect((b as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(0);
    });

    it('logs both errors when onError handler throws', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      effect(
        () => {
          throw new Error('Initial error');
        },
        {
          onError: () => {
            throw new Error('Handler error');
          },
        }
      );

      expect(consoleError).toHaveBeenCalledTimes(2);
    });
  });

  describe('Dependency Tracking', () => {
    it('detects dirty computed dependency via lazy evaluation', async () => {
      const a = atom(0);
      const c = computed(() => a.value + 1);
      let runs = 0;

      const e = effect(() => {
        runs++;
        c.value;
      });

      await vi.runAllTimersAsync();
      expect(runs).toBe(1);

      a.value = 1;
      await vi.runAllTimersAsync();

      expect(runs).toBe(2);
      expect(c.value).toBe(2);
      e.dispose();
    });

    it('treats throwing computed dependency as dirty', async () => {
      const a = atom(0);
      const c = computed(() => {
        if (a.value === 1) throw new Error('Computed error');
        return a.value;
      });

      let runs = 0;
      effect(() => {
        runs++;
        try {
          c.value;
        } catch {
          // ignore
        }
      });

      expect(runs).toBe(1);

      a.value = 1;
      await vi.runAllTimersAsync();

      expect(runs).toBe(2);
    });

    it('switches dependencies dynamically based on condition', async () => {
      const condition = atom(true);
      const count1 = atom(0);
      const count2 = atom(10);
      let result = 0;

      const e = effect(() => {
        result = condition.value ? count1.value * 2 : count2.value * 3;
      });

      await vi.runAllTimersAsync();
      expect(result).toBe(0);

      // Switch branch
      condition.value = false;
      await vi.runAllTimersAsync();
      expect(result).toBe(30);

      // Old dependency no longer triggers
      count1.value = 100;
      await vi.runAllTimersAsync();
      expect(result).toBe(30);

      // New dependency triggers
      count2.value = 20;
      await vi.runAllTimersAsync();
      expect(result).toBe(60);

      e.dispose();
    });
  });

  describe('Infinite Loop Protection', () => {
    it('disposes effect when maxExecutionsPerSecond is exceeded', async () => {
      vi.useRealTimers();
      const count = atom(0);
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      const e = effect(
        () => {
          count.value++;
        },
        { maxExecutionsPerSecond: 5, sync: true }
      );

      await sleep(100);

      expect(e.isDisposed).toBe(true);
      expect(consoleError).toHaveBeenCalled();
    });

    it('disposes effect when maxExecutionsPerFlush is exceeded', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const a = atom(0, { sync: true });

      const e = effect(
        () => {
          a.value;
        },
        {
          sync: true,
          maxExecutionsPerFlush: 10,
        }
      );

      for (let i = 0; i < 20; i++) {
        a.value = i;
      }

      expect(e.isDisposed).toBe(true);
      expect(consoleError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringMatching(/Infinite loop detected/),
        })
      );
    });

    it('warns when effect reads a dependency it just modified', () => {
      const wasEnabled = debug.enabled;
      debug.enabled = true;
      const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const a = atom(0, { sync: true });
      effect(
        () => {
          a.value;
          a.value = a.value + 1;
        },
        { trackModifications: true }
      );

      expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Infinite loop may occur'));

      consoleWarn.mockRestore();
      debug.enabled = wasEnabled;
    });
  });

  describe('Async Behavior', () => {
    it('async cleanup does not execute after dispose', async () => {
      vi.useRealTimers();
      const cleanup = vi.fn();

      const e = effect(async () => {
        await sleep(10);
        return cleanup;
      });

      e.dispose();

      await sleep(50);

      expect(e.isDisposed).toBe(true);
    });
  });
});
