import { describe, expect, it } from 'vitest';
import { aeNextTick, atom, computed, effect, untracked } from '@/index';
import { sleep } from '../../utils/test-helpers';

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
