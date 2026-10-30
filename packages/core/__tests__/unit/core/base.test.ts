import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import {
  nodeHasSubscription,
  nodeNotifySubscribers,
  nodeUnsubscribe,
  untracked,
} from '@/core/base';
import { atom, computed, effect } from '@/index';
import type { ReactiveNode, SubscriberTarget } from '@/types';

describe('BaseEngine (base.ts)', () => {
  describe('Tracking Context Primitives', () => {
    describe('untracked()', () => {
      it('suppresses dependency collection while allowing value access', async () => {
        const firstAtom = atom(1);
        const secondAtom = atom(10);
        let computeCount = 0;

        const computedInstance = computed(() => {
          computeCount++;
          return firstAtom.value + untracked(() => secondAtom.value);
        });

        expect(computedInstance.value).toBe(11);

        secondAtom.value = 20;
        await sleep(10);
        expect(computedInstance.value).toBe(11);
        expect(computeCount).toBe(1);

        firstAtom.value = 2;
        await sleep(10);
        expect(computedInstance.value).toBe(22);
        expect(computeCount).toBe(2);

        expect(untracked(() => 'foo')).toBe('foo');
        expect(() =>
          untracked(() => {
            throw new Error('baz');
          })
        ).toThrow('baz');
      });
    });

    describe('Asynchronous tracking boundaries (Limitations)', () => {
      it('does not track dependencies accessed after an await boundary', async () => {
        const someAtom = atom(0);
        let runs = 0;

        const computedInstance = computed(
          async () => {
            runs++;
            await sleep(10);
            return someAtom.value;
          },
          { defaultValue: -1 }
        );

        computedInstance.value;
        await sleep(30);
        expect(runs).toBe(1);

        someAtom.value = 1;
        await sleep(30);
        await computedInstance.value;
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
  });

  describe('Internal Engine API Functions', () => {
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

    describe('Error Handling Timing', () => {
      it('should propagate the original evaluation error to subscribers instead of a circular dependency error', () => {
        const errorMsg = 'computation failed';
        const computedInstance = computed(() => {
          throw new Error(errorMsg);
        });

        let subscriberError = null as unknown as Error;
        computedInstance.subscribe(() => {
          try {
            computedInstance.value;
          } catch (err: unknown) {
            subscriberError = err as Error;
          }
        });

        try {
          computedInstance.value;
        } catch (_e) {
          // Ignored: first evaluation throws
        }

        expect(subscriberError).toBeDefined();
        expect(subscriberError.message).toContain(errorMsg);
        expect(subscriberError.message).not.toContain('Circular dependency detected');
      });
    });
  });
});
