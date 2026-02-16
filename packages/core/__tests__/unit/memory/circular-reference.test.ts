/**
 * @fileoverview Dependency Graph Safety
 * @description Verifies specific graph topologies like cycles, diamonds, and infinite loops.
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { SchedulerError } from '@/errors/errors';

// Helper for waiting updates
const flush = async () => await new Promise((r) => setTimeout(r, 0));

describe('Dependency Graph Safety', () => {
  describe('Cycle Detection', () => {
    it('detects synchronous circular dependency in computed', () => {
      // A -> B -> A
      // We use a mutable object to simulate late-binding if needed,
      // but typically closures capture references.

      // To construct a cycle with immutable `const`, we need deferred access.
      let c1: ReturnType<typeof computed<number>>;
      let c2: ReturnType<typeof computed<number>>;

      c1 = computed(() => (c2 ? c2.value : 0) + 1);
      c2 = computed(() => c1.value + 1);

      // Initial read triggers the cycle
      // c1 -> c2 -> c1 ...
      expect(() => c1.value).toThrow();
    });

    it('handles deep dependency chains without stack overflow', async () => {
      const depth = 1000;
      const atoms: any[] = [];
      const start = atom(0);
      atoms.push(start);
      
      // Create chain: c[i] depends on c[i-1]
      for (let i = 1; i <= depth; i++) {
        const prev = atoms[i-1];
        atoms.push(computed(() => prev.value + 1));
      }
      
      const last = atoms[depth];
      expect(last.value).toBe(depth);
      
      // Update
      start.value = 1;
      
      // Atom updates are async by default, so we must wait for invalidation to propagate
      // through the chain (start -> c1 -> ... -> c1000)
      await flush();
      
      // Should propagate without stack overflow
      expect(last.value).toBe(depth + 1);
    });
  });

  describe('Infinite Loop Safety', () => {
    it('prevents runaway effects from freezing the main thread', async () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const counter = atom(0);

      // Effect triggers itself: Read -> Write -> Read ...
      const fx = effect(() => {
        const val = counter.value;
        // Unbounded recursion attempt
        // System should cap this at MAX_FLUSH_ITERATIONS (e.g. 100)
        if (val < 200) {
          counter.value = val + 1;
        }
      });

      await flush();

      // Should have caught the error and stopped
      expect(spy).toHaveBeenCalledWith(expect.any(SchedulerError));

      // Cleanup
      fx.dispose();
      spy.mockRestore();
    });
  });

  describe('Diamond Glitch Freedom', () => {
    it('computes diamond dependencies consistently', async () => {
      //      A(1)
      //     /   \
      //   B(2)  C(3)  (B=A*2, C=A*3)
      //     \   /
      //      D(5)     (D=B+C)

      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => a.value * 3);
      const d = computed(() => b.value + c.value);

      // 1. Initial Consistency
      expect(d.value).toBe(5);

      // 2. Update Source
      a.value = 2; // B->4, C->6, D->10
      await flush();

      // 3. Glitch Freedom check: Valid final state
      // (A glitch would be seeing D=7 (4+3) or D=8 (2+6) transiently)
      expect(d.value).toBe(10);
    });
  });
});
