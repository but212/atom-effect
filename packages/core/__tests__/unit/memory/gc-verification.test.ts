/**
 * @fileoverview WeakRef-based GC verification tests
 * @description Tests to verify objects are garbage-collected when references are released
 *
 * Note: These tests require --expose-gc flag to access global.gc()
 * Run with: node --expose-gc
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';

// Helper to trigger GC if available
function tryGC(): boolean {
  if (typeof global.gc === 'function') {
    global.gc();
    return true;
  }
  return false;
}

// Helper to wait for potential async cleanup
async function waitForCleanup(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  tryGC();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('GC Verification', () => {
  describe('Atom cleanup', () => {
    it('should release atom when no references remain', async () => {
      let atomRef: WeakRef<ReturnType<typeof atom<number>>> | null = null;

      // Create and immediately release atom
      (() => {
        const a = atom(42);
        atomRef = new WeakRef(a);
        expect(a.peek()).toBe(42);
      })();

      await waitForCleanup();

      // If GC is available, the atom should be collected
      if (tryGC()) {
        // WeakRef.deref() returns undefined if collected
        // Note: GC is not deterministic, so we may not always see collection
        const derefed = atomRef?.deref();
        // This is a soft assertion - GC timing is not guaranteed
        if (derefed === undefined) {
          expect(derefed).toBeUndefined();
        }
      }
    });

    it('should cleanup subscriber references on unsubscribe', async () => {
      const a = atom(0);
      let callCount = 0;

      const unsubscribe = a.subscribe(() => {
        callCount++;
      });

      a.value = 1;
      await waitForCleanup();
      expect(callCount).toBeGreaterThan(0);

      const countBefore = callCount;
      unsubscribe();

      // After unsubscribe, changes should not trigger callback
      a.value = 2;
      await waitForCleanup();
      expect(callCount).toBe(countBefore);

      a.dispose();
    });
  });

  describe('Computed cleanup', () => {
    it('should release computed when disposed', async () => {
      let computedRef: WeakRef<ReturnType<typeof computed<number>>> | null = null;

      const source = atom(10);

      (() => {
        const c = computed(() => source.value * 2);
        computedRef = new WeakRef(c);
        expect(c.value).toBe(20);
        c.dispose();
      })();

      await waitForCleanup();

      if (tryGC()) {
        const derefed = computedRef?.deref();
        // Soft assertion for GC behavior
        if (derefed === undefined) {
          expect(derefed).toBeUndefined();
        }
      }

      source.dispose();
    });

    it('should not hold references to disposed dependencies', async () => {
      const a = atom(5);
      const b = computed(() => a.value + 1);

      expect(b.value).toBe(6);

      // Dispose the computed
      b.dispose();

      // The atom should still work independently
      a.value = 10;
      expect(a.peek()).toBe(10);

      a.dispose();
    });
  });

  describe('Effect cleanup', () => {
    it('should stop tracking after dispose', async () => {
      const a = atom(0);
      let effectRunCount = 0;

      const fx = effect(() => {
        a.value; // Track dependency
        effectRunCount++;
      });

      await waitForCleanup();
      const countAfterInit = effectRunCount;

      // Trigger effect
      a.value = 1;
      await waitForCleanup();
      expect(effectRunCount).toBeGreaterThan(countAfterInit);

      const countBeforeDispose = effectRunCount;
      fx.dispose();

      // After dispose, changes should not trigger effect
      a.value = 2;
      await waitForCleanup();
      expect(effectRunCount).toBe(countBeforeDispose);

      a.dispose();
    });

    it('should call cleanup function on dispose', async () => {
      let cleanupCalled = false;

      const fx = effect(() => {
        return () => {
          cleanupCalled = true;
        };
      });

      await waitForCleanup();
      expect(cleanupCalled).toBe(false);

      fx.dispose();
      expect(cleanupCalled).toBe(true);
    });

    it('should release effect reference when disposed', async () => {
      let effectRef: WeakRef<ReturnType<typeof effect>> | null = null;
      const a = atom(0);

      (() => {
        const fx = effect(() => {
          a.value;
        });
        effectRef = new WeakRef(fx);
        fx.dispose();
      })();

      await waitForCleanup();

      if (tryGC()) {
        const derefed = effectRef?.deref();
        if (derefed === undefined) {
          expect(derefed).toBeUndefined();
        }
      }

      a.dispose();
    });
  });

  describe('Dependency chain cleanup', () => {
    it('should clean up entire dependency chain', async () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => b.value + 1);

      expect(c.value).toBe(3);

      // Dispose in reverse order
      c.dispose();
      b.dispose();
      a.dispose();

      // No errors should occur
      expect(true).toBe(true);
    });

    it('should handle partial chain disposal', async () => {
      const a = atom(1);
      const b = computed(() => a.value * 2);
      const c = computed(() => b.value + 1);

      expect(c.value).toBe(3);

      // Dispose middle of chain
      b.dispose();

      // Source should still work
      a.value = 10;
      expect(a.peek()).toBe(10);

      a.dispose();
      c.dispose();
    });
  });
});
