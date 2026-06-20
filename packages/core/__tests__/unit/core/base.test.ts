import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import { STATE_FLAGS } from '@/constants';
import {
  BaseNode,
  nodeHasSubscription,
  nodeNotifySubscribers,
  nodeTrackDependency,
  nodeUnsubscribe,
  untracked,
} from '@/core/base';
import { atom, computed, effect } from '@/index';
import type {
  Dependency,
  DependencyTracker,
  ReactiveDependencyTracker,
  ReactiveNode,
  SubscriberTarget,
} from '@/types';

describe('Tracking Engine', () => {
  describe('untracked()', () => {
    it('suppresses dependency collection while allowing value access', async () => {
      const a = atom(1);
      const b = atom(10);
      let computeCount = 0;

      const c = computed(() => {
        computeCount++;
        return a.value + untracked(() => b.value);
      });

      expect(c.value).toBe(11);

      b.value = 20;
      await sleep(10);
      expect(c.value).toBe(11);
      expect(computeCount).toBe(1);

      a.value = 2;
      await sleep(10);
      expect(c.value).toBe(22);
      expect(computeCount).toBe(2);

      expect(untracked(() => 'foo')).toBe('foo');
      expect(() =>
        untracked(() => {
          throw new Error('baz');
        })
      ).toThrow('baz');
    });
  });

  describe('asynchronous dependency tracking', () => {
    it('does not track dependencies accessed after an await boundary (Sync Limitation)', async () => {
      const a = atom(0);
      let runs = 0;

      const c = computed(
        async () => {
          runs++;
          await sleep(10);
          return a.value;
        },
        { defaultValue: -1 }
      );

      c.value;
      await sleep(30);
      expect(runs).toBe(1);

      a.value = 1;
      await sleep(30);
      await c.value;
      expect(runs).toBe(1);
    });

    it('ensures subscriber notifications are untracked even when triggered inside a tracking context', async () => {
      const trigger = atom(0, { sync: true });
      const leakSource = atom(0);
      let parentRuns = 0;

      trigger.subscribe(() => {
        leakSource.value;
      });

      const parent = effect(() => {
        parentRuns++;
        trigger.value = parentRuns;
      });

      await sleep(10);
      expect(parentRuns).toBe(1);

      leakSource.value = 99;
      await sleep(10);
      expect(parentRuns).toBe(1);

      parent.dispose();
    });
  });

  describe('nodeUnsubscribe()', () => {
    it('handles undefined slots gracefully without throwing TypeError', () => {
      const mockNode = {} as ReactiveNode<void>;
      const mockLink = (() => {}) as SubscriberTarget<void>;
      expect(() => {
        nodeUnsubscribe(mockNode, mockLink);
      }).not.toThrow();
    });
  });

  describe('nodeNotifySubscribers()', () => {
    it('handles undefined slots gracefully without throwing TypeError', () => {
      const mockNode = {} as ReactiveNode<void>;
      expect(() => {
        nodeNotifySubscribers(mockNode, undefined, undefined);
      }).not.toThrow();
    });
  });

  describe('nodeHasSubscription()', () => {
    it('handles undefined slots gracefully without throwing TypeError', () => {
      const mockNode = {} as ReactiveNode<void>;
      expect(() => {
        nodeHasSubscription(mockNode, () => {});
      }).not.toThrow();
    });
  });

  describe('nodeTrackDependency()', () => {
    it('handles null dependency buffer gracefully without throwing TypeError', () => {
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

      expect(() => {
        nodeTrackDependency(
          mockTracker as DependencyTracker & ReactiveDependencyTracker,
          mockDep as Dependency,
          () => {}
        );
      }).not.toThrow();
    });
  });

  describe('BaseNode disposal', () => {
    it('should not allocate _slots or register target when subscribing to a disposed node', () => {
      class TestNode extends BaseNode<number> {}
      const node = new TestNode();

      node.flags |= STATE_FLAGS.DISPOSED;

      const unsub = node.subscribe(() => {});

      expect(node._slots).toBeNull();
      expect(node.subscriberCount()).toBe(0);

      unsub();
    });
  });
});
