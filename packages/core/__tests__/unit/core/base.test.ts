import type { SlotBuffer } from '@but212/atom-effect-utils';
import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import { STATE_FLAGS } from '@/constants';
import {
  BaseNode,
  nodeCommitDeps,
  nodeHasSubscription,
  nodeIsComputed,
  nodeIsNotifying,
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
    it('should not allocate _subscriberSlots or register target when subscribing to a disposed node', () => {
      class TestNode extends BaseNode<number> {}
      const node = new TestNode();

      node.flags |= STATE_FLAGS.DISPOSED;

      const unsubscribeCallback = node.subscribe(() => {});

      expect(node._subscriberSlots).toBeNull();
      expect(node.subscriberCount()).toBe(0);

      unsubscribeCallback();
    });
  });

  describe('BaseNode personality traits', () => {
    it('BaseNode default getters return expected values', () => {
      class TestNode extends BaseNode<number> {}
      const node = new TestNode();
      expect(node.isComputed).toBe(false);
      expect(node.isRejected).toBe(false);
      expect(node.hasError).toBe(false);
    });
  });

  describe('Internal API invariants', () => {
    it('nodeIsComputed and nodeIsNotifying work correctly', () => {
      const mockNode: { flags: number; _subscriberSlots: unknown } = {
        flags: 0,
        _subscriberSlots: null,
      };
      expect(nodeIsComputed(mockNode as unknown as ReactiveNode<unknown>)).toBe(false);
      mockNode.flags = 1 << 1; // IS_COMPUTED flag
      expect(nodeIsComputed(mockNode as unknown as ReactiveNode<unknown>)).toBe(true);

      expect(nodeIsNotifying(mockNode as unknown as ReactiveNode<unknown>)).toBe(false);
      mockNode._subscriberSlots = { isLocked: true } as unknown as SlotBuffer<never>;
      expect(nodeIsNotifying(mockNode as unknown as ReactiveNode<unknown>)).toBe(true);
    });

    it('nodeCommitDeps catches errors raised by depBufferTruncateFrom', () => {
      const mockTracker = {
        id: 42,
        _trackCount: 5,
        get _depSlots() {
          throw new Error('Expected test error from _depSlots getter');
        },
      };
      expect(() => {
        nodeCommitDeps(mockTracker as unknown as DependencyTracker & ReactiveDependencyTracker);
      }).not.toThrow();
    });
  });
});
