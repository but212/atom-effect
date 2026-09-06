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

    // Reading downstream.value triggers shouldRecompute -> isBufferDirty -> upstream.value
    // If upstream.value throws in isBufferDirty, it must NOT escape downstream.value.
    // Instead, downstream should safely return defaultValue (-1).
    expect(downstream.value).toBe(-1);
    expect(downstream.hasError).toBe(true);
  });
});
