import { AsyncState, COMPUTED_STATE_FLAGS } from '@/constants';
import type { AsyncStateType } from '@/types';

/**
 * Bit flag manager for computed state. Uses bitwise ops for O(1) operations.
 * Flags: DIRTY(0), IDLE(1), PENDING(2), RESOLVED(3), REJECTED(4), RECOMPUTING(5), HAS_ERROR(6)
 */
export class ComputedStateFlags {
  private stateFlags: number;

  constructor() {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  isDirty(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  setDirty(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.DIRTY;
  }

  clearDirty(): void {
    this.stateFlags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  isIdle(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.IDLE) !== 0;
  }

  setIdle(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.IDLE;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  isPending(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  setPending(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.PENDING;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  isResolved(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  setResolved(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.RESOLVED;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.REJECTED |
      COMPUTED_STATE_FLAGS.HAS_ERROR
    );
  }

  isRejected(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.REJECTED) !== 0;
  }

  setRejected(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  isRecomputing(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  /** Branchless set/clear of recomputing flag */
  setRecomputing(value: boolean): void {
    const mask = COMPUTED_STATE_FLAGS.RECOMPUTING;
    this.stateFlags = (this.stateFlags & ~mask) | (-Number(value) & mask);
  }

  getAsyncState(): AsyncStateType {
    if (this.isPending()) return AsyncState.PENDING;
    if (this.isResolved()) return AsyncState.RESOLVED;
    if (this.isRejected()) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  /** Single bitwise check: resolved AND not dirty */
  isFastPath(): boolean {
    return (
      (this.stateFlags & (COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.DIRTY)) ===
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  reset(): void {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  toString(): string {
    const states: string[] = [];
    if (this.isDirty()) states.push('DIRTY');
    if (this.isIdle()) states.push('IDLE');
    if (this.isPending()) states.push('PENDING');
    if (this.isResolved()) states.push('RESOLVED');
    if (this.isRejected()) states.push('REJECTED');
    if (this.isRecomputing()) states.push('RECOMPUTING');
    return states.join(' | ');
  }
}
