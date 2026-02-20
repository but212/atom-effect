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
import { resetFlushState } from '@/internal/epoch';
import { sleep } from '../../utils/test-helpers';

afterEach(() => {
  vi.restoreAllMocks();
  resetFlushState();
});

describe('Async Drift → REJECTED', () => {
  /**
   * maxAsyncRetries = 0: a single drift triggers REJECTED immediately.
   * Any dep change while the promise is in-flight causes rejection with no retries.
   */
  it('rejects immediately when maxAsyncRetries = 0 and dep changes mid-flight', async () => {
    const src = atom(0);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(50);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 0 }
    );

    c.value; // start computation (reads src=0)

    await sleep(10);
    src.value = 1; // change dep mid-flight → drift detected on resolve

    await sleep(60); // wait for promise resolve + drift handling

    expect(c.state).toBe(AsyncState.REJECTED);
  });

  /**
   * maxAsyncRetries = 0 with a stable dep resolves normally.
   * Verifies the happy path is not broken by a zero-retry configuration.
   */
  it('resolves normally with maxAsyncRetries = 0 when dep is stable', async () => {
    const src = atom(42);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(30);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 0 }
    );

    c.value;
    await sleep(50);

    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(42);
  });

  /**
   * onError is called with a message containing "drift" when retries are exhausted.
   */
  it('calls onError with drift message when maxAsyncRetries = 0 and dep changes', async () => {
    const src = atom(0);
    const onError = vi.fn();

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(50);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 0, onError }
    );

    c.value;
    await sleep(10);
    src.value = 99;

    await sleep(60);

    expect(c.state).toBe(AsyncState.REJECTED);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0]![0].message).toMatch(/drift/i);
  });

  /**
   * Retry counter resets independently per promise chain, not across chains.
   *
   * Each call to _handleAsyncComputation resets _asyncRetryCount to 0,
   * so drifts that happen on different promises do not accumulate.
   *
   * Flow (with an effect subscriber to trigger automatic recompute):
   *   P2(src=1) → drift(src=2) → count 0→1, ≤ maxRetries=1 → retry → P3 starts (_count=0)
   *   P3(src=2) → drift(src=3) → count 0→1, ≤ maxRetries=1 → retry → P4 starts (_count=0)
   *   P4(src=3) → no drift → RESOLVED(3)
   *
   * If the counter accumulated globally, it would reach 2 and hit REJECTED.
   * The per-chain reset is what keeps it alive.
   */
  it('retries independently per promise chain — count resets on each new computation', async () => {
    const src = atom(0);

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(60);
        return v;
      },
      { defaultValue: -1, maxAsyncRetries: 1 }
    );

    // Subscribe via effect so _markDirty() triggers automatic recompute
    const fx = effect(() => {
      void c.value;
    });

    await sleep(80); // wait for initial P1 to resolve

    // Round 1: trigger P2 (reads src=1), then change src before P2 resolves
    src.value = 1;
    await sleep(10);
    src.value = 2; // P2 resolves with drift → retry → P3 starts (_count=0)
    await sleep(80);

    // Round 2: change src before P3 resolves
    src.value = 3; // P3 resolves with drift → retry → P4 starts (_count=0)
    await sleep(80);

    // P4 resolves with no drift → RESOLVED
    await sleep(80);

    expect(c.state).toBe(AsyncState.RESOLVED);
    expect(c.value).toBe(3);

    fx.dispose();
  });

  /**
   * Dep change just before resolve (boundary case).
   * Verifies the drift detection path fires even when the change is very close
   * to the resolution point, and that defaultValue is returned while REJECTED.
   */
  it('handles drift at the exact resolve boundary (maxAsyncRetries = 0)', async () => {
    const src = atom('initial');
    const onError = vi.fn();

    const c = computed(
      async () => {
        const v = src.value;
        await sleep(30);
        return v;
      },
      { defaultValue: 'default', maxAsyncRetries: 0, onError }
    );

    c.value; // start P1

    // Change dep just before resolve (25ms into a 30ms computation)
    await sleep(25);
    src.value = 'changed';

    await sleep(20); // P1 resolves + drift handling completes

    expect(c.state).toBe(AsyncState.REJECTED);
    expect(onError).toHaveBeenCalledOnce();
    expect(c.value).toBe('default'); // falls back to defaultValue
  });
});
