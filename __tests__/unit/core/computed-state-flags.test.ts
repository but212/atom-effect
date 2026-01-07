import { describe, expect, it } from 'vitest';
import { AsyncState } from '../../../src/constants';
import { ComputedStateFlags } from '../../../src/core/computed/computed-state-flags';

describe('ComputedStateFlags', () => {
  it('should initialize with DIRTY | IDLE state', () => {
    const flags = new ComputedStateFlags();
    expect(flags.isDirty()).toBe(true);
    expect(flags.isIdle()).toBe(true);
    expect(flags.isPending()).toBe(false);
    expect(flags.isResolved()).toBe(false);
    expect(flags.isRejected()).toBe(false);
  });

  it('should handle dirty flag transitions', () => {
    const flags = new ComputedStateFlags();
    flags.clearDirty();
    expect(flags.isDirty()).toBe(false);
    flags.setDirty();
    expect(flags.isDirty()).toBe(true);
  });

  it('should handle pending state transitions', () => {
    const flags = new ComputedStateFlags();
    flags.setPending();
    expect(flags.isPending()).toBe(true);
    expect(flags.isIdle()).toBe(false);
    expect(flags.getAsyncState()).toBe(AsyncState.PENDING);
  });

  it('should handle resolved state transitions', () => {
    const flags = new ComputedStateFlags();
    flags.setResolved();
    expect(flags.isResolved()).toBe(true);
    expect(flags.isIdle()).toBe(false);
    expect(flags.getAsyncState()).toBe(AsyncState.RESOLVED);
  });

  it('should handle rejected state transitions', () => {
    const flags = new ComputedStateFlags();
    flags.setRejected();
    expect(flags.isRejected()).toBe(true);
    expect(flags.isIdle()).toBe(false);
    expect(flags.getAsyncState()).toBe(AsyncState.REJECTED);
  });

  it('should handle recomputing flag', () => {
    const flags = new ComputedStateFlags();
    expect(flags.isRecomputing()).toBe(false);
    flags.setRecomputing(true);
    expect(flags.isRecomputing()).toBe(true);
    flags.setRecomputing(false);
    expect(flags.isRecomputing()).toBe(false);
  });

  it('should correctly identify fast path', () => {
    const flags = new ComputedStateFlags();
    expect(flags.isFastPath()).toBe(false); // Dirty
    flags.setResolved();
    expect(flags.isFastPath()).toBe(false); // Still dirty
    flags.clearDirty();
    expect(flags.isFastPath()).toBe(true); // Resolved and not dirty
    flags.setDirty();
    expect(flags.isFastPath()).toBe(false); // Dirty again
  });

  it('should reset to initial state', () => {
    const flags = new ComputedStateFlags();
    flags.setResolved();
    flags.clearDirty();
    flags.reset();
    expect(flags.isDirty()).toBe(true);
    expect(flags.isIdle()).toBe(true);
  });

  it('should provide a string representation', () => {
    const flags = new ComputedStateFlags();
    expect(flags.toString()).toContain('DIRTY');
    expect(flags.toString()).toContain('IDLE');

    flags.setResolved();
    flags.clearDirty();
    expect(flags.toString()).toBe('RESOLVED');

    flags.setDirty();
    flags.setRecomputing(true);
    expect(flags.toString()).toContain('DIRTY');
    expect(flags.toString()).toContain('RESOLVED');
    expect(flags.toString()).toContain('RECOMPUTING');
  });
});
