/**
 * @fileoverview Dependency Graph Safety
 * @description Verifies specific graph topologies like cycles, diamonds, and infinite loops.
 */

import { describe, expect, it, vi } from 'vitest';
import { aeNextTick, atom, ComputedError, computed, effect, SchedulerError } from '@/index';

describe('Dependency Graph Safety', () => {
  describe('Cycle Detection', () => {
    it('throws ComputedError with circular dependency message on direct cycle', () => {
      let c1: ReturnType<typeof computed<number>>;
      let c2: ReturnType<typeof computed<number>>;

      c1 = computed(() => (c2 ? c2.value : 0) + 1);
      c2 = computed(() => c1.value + 1);

      expect(() => c1.value).toThrow(ComputedError);
      expect(() => c1.value).toThrow('Circular');
    });

    it('does not throw when a cyclic node has defaultValue — uses it as recursive base case', () => {
      // c1 -> c2 -> c1: when c1 is RECOMPUTING and c2 tries to read c1,
      // c1 returns its defaultValue instead of throwing.
      // This means the cycle resolves to a finite value rather than a stack overflow.
      const box = { c2: null as ReturnType<typeof computed<number>> | null };

      const c1 = computed(() => (box.c2?.value ?? 0) + 1, { defaultValue: 0 });
      box.c2 = computed(() => c1.value + 1);

      // No throw — cycle terminates via defaultValue base case
      expect(() => c1.value).not.toThrow();
    });

    it('handles deep dependency chains without stack overflow', async () => {
      const depth = 1000;
      const start = atom(0);
      const atoms: (ReturnType<typeof atom<number>> | ReturnType<typeof computed<number>>)[] = [
        start,
      ];

      for (let i = 1; i <= depth; i++) {
        const prev = atoms[i - 1];
        if (!prev) throw new Error('Setup failed');
        atoms.push(computed(() => prev.value + 1));
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

      const fx = effect(() => {
        const val = counter.value;
        if (val < 200) counter.value = val + 1;
      });

      await aeNextTick();

      expect(spy).toHaveBeenCalledWith(expect.any(SchedulerError));
      expect(fx.isDisposed).toBe(true);

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
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => a.value * 3);
      const d = computed(() => b.value + c.value);

      expect(d.value).toBe(5);

      a.value = 2;
      await aeNextTick();

      // Glitch would be D=7 (4+3) or D=8 (2+6) — must be 10
      expect(d.value).toBe(10);
    });

    it('propagates errors through diamond and recovers cleanly', async () => {
      const a = atom(true);
      const b = computed(
        () => {
          if (a.value) throw new Error('B fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const c = computed(
        () => {
          if (a.value) throw new Error('C fail');
          return 1;
        },
        { defaultValue: 0 }
      );
      const d = computed(() => b.value + c.value, { defaultValue: -1 });

      try {
        b.value;
      } catch {
        /* expected */
      }
      try {
        c.value;
      } catch {
        /* expected */
      }

      expect(d.value).toBe(0);
      expect(d.hasError).toBe(true);
      expect(d.errors.some((e) => e.message.includes('B fail'))).toBe(true);
      expect(d.errors.some((e) => e.message.includes('C fail'))).toBe(true);

      a.value = false;
      await aeNextTick();
      expect(d.value).toBe(2);
      expect(d.hasError).toBe(false);
    });
  });
});
