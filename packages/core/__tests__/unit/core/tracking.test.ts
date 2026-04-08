/**
 * @fileoverview tracking.ts core logic and model integrity tests
 */

import { describe, expect, it, vi } from 'vitest';
import { DependencyLink, Subscription, untracked } from '@/core/tracking';
import { ERROR_MESSAGES } from '@/errors';
import { atom, computed } from '@/index';
import type { Dependency } from '@/types';
import { flush } from '../../utils/test-helpers';

describe('Tracking Engine core', () => {
  describe('Internal Models', () => {
    it('should maintain structural integrity of graph links and subscriptions', () => {
      const mockNode = { version: 1 } as Dependency;
      const unsub = vi.fn();

      // DependencyLink integrity
      const link = new DependencyLink(mockNode, 1, unsub);
      expect(link.node).toBe(mockNode);
      expect(link.version).toBe(1);

      // Subscription dispatch logic
      const fn = vi.fn();
      const s1 = new Subscription(fn);
      s1.notify(10, 0);
      expect(fn).toHaveBeenCalledWith(10, 0);

      const sub = { execute: vi.fn() };
      const s2 = new Subscription(undefined, sub);
      s2.notify();
      expect(sub.execute).toHaveBeenCalled();
    });
  });

  describe('untracked()', () => {
    it('should manage core execution flow (return values & errors)', () => {
      // Identity
      expect(untracked(() => 'result')).toBe('result');

      // Error propagation
      expect(() =>
        untracked(() => {
          throw new Error('fail');
        })
      ).toThrow('fail');
    });

    it('should suppress reactivity selectively within computed contexts', async () => {
      const tracked = atom(1);
      const isolated = atom(10);
      let runCount = 0;

      const c = computed(() => {
        runCount++;
        // Mixed access: 'tracked' is linked, 'isolated' is ignored
        return tracked.value + untracked(() => isolated.value);
      });

      expect(c.value).toBe(11);
      expect(runCount).toBe(1);

      // Trigger 1: Untracked dependency change should NOT trigger re-run
      isolated.value = 20;
      await flush();
      expect(runCount).toBe(1);

      // Trigger 2: Tracked dependency change SHOULD trigger re-run
      // It should pick up the latest value of both at re-run time
      tracked.value = 2;
      await flush();
      expect(c.value).toBe(22); // 2 + 20
      expect(runCount).toBe(2);
    });

    it('should strictly forbid async callbacks in DEV mode', () => {
      expect(() => {
        untracked(async () => {
          await Promise.resolve();
        });
      }).toThrow(ERROR_MESSAGES.TRACKING_UNTRACKED_ASYNC);
    });
  });
});
