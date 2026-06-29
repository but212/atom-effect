/**
 * @fileoverview Garbage Collection Verification
 * @description Verifies that subscription cleanup is deterministic on dispose.
 */

import { describe, expect, it } from 'vitest';
import { atom, computed, effect } from '@/index';

describe('Memory Leaks (GC)', () => {
  it('cleans up computed subscription on dispose', () => {
    const someAtom = atom(0);
    const computedInstance = computed(() => someAtom.value);

    computedInstance.value;
    expect(someAtom.subscriberCount()).toBe(1);

    computedInstance.dispose();
    expect(someAtom.subscriberCount()).toBe(0);
  });

  it('cleans up effect subscription on dispose', () => {
    const someAtom = atom(0);
    const effectInstance = effect(() => {
      someAtom.value;
    });

    expect(someAtom.subscriberCount()).toBe(1);

    effectInstance.dispose();
    expect(someAtom.subscriberCount()).toBe(0);
  });

  it('cleans up chain subscriptions when intermediate computed is disposed', () => {
    // a → b → c: disposing b must remove b from a's subscribers
    const someAtom = atom(0);
    const computedB = computed(() => someAtom.value + 1);
    const computedC = computed(() => computedB.value + 1);

    computedC.value;
    expect(someAtom.subscriberCount()).toBe(1);

    computedB.dispose();
    expect(someAtom.subscriberCount()).toBe(0);
  });

  it('tracks subscriber count as computeds are disposed one by one', () => {
    const someAtom = atom(0);
    const computedB = computed(() => someAtom.value * 2);
    const computedC = computed(() => someAtom.value + 1);

    computedB.value;
    computedC.value;
    expect(someAtom.subscriberCount()).toBe(2);

    computedB.dispose();
    expect(someAtom.subscriberCount()).toBe(1);

    computedC.dispose();
    expect(someAtom.subscriberCount()).toBe(0);
  });

  it('runs effect cleanup function on dispose', () => {
    const someAtom = atom(0);
    let cleaned = false;

    const effectInstance = effect(() => {
      someAtom.value;
      return () => {
        cleaned = true;
      };
    });

    expect(cleaned).toBe(false);

    effectInstance.dispose();
    expect(cleaned).toBe(true);
  });
});
