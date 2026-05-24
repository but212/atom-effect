import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTrackingContext,
  nodeHasSubscription,
  nodeNotifySubscribers,
  nodeTrackDependency,
  nodeUnsubscribe,
  rollbackTrackingSubscriber,
  untracked,
} from '@/core/base';
import { aeNextTick, scheduler, schedulerEndBatch, schedulerIsBatching } from '@/core/scheduler';
import { atom, computed, effect } from '@/index';
import type { Dependency, DependencyTracker, ReactiveNode, Subscription } from '@/types';
import { sleep } from '../../utils/test-helpers';

describe('Tracking Engine', () => {
  beforeEach(async () => {
    // Wait for any pending flushes and reset batch depth
    await aeNextTick();
    while (schedulerIsBatching(scheduler)) {
      schedulerEndBatch(scheduler);
    }
  });

  describe('Tracking Context & untracked()', () => {
    it('untracked() suppresses dependency collection while allowing value access', async () => {
      const a = atom(1);
      const b = atom(10);
      let computeCount = 0;

      // Mixed mode: a is tracked, b is untracked
      const c = computed(() => {
        computeCount++;
        return a.value + untracked(() => b.value);
      });

      expect(c.value).toBe(11);

      // 1. Untracked change: must NOT trigger re-computation
      b.value = 20;
      await aeNextTick();
      expect(c.value).toBe(11); // Stale value is expected until 'a' changes
      expect(computeCount).toBe(1);

      // 2. Tracked change: must trigger re-computation and pick up latest untracked value
      a.value = 2;
      await aeNextTick();
      expect(c.value).toBe(22); // 2 + 20
      expect(computeCount).toBe(2);

      // 3. Simple passthrough & error propagation
      expect(untracked(() => 'foo')).toBe('foo');
      expect(() =>
        untracked(() => {
          throw new Error('baz');
        })
      ).toThrow('baz');
    });

    it('does not track dependencies accessed after an await boundary (Sync Limitation)', async () => {
      const a = atom(0);
      let runs = 0;

      // Async computed: tracking only works before the first 'await'
      const c = computed(
        async () => {
          runs++;
          await sleep(10);
          return a.value;
        },
        { defaultValue: -1 }
      );

      c.value; // Trigger first evaluation
      await sleep(30);
      expect(runs).toBe(1);

      // Update 'a': Since 'a.value' was accessed after 'await', 'c' should NOT be subscribed to 'a'
      a.value = 1;
      await aeNextTick();
      await c.value; // Force re-evaluation attempt
      expect(runs).toBe(1); // Should not have re-run
    });
  });

  describe('Subscription Notification Robustness', () => {
    it('ensures subscriber notifications are untracked even when triggered inside a tracking context', async () => {
      const trigger = atom(0, { sync: true });
      const leakSource = atom(0);
      let parentRuns = 0;

      // Subscriber that accesses an external atom
      trigger.subscribe(() => {
        leakSource.value;
      });

      const parent = effect(() => {
        parentRuns++;
        // Triggering a sync update here forces notifications to happen
        // WHILE this effect's tracking context is active.
        trigger.value = parentRuns;
      });

      await aeNextTick();
      expect(parentRuns).toBe(1);

      // Update leakSource: parent must NOT re-run because the subscriber access was untracked
      leakSource.value = 99;
      await aeNextTick();
      expect(parentRuns).toBe(1);

      parent.dispose();
    });
  });

  describe('Internal Engine Robustness & Edge Cases', () => {
    function createMockNodeWithUndefinedSlots(): ReactiveNode<void> {
      return {
        _storage: {
          slots: undefined,
          deps: null,
        },
      } as unknown as ReactiveNode<void>;
    }

    describe('rollbackTrackingSubscriber', () => {
      it('safely limits target depth to stack size when depth is out of bounds', () => {
        const context = createTrackingContext();
        // Stack is empty (length 0). Attempt to rollback to depth 1.
        rollbackTrackingSubscriber(context, 1);

        // Under robust implementation, target depth is bounded to stack.length,
        // so context.current remains null (not undefined).
        expect(context.current).toBeNull();
      });

      it('safely limits target depth to zero when depth is negative', () => {
        const context = createTrackingContext();

        // Under robust implementation, negative depth is clamped to zero
        // and does not throw RangeError.
        expect(() => {
          rollbackTrackingSubscriber(context, -1);
        }).not.toThrow();
      });
    });

    describe('Subscription robustness with undefined slots', () => {
      const mockLink = { k: 0, t: () => {} } as unknown as Subscription<void>;

      it('handles undefined slots gracefully in nodeUnsubscribe without throwing TypeError', () => {
        const mockNode = createMockNodeWithUndefinedSlots();
        expect(() => {
          nodeUnsubscribe(mockNode, mockLink);
        }).not.toThrow();
      });

      it('handles undefined slots gracefully in nodeNotifySubscribers without throwing TypeError', () => {
        const mockNode = createMockNodeWithUndefinedSlots();
        expect(() => {
          nodeNotifySubscribers(mockNode, undefined, undefined);
        }).not.toThrow();
      });

      it('handles undefined slots gracefully in nodeHasSubscription without throwing TypeError', () => {
        const mockNode = createMockNodeWithUndefinedSlots();
        expect(() => {
          nodeHasSubscription(mockNode, () => {});
        }).not.toThrow();
      });
    });

    describe('nodeTrackDependency safety', () => {
      it('handles null dependency buffer gracefully in nodeTrackDependency without throwing TypeError', () => {
        const mockTracker = {
          _trackEpoch: 1,
          _trackCount: 0,
          _storage: {
            slots: null,
            deps: null,
          },
        } as unknown as DependencyTracker & ReactiveNode<void>;

        const mockDep = {
          _lastSeenEpoch: 0,
          version: 1,
          isComputed: false,
          subscribe: () => () => {},
        } as unknown as Dependency;

        // Under robust implementation, if deps buffer is null/undefined, it returns early
        // instead of crashing on tracker._storage.deps! assertion.
        expect(() => {
          nodeTrackDependency(mockTracker, mockDep, () => {});
        }).not.toThrow();
      });
    });
  });
});
