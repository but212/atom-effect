import { describe, expect, it } from 'vitest';
import { atom, computed } from '@/index';

describe('isBufferDirty error boundary', () => {
  it('swallows upstream computation error and returns defaultValue without throwing', () => {
    const trigger = atom(0);
    const upstream = computed(() => {
      if (trigger.value > 0) {
        throw new Error('upstream failure');
      }
      return 10;
    });

    const downstream = computed(
      () => {
        return upstream.value + 1;
      },
      { defaultValue: -1 }
    );

    // Initial read works
    expect(downstream.value).toBe(11);
    expect(downstream.hasError).toBe(false);

    // Invalidate upstream by changing atom
    trigger.value = 1;

    // An upstream error must NOT escape downstream.value; downstream returns defaultValue.
    expect(downstream.value).toBe(-1);
    expect(downstream.hasError).toBe(true);

    // Recovery: once upstream succeeds again, downstream leaves the error state.
    trigger.value = 0;
    expect(downstream.value).toBe(11);
    expect(downstream.hasError).toBe(false);
  });
});
