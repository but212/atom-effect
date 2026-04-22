/**
 * @fileoverview Garbage Collection Verification
 * @description Verifies that subscription cleanup is deterministic on dispose.
 */

import { describe, expect, it } from 'vitest';
import { atom, computed, effect } from '@/index';

describe('Memory Leaks (GC)', () => {
  it('cleans up computed subscription on dispose', () => {
    const a = atom(0);
    const c = computed(() => a.value);

    c.value;
    expect(a.subscriberCount()).toBe(1);

    c.dispose();
    expect(a.subscriberCount()).toBe(0);
  });

  it('cleans up effect subscription on dispose', () => {
    const a = atom(0);
    const e = effect(() => {
      a.value;
    });

    expect(a.subscriberCount()).toBe(1);

    e.dispose();
    expect(a.subscriberCount()).toBe(0);
  });

  it('cleans up chain subscriptions when intermediate computed is disposed', () => {
    // a → b → c: disposing b must remove b from a's subscribers
    const a = atom(0);
    const b = computed(() => a.value + 1);
    const c = computed(() => b.value + 1);

    c.value;
    expect(a.subscriberCount()).toBe(1);

    b.dispose();
    expect(a.subscriberCount()).toBe(0);
  });

  it('tracks subscriber count as computeds are disposed one by one', () => {
    const a = atom(0);
    const b = computed(() => a.value * 2);
    const c = computed(() => a.value + 1);

    b.value;
    c.value;
    expect(a.subscriberCount()).toBe(2);

    b.dispose();
    expect(a.subscriberCount()).toBe(1);

    c.dispose();
    expect(a.subscriberCount()).toBe(0);
  });

  it('runs effect cleanup function on dispose', () => {
    const a = atom(0);
    let cleaned = false;

    const e = effect(() => {
      a.value;
      return () => {
        cleaned = true;
      };
    });

    expect(cleaned).toBe(false);

    e.dispose();
    expect(cleaned).toBe(true);
  });
});
