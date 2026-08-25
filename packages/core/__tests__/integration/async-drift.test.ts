/**
 * @fileoverview Async drift and REJECTED state tests
 *
 * Documents session locking and stale-result suppression with controlled promises.
 */

import { describe, expect, it, vi } from 'vitest';
import { AsyncState, aeNextTick, atom, computed } from '@/index';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushPromiseHandlers(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Async Drift Constraint & Recovery', () => {
  it('resolves reliably when dependencies remain stable', async () => {
    const source = atom(42);
    const request = deferred<void>();

    const computedInstance = computed(
      async () => {
        const value = source.value;
        await request.promise;
        return value;
      },
      { defaultValue: -1 }
    );

    expect(computedInstance.value).toBe(-1);
    expect(computedInstance.state).toBe(AsyncState.PENDING);

    request.resolve(undefined);
    await flushPromiseHandlers();

    expect(computedInstance.state).toBe(AsyncState.RESOLVED);
    expect(computedInstance.value).toBe(42);
  });

  it('discards stale results when dependencies mutate mid-flight', async () => {
    const source = atom(0);
    const onError = vi.fn();
    const requests: Array<ReturnType<typeof deferred<void>>> = [];

    const computedInstance = computed(
      async () => {
        const value = source.value;
        const request = deferred<void>();
        requests.push(request);
        await request.promise;
        return value;
      },
      { defaultValue: -99, onError }
    );

    expect(computedInstance.value).toBe(-99);
    source.value = 1;
    await aeNextTick();
    expect(computedInstance.value).toBe(-99);
    expect(requests).toHaveLength(2);

    const firstRequest = requests[0];
    const secondRequest = requests[1];
    if (!firstRequest || !secondRequest) throw new Error('Requests were not created');

    firstRequest.resolve(undefined);
    await flushPromiseHandlers();

    expect(computedInstance.state).toBe(AsyncState.PENDING);
    expect(computedInstance.value).toBe(-99);

    secondRequest.resolve(undefined);
    await flushPromiseHandlers();

    expect(computedInstance.state).toBe(AsyncState.RESOLVED);
    expect(computedInstance.value).toBe(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it('starts a fresh session after a prior drift cycle', async () => {
    const source = atom(0);
    const requests: Array<ReturnType<typeof deferred<void>>> = [];

    const computedInstance = computed(
      async () => {
        const value = source.value;
        const request = deferred<void>();
        requests.push(request);
        await request.promise;
        return value;
      },
      { defaultValue: -1 }
    );

    expect(computedInstance.value).toBe(-1);
    source.value = 1;
    await aeNextTick();
    expect(computedInstance.value).toBe(-1);

    const firstRequest = requests[0];
    const secondRequest = requests[1];
    if (!firstRequest || !secondRequest) throw new Error('Requests were not created');

    firstRequest.resolve(undefined);
    await flushPromiseHandlers();
    expect(computedInstance.state).toBe(AsyncState.PENDING);

    secondRequest.resolve(undefined);
    await flushPromiseHandlers();
    expect(computedInstance.value).toBe(1);

    source.value = 2;
    await aeNextTick();
    expect(computedInstance.value).toBe(-1);
    source.value = 3;
    await aeNextTick();
    expect(computedInstance.value).toBe(-1);

    const thirdRequest = requests[2];
    const fourthRequest = requests[3];
    if (!thirdRequest || !fourthRequest) throw new Error('Requests were not created');

    thirdRequest.resolve(undefined);
    await flushPromiseHandlers();
    expect(computedInstance.state).toBe(AsyncState.PENDING);

    fourthRequest.resolve(undefined);
    await flushPromiseHandlers();
    expect(computedInstance.state).toBe(AsyncState.RESOLVED);
    expect(computedInstance.value).toBe(3);
  });
});
