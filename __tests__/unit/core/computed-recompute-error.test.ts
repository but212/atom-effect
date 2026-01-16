import { afterEach, describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { ComputedError } from '@/errors/errors';
import { debug } from '@/utils/debug';

describe('Computed recompute error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should properly handle error when commitDependencies fails inside the catch block', () => {
    const a = atom(1);
    const functionError = new Error('Function Error');
    const commitError = new Error('Commit Error');

    // Spy on checkCircular to throw 'Commit Error' when valid dependency check happens
    const checkCircularSpy = vi.spyOn(debug, 'checkCircular').mockImplementation(() => {
      throw commitError;
    });

    const c = computed(() => {
      a.value; // Dependency to trigger syncDependencies -> checkCircular
      throw functionError; // Trigger the catch block in _recompute
    });

    // Access to trigger computation
    let errorCaught: unknown;
    try {
      c.value;
    } catch (e) {
      errorCaught = e;
    }

    // Verify an error was thrown
    expect(errorCaught).toBeDefined();
    expect(errorCaught).toBeInstanceOf(ComputedError);

    // CRITICAL CHECK:
    // With the fix, the Commit Error is caught and passed to _handleComputationError.
    // So the computed atom successfully transitions to REJECTED/HAS_ERROR state.
    // Without the fix, the error would bubble up, bypassing _handleComputationError,
    // leaving the atom in an inconsistent state (likely DIRTY or IDLE, invalid).
    expect(c.hasError).toBe(true);
    expect(c.lastError).toBeDefined();

    expect(checkCircularSpy).toHaveBeenCalled();
  });
});
