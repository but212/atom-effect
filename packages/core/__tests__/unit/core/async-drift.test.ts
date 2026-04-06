/**
 * @fileoverview Async drift and REJECTED state tests
 *
 * Documents exactly when REJECTED fires and when epoch-based reset prevents it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncState } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { resetFlushState } from '@/core/scheduler';
import { sleep } from '../../utils/test-helpers';

describe('Async Drift Constraint & Recovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    resetFlushState();
  });

  it('resolves reliably without retries (maxAsyncRetries = 0) when dependencies remain stable', async () => {
    const src = atom(42);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(30);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 0 }
    );

    c.value; // init
    await sleep(50);

    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(42);
  });

  it('rejects, falls back to default, and fires onError when dependencies mutate mid-flight (maxAsyncRetries = 0)', async () => {
    const src = atom(0);
    const onError = vi.fn();

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(40);
        return v;
      },
      { defaultValue: -99, maxAsyncRetries: 0, onError }
    );

    c.value; // start computation

    // Change dependency at an arbitrary mid-flight point (25ms out of 40ms)
    await sleep(25);
    src.value = 1;

    // Await computation finish + scheduler
    await sleep(30);

    expect(c.state).toBe(AsyncState.REJECTED);
    expect(c.value).toBe(-99); // Returned fallback while maintaining rejection flag

    // Verify error dispatch
    expect(onError).toHaveBeenCalledOnce();
    const errorParam = onError.mock.calls[0]![0] as Error;
    expect(errorParam).toBeInstanceOf(Error);
    expect(errorParam.message).toMatch(/drift/i); // Explicitly contains drift reason
  });

  it('isolates retry counting per computation path independently to prevent global cascading failures', async () => {
    const src = atom(0);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(50);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 1 }
    );

    // Mount an effect to trigger continuous dependency pulls
    const runner = effect(() => {
      void c.value;
    });

    await sleep(70); // Resolve initial stable pull

    // Round 1: Trigger a drift just before resolution
    src.value = 1;
    await sleep(10);
    src.value = 2; // Drift 1 -> uses its 1 allowed retry -> begins next compute safely

    await sleep(70);

    // Round 2: A totally new drift cycle
    src.value = 3;
    await sleep(70); // Resolves normally without drift, no accumulated timeouts

    // If the counter was global, round 2 drift would have exhausted the limit and rejected completely
    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(3);

    runner.dispose();
  });
});
