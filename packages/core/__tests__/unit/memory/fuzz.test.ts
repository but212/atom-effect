/**
 * @fileoverview Resilience testing for reactive dependency graphs
 * @description Deterministic stress tests for stability and consistency
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { batch } from '@/index';

describe('Resilience Testing', () => {
  it('handles dynamic node creation and disposal cycle', () => {
    // Deterministic pattern: Create -> Link -> Update -> Dispose
    const atoms: ReturnType<typeof atom<number>>[] = [];
    const computeds: ReturnType<typeof computed<number>>[] = [];
    const effects: ReturnType<typeof effect>[] = [];
    const CYCLE_COUNT = 100;

    for (let i = 0; i < CYCLE_COUNT; i++) {
      // 1. Create
      const a = atom(i);
      atoms.push(a);

      // 2. Derive (Chain)
      const c = computed(() => a.value * 2);
      computeds.push(c);

      // 3. Subscribe
      const e = effect(() => {
        void c.value;
      });
      effects.push(e);

      // 4. Update
      a.value = i + 1;

      // 5. Dispose (Partial)
      // Verify that interleaving disposals doesn't break the system
      if (i % 2 === 0) {
        e.dispose();
        c.dispose();
      }
    }

    // 6. Remaining Dispose
    // Should execute without errors
    expect(() => {
      effects.forEach((e) => e.dispose());
      computeds.forEach((c) => c.dispose());
    }).not.toThrow();
  });

  it('maintains consistency under concurrent microtask updates', async () => {
    const a = atom(0);
    const c = computed(() => a.value * 2);

    const updates = Array.from({ length: 50 }, (_, i) =>
      Promise.resolve().then(() => {
        a.value = i;
        return c.value; // Capture value immediately after update in microtask
      })
    );

    const capturedValues = await Promise.all(updates);

    // Sync updates ensure c is always 2 * a
    expect(capturedValues.every((val) => val % 2 === 0)).toBe(true);

    // Final state check
    expect(c.value).toBe(49 * 2);
  });

  it('stabilizes deep dependency chains in batch', () => {
    const root = atom(1);
    let current = computed(() => root.value);
    const layers = [current];

    // Build 50-layer deep chain: L(n) = L(n-1) + 1
    for (let i = 0; i < 50; i++) {
      const prev = current;
      current = computed(() => prev.value + 1);
      layers.push(current);
    }

    // Initial check: root=1. L0=1, L1=2, ..., L50=51
    expect(layers[50]!.value).toBe(51);

    // Batch update
    batch(() => {
      root.value = 10;
    });

    // Final check: root=10. L0=10, L1=11, ..., L50=60
    expect(layers[50]!.value).toBe(60);
  });
});
