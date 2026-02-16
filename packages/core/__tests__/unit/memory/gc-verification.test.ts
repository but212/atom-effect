/**
 * @fileoverview Resource Management Verification
 * @description Verifies deterministic cleanup and disposal behaviors
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';

// Helper to ensure async effects run
const flush = async () => await new Promise((r) => setTimeout(r, 0));

describe('Resource Management', () => {
  describe('Subscription Cleanup', () => {
    it('stops receiving updates after unsubscribe', async () => {
      const a = atom(0);
      const spy = vi.fn();

      const unsubscribe = a.subscribe(spy);

      a.value = 1;
      await flush();
      expect(spy).toHaveBeenCalled(); // Called at least once

      const countBefore = spy.mock.calls.length;
      unsubscribe();

      a.value = 2;
      await flush();

      expect(spy).toHaveBeenCalledTimes(countBefore); // No new calls
    });
  });

  describe('Effect Lifecycle', () => {
    it('stops tracking and runs cleanup on dispose', async () => {
      const a = atom(0);
      const cleanupSpy = vi.fn();
      const runSpy = vi.fn(() => {
        a.value; // Track
        return cleanupSpy;
      });

      const fx = effect(runSpy);
      await flush();
      expect(runSpy).toHaveBeenCalledTimes(1);

      // Update triggers re-run
      a.value = 1;
      await flush();
      expect(runSpy).toHaveBeenCalledTimes(2);
      expect(cleanupSpy).toHaveBeenCalledTimes(1); // Cleanup from first run

      // Dispose
      fx.dispose();
      // Final cleanup should run
      expect(cleanupSpy).toHaveBeenCalledTimes(2);

      // Should not track anymore
      a.value = 2;
      await flush();
      expect(runSpy).toHaveBeenCalledTimes(2); // No new runs
    });
  });

  describe('Dependency Chain Teardown', () => {
    it('isolates disposed nodes from the graph', () => {
      const a = atom(1);
      const mid = computed(() => a.value * 2);
      const end = computed(() => mid.value + 1);

      // Initial read to link graph
      expect(end.value).toBe(3);

      // Dispose middle node
      mid.dispose();

      // 1. Source (a) should remain active/writable
      a.value = 10;
      expect(a.peek()).toBe(10);

      // 2. Accessing disposed node should typically throw or return stale.
      // In this implementation, it seems to throw, which is safe behavior (dead node).
      expect(() => mid.value).toThrow();

      // Cleanup rest
      a.dispose();
      end.dispose();
    });

    it('safely handles complete chain disposal', () => {
      const a = atom(1);
      const b = computed(() => a.value);
      const c = computed(() => b.value);

      // Link
      c.value;

      // Dispose all in arbitrary order
      c.dispose();
      a.dispose(); // Upstream disposed before middle
      b.dispose();

      expect(true).toBe(true); // Should reach here without error
    });
  });
});
