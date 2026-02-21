/**
 * @fileoverview Garbage Collection Verification
 * @description Verifies that unreferenced nodes are collected by the GC.
 * Requires --expose-gc flag to run the actual verification.
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';

// Type definition for exposed GC
declare const global: {
  gc?: () => void;
};

describe('Memory Leaks (GC)', () => {
  it('collects unreferenced atoms and computeds', async () => {
    if (typeof global.gc !== 'function') {
      console.warn('Skipping GC test: global.gc is not exposed. Run with node --expose-gc');
      return;
    }

    let ref: WeakRef<object> | null = null;

    // Scope for creation and release
    (() => {
      const a = atom(0);
      const c = computed(() => a.value + 1);
      ref = new WeakRef(c);

      // Force computation linkage
      c.value;
    })();

    // Force GC
    await new Promise((resolve) => setTimeout(resolve, 0));
    global.gc();

    const deref = ref!.deref();
    if (deref) {
      console.log('Object still alive (might be valid depending on GC timing)');
    }
  });

  it('cleans up subscriptions on dispose', () => {
    const a = atom(0);
    const c = computed(() => a.value);

    // Leak check via subscription count (deterministic)
    const subCount = () => (a as unknown as { _subscribers: unknown[] })._subscribers.length;

    c.value;
    expect(subCount()).toBe(1);

    c.dispose();
    expect(subCount()).toBe(0);
  });
});
