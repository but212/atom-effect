/**
 * @fileoverview Dependency Graph Safety
 * @description Verifies specific graph topologies like cycles, diamonds, and infinite loops.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  aeNextTick,
  atom,
  type ComputedAtom,
  ComputedError,
  computed,
  effect,
  SchedulerError,
} from '@/index';

describe('Dependency Graph Safety', () => {
  describe('Cycle Detection', () => {
    it('throws ComputedError with circular dependency message on direct cycle', () => {
      let computed1: ReturnType<typeof computed<number>>;
      let computed2: ReturnType<typeof computed<number>>;

      computed1 = computed(() => (computed2 ? computed2.value : 0) + 1);
      computed2 = computed(() => computed1.value + 1);

      expect(() => computed1.value).toThrow(ComputedError);
      expect(() => computed1.value).toThrow('Circular');
    });

    it('should successfully detect and throw on circular dependencies', () => {
      let computed1: ComputedAtom<number>;
      let computed2: ComputedAtom<number>;
      computed1 = computed(() => computed2.value + 1);
      computed2 = computed(() => computed1.value + 1);

      // Best Practice: Assert that evaluating a circular dependency throws a circular dependency error
      expect(() => computed1.value).toThrow('Circular dependency detected');
    });

    it('does not throw when a cyclic node has defaultValue — uses it as recursive base case', () => {
      // c1 -> c2 -> c1: when c1 is RECOMPUTING and c2 tries to read c1,
      // c1 returns its defaultValue instead of throwing.
      // This means the cycle resolves to a finite value rather than a stack overflow.
      const box = { c2: null as ReturnType<typeof computed<number>> | null };

      const computed1 = computed(() => (box.c2?.value ?? 0) + 1, { defaultValue: 0 });
      box.c2 = computed(() => computed1.value + 1);

      // No throw — cycle terminates via defaultValue base case
      expect(() => computed1.value).not.toThrow();
    });

    it('handles deep dependency chains without stack overflow', async () => {
      const depth = 1000;
      const start = atom(0);
      const atoms: (ReturnType<typeof atom<number>> | ReturnType<typeof computed<number>>)[] = [
        start,
      ];

      for (let i = 1; i <= depth; i++) {
        const previousNode = atoms[i - 1];
        if (!previousNode) throw new Error('Setup failed');
        atoms.push(computed(() => previousNode.value + 1));
      }

      const last = atoms[depth];
      if (!last) throw new Error('Setup failed');
      expect(last.value).toBe(depth);

      start.value = 1;
      await aeNextTick();

      expect(last.value).toBe(depth + 1);
    });
  });

  describe('Infinite Loop Safety', () => {
    it('prevents runaway effects from freezing the main thread', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const counter = atom(0);

      const effectInstance = effect(() => {
        const value = counter.value;
        if (value < 200) counter.value = value + 1;
      });

      await aeNextTick();

      expect(spy).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(effectInstance.isDisposed).toBe(true);

      spy.mockRestore();
    });
  });

  describe('Diamond Glitch Freedom', () => {
    it('computes diamond dependencies to a single consistent value', async () => {
      //      A(1)
      //     /   \
      //   B(2)  C(3)
      //     \   /
      //      D(5)
      const someAtom = atom(1);
      const computedB = computed(() => someAtom.value * 2);
      const computedC = computed(() => someAtom.value * 3);
      const computedD = computed(() => computedB.value + computedC.value);

      expect(computedD.value).toBe(5);

      someAtom.value = 2;
      await aeNextTick();

      // Glitch would be D=7 (4+3) or D=8 (2+6) — must be 10
      expect(computedD.value).toBe(10);
    });

    it('propagates errors through diamond and recovers cleanly', async () => {
      const someAtom = atom(true);
      const computedB = computed(
        () => {
          if (someAtom.value) throw new Error('B fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const computedC = computed(
        () => {
          if (someAtom.value) throw new Error('C fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const computedD = computed(() => computedB.value + computedC.value, { defaultValue: -1 });

      try {
        computedB.value;
      } catch {
        /* expected */
      }
      try {
        computedC.value;
      } catch {
        /* expected */
      }

      expect(computedD.value).toBe(0);
      expect(computedD.hasError).toBe(true);
      expect(computedD.errors.some((err) => err.message.includes('B fail'))).toBe(true);
      expect(computedD.errors.some((err) => err.message.includes('C fail'))).toBe(true);

      someAtom.value = false;
      await aeNextTick();
      expect(computedD.value).toBe(2);
      expect(computedD.hasError).toBe(false);
    });
  });
});
