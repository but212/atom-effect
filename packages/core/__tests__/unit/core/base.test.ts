import { beforeEach, describe, expect, it } from 'vitest';
import { STATE_FLAGS } from '@/constants';
import {
  BaseNode,
  nodeHasSubscription,
  nodeNotifySubscribers,
  nodeTrackDependency,
  nodeUnsubscribe,
  untracked,
} from '@/core/base';
import { aeNextTick, scheduler, schedulerEndBatch, schedulerIsBatching } from '@/core/scheduler';
import { atom, computed, effect } from '@/index';
import type {
  Dependency,
  DependencyTracker,
  ReactiveDependencyTracker,
  ReactiveNode,
  SubscriberTarget,
} from '@/types';
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
      const mock: Partial<ReactiveNode<void>> = {};
      return mock as ReactiveNode<void>;
    }

    describe('Subscription robustness with undefined slots', () => {
      const mockLink = (() => {}) as SubscriberTarget<void>;

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
        const mockTracker: Partial<DependencyTracker & ReactiveDependencyTracker> = {
          _trackEpoch: 1,
          _trackCount: 0,
        };

        const mockDep: Partial<Dependency> = {
          _lastSeenEpoch: 0,
          version: 1,
          isComputed: false,
          subscribe: () => () => {},
        };

        // Under robust implementation, if deps buffer is null/undefined, it returns early
        // instead of crashing on tracker._storage.deps! assertion.
        expect(() => {
          nodeTrackDependency(
            mockTracker as DependencyTracker & ReactiveDependencyTracker,
            mockDep as Dependency,
            () => {}
          );
        }).not.toThrow();
      });
    });

    describe('BaseNode disposed subscription optimization', () => {
      it('should not allocate _slots or register target when subscribing to a disposed node', () => {
        class TestNode extends BaseNode<number> {}
        const node = new TestNode();

        node.flags |= STATE_FLAGS.DISPOSED; // Mark as disposed

        const unsub = node.subscribe(() => {});

        // Under the current buggy implementation, subscribing to a disposed node
        // allocates node._slots and adds/removes listener, so node._slots is NOT null/undefined.
        // It should be null/undefined (not allocated) under the optimized implementation.
        expect(node._slots).toBeNull();
        expect(node.subscriberCount()).toBe(0);

        unsub();
      });
    });
  });
});
