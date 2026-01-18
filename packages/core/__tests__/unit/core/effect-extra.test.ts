import { describe, expect, it, vi } from 'vitest';
import { atom } from '../../../src/core/atom';
import { effect } from '../../../src/core/effect/effect';
import { endFlush, resetFlushState, startFlush } from '../../../src/internal/epoch';
import { debug } from '../../../src/utils/debug';
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
    const dep = {
      get value() {
        throw new Error('access failed');
      },
      subscribe: () => () => {},
      version: 0,
    };

    const fx = effect(() => {}, { sync: true });
    // biome-ignore lint/suspicious/noExplicitAny: Access private
    const impl = fx as any;
    impl._dependencies = [dep];
    impl._dependencyVersions = [0];

    // Should return true (re-execute) if checking deps fails
    expect(impl._shouldExecute()).toBe(true);
  });

  it('covers subscription failure in _subscribeTo', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const dep = {
      get value() {
        return 1;
      },
      subscribe: () => {
        throw new Error('sub failed');
      },
      version: 1,
    };

    const fx = effect(() => {});
    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const impl = fx as any;

    // Manually trigger addDependency inside execution context
    // We need to simulate execution state
    impl._setExecuting(true);
    impl._prepareEffectContext();

    // Now call addDependency, which calls _subscribeTo
    // biome-ignore lint/suspicious/noExplicitAny: Access private
    impl.addDependency(dep as any);

    // Cleanup
    impl._setExecuting(false);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('covers cleanup failure in uncommitted transaction', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsubSpy = vi.fn();

    const fx = effect(() => {});
    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const impl = fx as any;

    // Setup state for _cleanupEffect
    const ctx = {
      prevDeps: [],
      prevVersions: [],
      prevUnsubs: [],
      // biome-ignore lint/suspicious/noExplicitAny: Mock dependency
      nextDeps: [{} as any], // Mock dependency
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
    // biome-ignore lint/suspicious/noExplicitAny: Access private
    const impl = fx as any;

    // biome-ignore lint/suspicious/noExplicitAny: Catching unknown error type
    let caughtError: any = null;

    // Ensure we are in a flushing state so counters increment
    resetFlushState();
    const flushStarted = startFlush();

    try {
      expect(flushStarted).toBe(true);

      // Attempt enough iterations to hit global limit (10000)
      // We need > 10000 iterations.
      for (let i = 0; i < 11000; i++) {
        impl._executionsInEpoch = 0; // Reset local counter to avoid local limit
        impl._checkInfiniteLoop();
      }
      // biome-ignore lint/suspicious/noExplicitAny: Catching unknown error
    } catch (e: any) {
      caughtError = e;
    } finally {
      endFlush();
      consoleError.mockRestore();
    }

    expect(caughtError).toBeDefined();
    expect(caughtError.message).toContain('Infinite loop detected (global)');
  });

  it('covers history circular buffer wrapping', () => {
    const fx = effect(() => {}, { maxExecutionsPerSecond: 10 });
    // biome-ignore lint/suspicious/noExplicitAny: Access private
    const impl = fx as any;
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
    // biome-ignore lint/suspicious/noExplicitAny: Access private
    const impl = fx as any;
    expect(impl._dependencies.length).toBe(1);

    // Now force a run that fails and throws
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Mock dependency with _tempUnsub to verify it gets cleared
    const dep = impl._dependencies[0];
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
    expect(dep._tempUnsub).toBeUndefined();

    consoleError.mockRestore();
  });
});
