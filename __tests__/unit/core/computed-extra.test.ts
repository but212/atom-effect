import { describe, expect, it, vi } from 'vitest';
import { atom } from '../../../src/core/atom';
import { computed } from '../../../src/core/computed';

import { ERROR_MESSAGES } from '../../../src/errors/messages';
import { trackingContext } from '../../../src/tracking';
import { debug } from '../../../src/utils/debug';
import { tick } from '../../utils/test-helpers';

describe('Computed - Extra Coverage', () => {
  it('covers debug fields in ComputedAtomImpl', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;

    const c = computed(() => 1);
    const debugObj = c as unknown as {
      subscriberCount(): number;
      isDirty(): boolean;
      dependencies: unknown;
      stateFlags: string;
    };
    expect(debugObj.subscriberCount()).toBe(0);
    expect(debugObj.isDirty()).toBe(true);
    expect(debugObj.dependencies).toBeDefined();
    expect(typeof debugObj.stateFlags).toBe('string');

    debug.enabled = wasEnabled;
  });

  it('covers nextDeps growth in collector', () => {
    // We need more than 16 (default pool size?) dependencies
    // Actually depArrayPool.acquire() returns an empty array usually.
    // If it's already full of large arrays?
    // Let's just access many atoms.
    const atoms = Array.from({ length: 300 }, (_, i) => atom(i));
    const c = computed(() => {
      let sum = 0;
      for (const a of atoms) sum += a.value;
      return sum;
    });
    expect(c.value).toBe(44850);
  });

  it('covers syncDependencies unsubpath', async () => {
    const a = atom(0);
    const b = atom(0);
    const cond = atom(true);

    const c = computed(() => {
      if (cond.value) return a.value;
      return b.value;
    });

    c.value; // Initial access
    expect((a as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(1);
    expect((b as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(0);

    cond.value = false;
    // Wait for async notification from cond to c
    await tick();

    c.value; // recompute!

    expect((a as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(0);
    expect((b as unknown as { subscriberCount: () => number }).subscriberCount()).toBe(1);
  });

  it('covers PromiseIdManager reset and next()', () => {
    const c = computed(() => 1);
    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const impl = c as any;
    // MAX_PROMISE_ID is hardcoded in impl as Number.MAX_SAFE_INTEGER - 1
    impl._promiseId = Number.MAX_SAFE_INTEGER - 2;
    const _firstId = impl._promiseId;

    // Trigger async computation to increment promiseId
    const cAsync = computed(
      async () => {
        await tick();
        return 1;
      },
      { defaultValue: 0 }
    );

    expect(cAsync.value).toBe(0);
    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const asyncImpl = cAsync as any;
    asyncImpl._promiseId = Number.MAX_SAFE_INTEGER - 1;

    // Another run to trigger reset logic
    asyncImpl._recompute();
    expect(asyncImpl._promiseId).toBe(1); // Reset to 0 then incremented
  });

  it('covers error handler callback failure in async computation', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorToThrow = new Error('callback failed');

    const c = computed(
      async () => {
        throw new Error('computation failed');
      },
      {
        defaultValue: 0,
        onError: () => {
          throw errorToThrow;
        },
      }
    );

    try {
      c.value;
    } catch {
      // ignore
    }

    await tick();
    await tick();

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error occurred during onError callback execution'),
      errorToThrow
    );
    consoleSpy.mockRestore();
  });

  it('covers error handler callback failure in sync computation', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const errorToThrow = new Error('callback failed');

    const c = computed(
      () => {
        throw new Error('computation failed');
      },
      {
        onError: () => {
          throw errorToThrow;
        },
      }
    );

    try {
      c.value;
    } catch {
      // ignore
    }

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error occurred during onError callback execution'),
      errorToThrow
    );
    consoleSpy.mockRestore();
  });

  it('covers _registerTracking for plain functions and objects', () => {
    const c = computed(() => 1);

    // Case 1: Plain function
    const plainListener = vi.fn();

    trackingContext.run(plainListener, () => {
      c.value;
    });

    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const impl = c as any;
    expect(impl._functionSubscribersStore.has(plainListener)).toBe(true);

    // Case 2: Object with execute
    const subscriber = {
      execute: vi.fn(),
    };

    // biome-ignore lint/suspicious/noExplicitAny: Mocking subscriber
    trackingContext.run(subscriber as any, () => {
      c.value;
    });
    expect(impl._objectSubscribersStore.has(subscriber)).toBe(true);
  });

  it('covers setIdle flag clearing', () => {
    const c = computed(() => 1);
    // biome-ignore lint/suspicious/noExplicitAny: Access private internals
    const impl = c as any;

    // Set some flags
    impl.flags |= 1 << 2; // PENDING
    impl.flags |= 1 << 3; // RESOLVED

    impl._setIdle();

    expect(impl._isIdle()).toBe(true);
    expect(impl._isPending()).toBe(false);
    expect(impl._isResolved()).toBe(false);
    expect(impl._isRejected()).toBe(false);
  });

  it('generates correct LARGE_DEPENDENCY_GRAPH message', () => {
    expect(ERROR_MESSAGES.LARGE_DEPENDENCY_GRAPH(100)).toBe(
      'Large dependency graph detected: 100 dependencies'
    );
  });



  it('covers cached array reuse optimization in prepareComputationContext', () => {
    // Strategy:
    // 1. Create a computed with many dependencies to grow a pooled array.
    // 2. Dispose/recompute to release that large array back to the pool.
    // 3. Create a new computed with fewer dependencies.
    // 4. It should acquire the large array and use index assignment (depCount < nextDeps.length).

    const atoms = Array.from({ length: 50 }, (_, i) => atom(i));
    const cLarge = computed(() => {
      return atoms.reduce((sum, a) => sum + a.value, 0);
    });
    cLarge.value; // Trigger computation, acquiring array, filling 50 items.

    // Dispose to release the array to the pool
    // Note: computed.dispose() releases dependencies array.
    cLarge.dispose();

    // Now pool has a [Dependency x 50] array at the top.

    // Create new computed with 1 dependency
    const a = atom(1);
    const cSmall = computed(() => a.value);

    cSmall.value; // execution should reuse the large array and hit 'state.depCount < nextDeps.length'

    expect(cSmall.value).toBe(1);
  });

  it('covers cleanup of nextDeps when commit fails', () => {
    // We need commitDependencies to throw.
    // This happens if syncDependencies -> dep.subscribe throws.

    const a = atom(0);
    // Monkey patch subscribe
    const _originalSub = a.subscribe;
    // biome-ignore lint/suspicious/noExplicitAny: Monkey patch
    (a as any).subscribe = () => {
      throw new Error('Sub Fail');
    };

    const c = computed(() => {
      return a.value;
    });

    // We need to silence console.error as computed might log the error
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Initial access triggers execution -> commit -> subscribe fail -> throw
    expect(() => c.value).toThrow('Sub Fail');

    consoleError.mockRestore();
  });
});
