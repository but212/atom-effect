import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { effect } from '@/core/effect';
import { endFlush, resetFlushState, startFlush } from '@/internal/epoch';
import { debug } from '@/utils/debug';
import { sleep, tick } from '../../utils/test-helpers';

describe('Effect - Extra Coverage', () => {
  it('covers trackModifications and loop warnings', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const a = atom(0, { sync: true });
    // When trackModifications is true, and we change an atom while executing
    effect(
      () => {
        a.value; // Read
        a.value = a.value + 1; // Write
      },
      { trackModifications: true }
    );

    expect(consoleWarn).toHaveBeenCalledWith(expect.stringContaining('Infinite loop may occur'));

    consoleWarn.mockRestore();
    debug.enabled = wasEnabled;
  });

  it('covers infinite loop detection and throw in debug mode', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fx = effect(() => {}, { maxExecutionsPerSecond: 1 });

    expect(() => {
      fx.run();
    }).toThrow(/infinite loop suspected/i);

    consoleError.mockRestore();
    debug.enabled = wasEnabled;
  });

  it('covers history buffer break in _recordExecution', async () => {
    const a = atom(0);
    let runCount = 0;
    const _fx = effect(
      () => {
        a.value;
        runCount++;
      },
      { maxExecutionsPerSecond: 10 }
    );

    // Fill history with one item
    a.value = 1;

    // Wait for async scheduler
    await tick();
    expect(runCount).toBe(2); // Initial run + first update

    // Wait > 1s to ensure history buffer logic triggers a break
    await sleep(1100);

    // trigger another execution
    a.value = 2;
    // The history loop should now encounter an old timestamp and break
  });

  it('covers partial dependency commitment on error', () => {
    const a = atom(0);
    const b = atom(0);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const shouldFail = true;
    effect(() => {
      a.value;
      if (shouldFail) {
        throw new Error('fail middle');
      }
      b.value;
    });

    // Should still be subscribed to 'a' because it was accessed before error
    expect((a as unknown as { subscriberCount: () => number }).subscriberCount()).toBeGreaterThan(
      0
    );
    // Should NOT be subscribed to 'b' because it was NOT accessed due to error
    expect((b as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(0);

    consoleError.mockRestore();
  });

  it('covers _shouldExecute error handling in untracked read', () => {
    interface MockDep {
      get value(): unknown;
      subscribe: () => () => void;
      version: number;
    }
    const dep: MockDep = {
      get value() {
        throw new Error('access failed');
      },
      subscribe: () => () => {},
      version: 0,
    };

    const fx = effect(() => {}, { sync: true });
    interface EffectImpl {
      _dependencies: MockDep[];
      _dependencyVersions: number[];
      _shouldExecute: () => boolean;
    }
    const impl = fx as unknown as EffectImpl;
    impl._dependencies = [dep];
    impl._dependencyVersions = [0];

    // Should return true (re-execute) if checking deps fails
    expect(impl._shouldExecute()).toBe(true);
  });

  it('covers subscription failure in _subscribeTo', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    interface FailingDep {
      get value(): number;
      subscribe: () => never;
      version: number;
    }
    const dep: FailingDep = {
      get value() {
        return 1;
      },
      subscribe: () => {
        throw new Error('sub failed');
      },
      version: 1,
    };

    const fx = effect(() => {});
    interface EffectInternals {
      _setExecuting: (v: boolean) => void;
      _prepareEffectExecutionContext: () => void;
      addDependency: (dep: unknown) => void;
    }
    const impl = fx as unknown as EffectInternals;

    // Manually trigger addDependency inside execution context
    // We need to simulate execution state
    impl._setExecuting(true);
    impl._prepareEffectExecutionContext();

    // Now call addDependency, which calls _subscribeTo
    impl.addDependency(dep);

    // Cleanup
    impl._setExecuting(false);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('covers cleanup failure in uncommitted transaction', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsubSpy = vi.fn();

    const fx = effect(() => {});
    interface EffectCleanupImpl {
      _cleanupEffect: (ctx: unknown, committed: boolean) => void;
    }
    const impl = fx as unknown as EffectCleanupImpl;

    // Setup state for _cleanupEffect
    const ctx = {
      prevDeps: [],
      prevVersions: [],
      prevUnsubs: [],
      nextDeps: [{}], // Mock dependency
      nextVersions: [1],
      nextUnsubs: [unsubSpy],
    };

    // Call cleanup with committed=false
    impl._cleanupEffect(ctx, false);

    expect(unsubSpy).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('covers global flush execution limit', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Set maxExecutionsPerSecond high to avoid timestamp-based loop detection
    const fx = effect(() => {}, {
      maxExecutionsPerFlush: 10000,
      maxExecutionsPerSecond: 100000, // Higher than our loop count
    });
    interface LoopCheckImpl {
      _history: number[] | null;
      _executionsInEpoch: number;
      _checkInfiniteLoop: () => void;
    }
    const impl = fx as unknown as LoopCheckImpl;

    let caughtError: Error | null = null;

    // Ensure we are in a flushing state so counters increment
    resetFlushState();
    const flushStarted = startFlush();

    try {
      expect(flushStarted).toBe(true);

      // Attempt enough iterations to hit global limit (10000)
      // We need > 10000 iterations.
      impl._history = null; // Disable history-based rate limit for this test
      for (let i = 0; i < 11000; i++) {
        impl._executionsInEpoch = 0; // Reset local counter to avoid local limit
        impl._checkInfiniteLoop();
      }
    } catch (e: unknown) {
      caughtError = e as Error;
    } finally {
      endFlush();
      consoleError.mockRestore();
    }

    expect(caughtError).toBeDefined();
    expect(caughtError!.message).toContain('Infinite loop detected (global)');
  });

  it('covers history circular buffer wrapping', () => {
    const fx = effect(() => {}, { maxExecutionsPerSecond: 10 });
    interface HistoryImpl {
      _historyCapacity: number;
      _history: number[];
      _historyPtr: number;
      _checkInfiniteLoop: () => void;
    }
    const impl = fx as unknown as HistoryImpl;
    const capacity = impl._historyCapacity; // Should be 11

    // Manually simulate executions to fill buffer
    const now = Date.now();
    for (let i = 0; i < capacity; i++) {
      impl._history[i] = now - 2000;
    }
    impl._historyPtr = capacity - 1; // Point to end

    // Trigger one check (simulates execution)
    impl._checkInfiniteLoop();

    // Pointer should wrap to 0
    expect(impl._historyPtr).toBe(0);
    // The timestamp was written to the PREVIOUS pointer position (capacity - 1)
    expect(impl._history[capacity - 1]).toBeGreaterThan(now - 100);
  });

  it('covers cleanup of prevDeps when execution fails', () => {
    const a = atom(0);
    const fx = effect(() => {
      a.value; // Add dependency
    });

    // First run successful, has prevDeps
    interface DepCleanupImpl {
      _dependencies: Array<{ _tempUnsub?: (() => void) | undefined }>;
      _fn: () => void;
      run: () => void;
    }
    const impl = fx as unknown as DepCleanupImpl;
    expect(impl._dependencies.length).toBe(1);

    // Now force a run that fails and throws
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock dependency with _tempUnsub to verify it gets cleared
    const dep = impl._dependencies[0]!;
    dep._tempUnsub = () => {};

    try {
      impl._fn = () => {
        throw new Error('Fail');
      };
      impl.run();
    } catch {
      // ignore
    }

    // The cleanup logic should have set _tempUnsub to undefined
    expect(dep!._tempUnsub).toBeUndefined();

    consoleError.mockRestore();
  });
});
