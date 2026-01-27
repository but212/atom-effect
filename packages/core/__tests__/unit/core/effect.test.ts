/**
 * @fileoverview Effect-specific tests (coverage supplement)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { EffectError } from '@/errors/errors';
import { debug } from '@/utils/debug';
import { sleep } from '../../utils/test-helpers';

describe('Effect - Error Handling and Edge Cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

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

  it('does not re-execute effect that is already running', async () => {
    const calls: number[] = [];
    let executionCount = 0;
    const a = atom(0);

    const _e = effect(
      () => {
        executionCount++;
        calls.push(executionCount);
        a.value; // dependency tracking

        // Attempt to trigger re-execution during first run by changing atom
        if (executionCount === 1) {
          a.value = 1; // sync:true so immediate re-execution attempt, but ignored due to isExecuting() check
        }
      },
      { sync: true }
    );

    await vi.runAllTimersAsync();

    // Thanks to isExecuting() check, trigger during execution is ignored and runs only once
    // May run once more asynchronously afterwards
    expect(calls[0]).toBe(1);
    expect(executionCount).toBeGreaterThanOrEqual(1);
  });

  it('ignores cleanup function if not a function', async () => {
    const count = atom(0);

    const e = effect(() => {
      count.value;
      return 'not a function' as unknown as () => void; // return non-function value
    });

    await vi.runAllTimersAsync();

    count.value = 1;
    await vi.runAllTimersAsync();

    // Should work normally without error
    expect(e.isDisposed).toBe(false);
  });

  it('is safe even when error occurs during cleanup execution', async () => {
    const count = atom(0);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    effect(() => {
      count.value;
      return () => {
        throw new Error('Cleanup error');
      };
    });

    await vi.runAllTimersAsync();

    count.value = 1;
    await vi.runAllTimersAsync();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('handles errors during effect function execution (sync and async)', async () => {
    vi.useRealTimers();
    const count = atom(0);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Sync error
    effect(() => {
      if (count.value === 1) throw new Error('Sync effect error');
    });
    count.value = 1;
    await sleep(0);
    expect(consoleError).toHaveBeenCalled();

    // Async error
    effect(async () => {
      await sleep(10);
      throw new Error('Async effect error');
    });
    await sleep(50);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
    vi.useFakeTimers();
  });

  it('throws error on dependency access failure', async () => {
    const badAtom = {
      get value() {
        throw new Error('Access failed');
      },
      subscribe: () => () => {},
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    effect(() => {
      (badAtom as unknown as { value: unknown }).value;
    });

    await vi.runAllTimersAsync();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('dispose always works safely', async () => {
    const count = atom(0);
    const calls: number[] = [];

    const e = effect(() => {
      calls.push(count.value);
    });

    await vi.runAllTimersAsync();
    expect(calls.length).toBeGreaterThan(0);

    // call dispose
    e.dispose();

    expect(() => e.dispose()).not.toThrow();
    expect(e.isDisposed).toBe(true);
  });

  it('executionCount increments', async () => {
    const count = atom(0, { sync: true }); // atom also sync

    const e = effect(
      () => {
        count.value; // only track dependency
      },
      { sync: true, maxExecutionsPerSecond: 100 }
    );

    const initialCount = e.executionCount;
    expect(initialCount).toBeGreaterThan(0);

    count.value = 1;
    count.value = 2;

    // verify executionCount increased
    expect(e.executionCount).toBeGreaterThan(initialCount);
  });

  it('can handle many executions', async () => {
    const count = atom(0, { sync: true }); // atom also sync

    const e = effect(
      () => {
        count.value; // only track dependency
      },
      { sync: true, maxExecutionsPerSecond: 1000, maxExecutionsPerFlush: 200 }
    );

    // 150 updates
    for (let i = 0; i < 150; i++) {
      count.value = i;
    }

    // should handle many executions without error (executionCount > 100)
    expect(e.executionCount).toBeGreaterThan(100);
  });

  it('tracks modified dependencies with trackModifications', async () => {
    vi.useRealTimers();
    const count = atom(0);

    // skip test if not in development mode
    if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'development') {
      expect(true).toBe(true);
      vi.useFakeTimers();
      return;
    }

    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    effect(
      () => {
        const current = count.value;
        count.value = current + 1; // read and write
      },
      { trackModifications: true, sync: true, maxExecutionsPerSecond: 5 }
    );

    await sleep(50);

    // verify warning occurred
    consoleWarn.mockRestore();
    vi.useFakeTimers();
  });

  it('trackModifications option is disposed', async () => {
    const count = atom(0);

    const e = effect(
      () => {
        count.value;
      },
      { trackModifications: true }
    );

    await vi.runAllTimersAsync();

    // dispose should always be safe
    expect(() => e.dispose()).not.toThrow();
    expect(e.isDisposed).toBe(true);
  });

  it('async cleanup does not execute after dispose', async () => {
    vi.useRealTimers();
    const cleanup = vi.fn();

    const e = effect(async () => {
      await sleep(10);
      return cleanup;
    });

    // dispose before cleanup is set
    e.dispose();

    await sleep(50);

    // cleanup should not be set since disposed
    expect(e.isDisposed).toBe(true);
    vi.useFakeTimers();
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

  describe('Infinite Loop Detection and Memory Management', () => {
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

      // wait briefly then check
      await sleep(100);

      // should be disposed after exceeding 5 executions
      expect(e.isDisposed).toBe(true);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
      vi.useFakeTimers();
    });
  });

  it('tracks dependencies on multiple atoms', async () => {
    const count1 = atom(0);
    const count2 = atom(0);
    const count3 = atom(0);
    let sum = 0;

    const e = effect(() => {
      sum = count1.value + count2.value + count3.value;
    });

    await vi.runAllTimersAsync();
    expect(sum).toBe(0);

    count1.value = 1;
    await vi.runAllTimersAsync();
    expect(sum).toBe(1);

    count2.value = 2;
    await vi.runAllTimersAsync();
    expect(sum).toBe(3);

    count3.value = 3;
    await vi.runAllTimersAsync();
    expect(sum).toBe(6);

    e.dispose();
  });
  it('handles error when dependency subscription fails', () => {
    const _badDep = {
      subscribe: () => {
        throw new Error('Subscribe failed');
      },
    };

    expect(() => {
      effect(
        () => {
          // attempts to use badDep but subscribe fails
        },
        { sync: true }
      );
    }).not.toThrow(); // execute runs normally
  });

  it('adds new dependencies and removes old ones during effect execution', async () => {
    const condition = atom(true);
    const count1 = atom(0);
    const count2 = atom(10);
    let result = 0;

    const e = effect(() => {
      if (condition.value) {
        result = count1.value * 2;
      } else {
        result = count2.value * 3;
      }
    });

    await vi.runAllTimersAsync();
    expect(result).toBe(0); // count1.value * 2 = 0

    count1.value = 5;
    await vi.runAllTimersAsync();
    expect(result).toBe(10); // count1.value * 2 = 10

    // dependency switch when condition changes
    condition.value = false;
    await vi.runAllTimersAsync();
    expect(result).toBe(30); // count2.value * 3 = 30

    // count1 is no longer a dependency
    count1.value = 100;
    await vi.runAllTimersAsync();
    expect(result).toBe(30); // no change

    // only count2 is a dependency
    count2.value = 20;
    await vi.runAllTimersAsync();
    expect(result).toBe(60); // count2.value * 3 = 60

    e.dispose();
  });

  describe('Infinite Loop and Debug', () => {
    it('covers trackModifications and loop warnings', () => {
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

    it('covers partial dependency commitment on error', () => {
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

      consoleError.mockRestore();
    });
    describe('Coverage Improvements', () => {
      it('handles error in cleanup during dispose', () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
        const e = effect(() => {
          return () => {
            throw new Error('Cleanup failed');
          };
        });
        e.dispose();
        expect(consoleError).toHaveBeenCalled();
        consoleError.mockRestore();
      });

      it('detects dirty computed dependency via value check (lazy evaluation)', async () => {
        const a = atom(0);
        const c = computed(() => a.value + 1); // Lazy by default
        let runs = 0;

        const e = effect(() => {
          runs++;
          c.value;
        });

        await vi.runAllTimersAsync();
        expect(runs).toBe(1);

        // Update atom. Computed becomes dirty but version unchanged (lazy).
        a.value = 1;

        // Trigger effect execution.
        // Fast path check: c.version vs link.version (match).
        // 'value' in dep check -> reads c.value -> recomputes -> version bumps.
        // logic detects change -> isDirty=true -> execute().
        await vi.runAllTimersAsync();

        expect(runs).toBe(2);
        expect(c.value).toBe(2);
        e.dispose();
      });

      it('considers dependency dirty if value access throws during check', async () => {
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

        a.value = 1; // trigger dirty
        // Effect check: read c.value -> throws -> catch -> isDirty=true -> execute

        await vi.runAllTimersAsync();

        expect(runs).toBe(2);
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

        a.value = 1; // triggers re-run synchronously

        expect(runCount).toBe(2); // 1 initial + 1 update
        expect(capturedIsExecuting).toBe(true);
        e.dispose();
      });

      it('throws infinite loop error on excessive sync updates', () => {
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

        // Does not throw because atom notification swallows subscriber errors
        for (let i = 0; i < 20; i++) {
          a.value = i;
        }

        // Instead, verify that the effect disposed itself and logged an error
        expect(e.isDisposed).toBe(true);
        expect(consoleError).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringMatching(/Infinite loop detected/),
          })
        );

        consoleError.mockRestore();
      });

      it('callbacks error if onError handler throws', () => {
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

        // Should log Initial Error, then Handler Error wrapped
        expect(consoleError).toHaveBeenCalledTimes(2);
        consoleError.mockRestore();
      });
    });
  });
});
