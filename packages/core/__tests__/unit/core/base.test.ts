import { sleep } from '@tests/utils/test-helpers';
import { describe, expect, it } from 'vitest';
import {
  nodeNotifySubscribers,
  runInTrackingContext,
  trackingContext,
  untracked,
} from '@/core/base';
import { atom, computed, effect } from '@/index';
import type { DependencySubscriber, ReactiveNode } from '@/types';

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

    describe('trackingContext.current restoration', () => {
      const makeSubscriber = (): DependencySubscriber => ({ addDependency: () => {} });

      it('restores the outer subscriber after nested runInTrackingContext', () => {
        const outer = makeSubscriber();
        const inner = makeSubscriber();
        const seen: unknown[] = [];

        runInTrackingContext(outer, () => {
          seen.push(trackingContext.current);
          runInTrackingContext(inner, () => seen.push(trackingContext.current));
          seen.push(trackingContext.current);
        });

        expect(seen).toEqual([outer, inner, outer]);
        expect(trackingContext.current).toBeNull();
      });

      it('restores the outer subscriber when the callback throws', () => {
        const outer = makeSubscriber();
        const inner = makeSubscriber();

        runInTrackingContext(outer, () => {
          expect(() =>
            runInTrackingContext(inner, () => {
              throw new Error('boom');
            })
          ).toThrow('boom');
          expect(trackingContext.current).toBe(outer);
        });

        expect(trackingContext.current).toBeNull();
      });

      it('suppresses tracking inside untracked and restores it afterwards, including on throw', () => {
        const outer = makeSubscriber();

        runInTrackingContext(outer, () => {
          untracked(() => {
            expect(trackingContext.current).toBeNull();
            untracked(() => expect(trackingContext.current).toBeNull());
            expect(trackingContext.current).toBeNull();
          });
          expect(trackingContext.current).toBe(outer);

          expect(() =>
            untracked(() => {
              throw new Error('boom');
            })
          ).toThrow('boom');
          expect(trackingContext.current).toBe(outer);
        });

        expect(trackingContext.current).toBeNull();
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
    describe('nodeSubscribe() release handle', () => {
      it('is idempotent: repeated calls leave the subscriber count at zero', () => {
        const source = atom(0);
        const unsubscribe = source.subscribe(() => {});
        expect(source.subscriberCount()).toBe(1);

        unsubscribe();
        unsubscribe();
        expect(source.subscriberCount()).toBe(0);
        source.dispose();
      });

      it('ignores a duplicate listener and keeps the original subscription', () => {
        const source = atom(0);
        const listener = () => {};
        const first = source.subscribe(listener);
        const second = source.subscribe(listener);

        expect(source.subscriberCount()).toBe(1);
        second();
        expect(source.subscriberCount()).toBe(1);
        first();
        expect(source.subscriberCount()).toBe(0);
        source.dispose();
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
