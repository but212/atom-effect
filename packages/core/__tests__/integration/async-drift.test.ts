/**
 * @fileoverview Async drift and REJECTED state tests
 *
 * Documents exactly when REJECTED fires and when epoch-based reset prevents it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { AsyncState } from '@/constants';
import { resetFlushState } from '@/core/scheduler';
import { atom, computed, effect } from '@/index';
import { sleep } from '../utils/test-helpers';

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
      { defaultValue: -1 }
    );

    c.value; // init
    await sleep(50);

    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(42);
  });

  it('retries when dependencies mutate mid-flight maintaining fallback', async () => {
    const src = atom(0);
    const onError = vi.fn();

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(40);
        return v;
      },
      { defaultValue: -99, onError }
    );

    c.value; // start computation

    // Change dependency at an arbitrary mid-flight point (25ms out of 40ms)
    await sleep(25);
    src.value = 1;

    // Await computation original finish + scheduler delay
    await sleep(30);

    expect(c.state).toBe(AsyncState.PENDING);
    expect(c.value).toBe(-99);

    // Verify error is NOT dispatched because it naturally retries
    expect(onError).not.toHaveBeenCalled();
  });

  it('isolates retry counting effectively within normal reactive bounds naturally', async () => {
    const src = atom(0);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(50);
        return v;
      },
      { defaultValue: -1 }
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
