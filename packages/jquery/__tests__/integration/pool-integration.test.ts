import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/index';
import { disableAutoCleanup, enableAutoCleanup, registry } from '@/core/registry';
import { bindingRecordPool, cleanupsArrayPool, effectsArrayPool } from '@/utils/pool';

describe('Pool Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    enableAutoCleanup(document.body);
  });

  afterEach(() => {
    disableAutoCleanup();
    registry.cleanupTree(document.body);
    // Drain pools to avoid cross-test pollution.
    bindingRecordPool.drain();
    effectsArrayPool.reset();
    cleanupsArrayPool.reset();
  });

  // --------------------------------------------------------------------------
  // BindingRecord pool integration
  // --------------------------------------------------------------------------

  describe('BindingRecord pool', () => {
    it('should recycle BindingRecord after cleanup', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      // trackCleanup creates a BindingRecord via pool.acquire()
      registry.trackCleanup(el, () => {});

      expect(bindingRecordPool.size).toBe(0); // acquired, not in pool

      // Cleanup releases the record back to the pool
      registry.cleanup(el);

      expect(bindingRecordPool.size).toBe(1);
    });

    it('should reuse BindingRecord for new element after previous cleanup', () => {
      const el1 = document.createElement('div');
      document.body.appendChild(el1);
      registry.trackCleanup(el1, () => {});
      registry.cleanup(el1);

      const poolSizeBefore = bindingRecordPool.size;
      expect(poolSizeBefore).toBeGreaterThan(0);

      // New element should acquire from pool
      const el2 = document.createElement('span');
      document.body.appendChild(el2);
      registry.trackCleanup(el2, () => {});

      // Pool should have shrunk by 1
      expect(bindingRecordPool.size).toBe(poolSizeBefore - 1);
    });

    it('should release record with all fields reset', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const cleanupFn = vi.fn();
      registry.trackCleanup(el, cleanupFn);
      registry.trackEffect(el, {
        dispose: vi.fn(),
        [Symbol.dispose]() {
          this.dispose();
        },
        run: () => {},
        isDisposed: false,
        isExecuting: false,
        executionCount: 0,
      });

      registry.cleanup(el);

      // Acquire the recycled record and verify it's clean
      const recycled = bindingRecordPool.acquire() as unknown as Record<string, unknown>;
      expect(recycled.effects).toBe(undefined);
      expect(recycled.cleanups).toBe(undefined);
      expect(recycled.componentCleanup).toBe(undefined);
    });
  });

  // --------------------------------------------------------------------------
  // effects/cleanups ArrayPool integration
  // --------------------------------------------------------------------------

  describe('effects/cleanups ArrayPool', () => {
    it('should recycle effects array after cleanup', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      const mockEffect = {
        dispose: vi.fn(),
        [Symbol.dispose]() {
          this.dispose();
        },
        run: () => {},
        isDisposed: false,
        isExecuting: false,
        executionCount: 0,
      };
      registry.trackEffect(el, mockEffect);

      registry.cleanup(el);

      expect(effectsArrayPool.acquire().length).toBe(0);
    });

    it('should recycle cleanups array after cleanup', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);

      registry.trackCleanup(el, () => {});
      registry.trackCleanup(el, () => {});

      registry.cleanup(el);

      // The released array should be available for reuse
      const reused = cleanupsArrayPool.acquire();
      expect(reused).toBeInstanceOf(Array);
      expect(reused.length).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Stress: many bind-unbind cycles
  // --------------------------------------------------------------------------

  describe('stress', () => {
    it('should handle rapid bind-cleanup cycles without leaks', () => {
      const CYCLES = 50;

      for (let i = 0; i < CYCLES; i++) {
        const el = document.createElement('div');
        document.body.appendChild(el);

        registry.trackEffect(el, {
          dispose: () => {},
          [Symbol.dispose]() {
            this.dispose();
          },
          run: () => {},
          isDisposed: false,
          isExecuting: false,
          executionCount: 0,
        });
        registry.trackCleanup(el, () => {});

        registry.cleanup(el);
        el.remove();
      }

      // Pool sizes should be bounded by limits (not unbounded growth)
      expect(bindingRecordPool.size).toBeLessThanOrEqual(128);
      expect(effectsArrayPool.acquire()).toBeInstanceOf(Array);
      expect(cleanupsArrayPool.acquire()).toBeInstanceOf(Array);
    });
  });
});
