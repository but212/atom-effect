import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Async Binding Integration', () => {
  it('atomText: should automatically resolve Promise and update DOM', async () => {
    const $element = $('<div>');
    const promise = Promise.resolve('Hello Async');

    $element.atomText(promise);

    // Initial state: should be empty before promise resolves
    expect($element.text()).toBe('');

    await promise;
    await $.nextTick();

    expect($element.text()).toBe('Hello Async');
  });

  it('atomText: should resolve Promise wrapped in an Atom', async () => {
    const $element = $('<div>');
    const asyncAtom = $.atom(Promise.resolve('Initial Async'));

    $element.atomText(asyncAtom);

    await asyncAtom.value;
    await $.nextTick();
    expect($element.text()).toBe('Initial Async');

    const nextPromise = Promise.resolve('Updated Async');
    asyncAtom.value = nextPromise;

    await nextPromise;
    await $.nextTick();
    expect($element.text()).toBe('Updated Async');
  });

  it('Race Condition: should only apply the latest Promise result', async () => {
    const $element = $('<div>');
    const asyncAtom = $.atom<Promise<string> | string>('Static');

    $element.atomText(asyncAtom);

    // P1 resolves late, P2 resolves early.
    // P2 should win because it was the LATEST promise assigned to the atom.
    let resolve1: ((value: string) => void) | undefined;
    const p1 = new Promise<string>((resolve) => (resolve1 = resolve));

    let resolve2: ((value: string) => void) | undefined;
    const p2 = new Promise<string>((resolve) => (resolve2 = resolve));

    asyncAtom.value = p1; // Assigned first
    asyncAtom.value = p2; // Assigned second (Latest)

    resolve2?.('P2 (Fast)');
    await p2;
    await $.nextTick();
    expect($element.text()).toBe('P2 (Fast)');

    resolve1?.('P1 (Slow)');
    await p1;
    await $.nextTick();

    // Even though P1 resolved later, it should NOT overwrite P2.
    expect($element.text()).toBe('P2 (Fast)');
  });

  it('Error handling: should not crash on rejected Promise and log error', async () => {
    const $element = $('<div>');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rejectedPromise = Promise.reject(new Error('Async Fail'));

    $element.atomText(rejectedPromise);

    try {
      await rejectedPromise;
    } catch {
      // Expected
    }

    await $.nextTick();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
