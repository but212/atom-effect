import { AsyncState, COMPUTED_STATE_FLAGS } from '@/constants';
import type { AsyncStateType } from '@/types';

// AsyncState mapping
const ASYNC_STATE_MASK =
  COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.PENDING | COMPUTED_STATE_FLAGS.REJECTED;
const ASYNC_STATE_LOOKUP = Array(ASYNC_STATE_MASK + 1).fill(AsyncState.IDLE);
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.RESOLVED] = AsyncState.RESOLVED;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.PENDING] = AsyncState.PENDING;
ASYNC_STATE_LOOKUP[COMPUTED_STATE_FLAGS.REJECTED] = AsyncState.REJECTED;

/**
 * Bit flag manager for computed state.
 * Uses bitwise operations for O(1) state transitions and checks.
 *
 * Flags:
 * - DIRTY: Needs recomputation
 * - IDLE: Initial state, no value yet
 * - PENDING: Async computation in progress
 * - RESOLVED: Computation successful, has valid value
 * - REJECTED: Computation failed, has error
 * - RECOMPUTING: Currently executing computation function
 * - HAS_ERROR: Indicates presence of an error
 */
export class ComputedStateFlags {
  private stateFlags: number;

  constructor() {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  /** Checks if the state is DIRTY (needs re-evaluation) */
  isDirty(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  /** Marks the state as DIRTY */
  setDirty(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.DIRTY;
  }

  /** Clears the DIRTY flag */
  clearDirty(): void {
    this.stateFlags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  /** Checks if the state is IDLE */
  isIdle(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.IDLE) !== 0;
  }

  /** Sets the state to IDLE and clears other status flags */
  setIdle(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.IDLE;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  /** Checks if the state is PENDING */
  isPending(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.PENDING) !== 0;
  }

  /** Sets the state to PENDING and clears other status flags */
  setPending(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.PENDING;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.RESOLVED |
      COMPUTED_STATE_FLAGS.REJECTED
    );
  }

  /** Checks if the state is RESOLVED */
  isResolved(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.RESOLVED) !== 0;
  }

  /** Sets the state to RESOLVED and clears other status flags */
  setResolved(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.RESOLVED;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.REJECTED |
      COMPUTED_STATE_FLAGS.HAS_ERROR
    );
  }

  /** Checks if the state is REJECTED */
  isRejected(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.REJECTED) !== 0;
  }

  /** Sets the state to REJECTED and HAS_ERROR, clearing other status flags */
  setRejected(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.REJECTED | COMPUTED_STATE_FLAGS.HAS_ERROR;
    this.stateFlags &= ~(
      COMPUTED_STATE_FLAGS.IDLE |
      COMPUTED_STATE_FLAGS.PENDING |
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  /** Checks if RECOMPUTING flag is set */
  isRecomputing(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  /**
   * Sets or clears the RECOMPUTING flag.
   * @param value - true to set, false to clear.
   */
  setRecomputing(value: boolean): void {
    const mask = COMPUTED_STATE_FLAGS.RECOMPUTING;
    this.stateFlags = (this.stateFlags & ~mask) | (-Number(value) & mask);
  }

  /** Returns the current async state as a string enum value */
  getAsyncState(): AsyncStateType {
    return ASYNC_STATE_LOOKUP[this.stateFlags & ASYNC_STATE_MASK];
  }

  /**
   * Optimization: checks if the value can be returned immediately.
   * Path is fast if RESOLVED and NOT DIRTY.
   */
  isFastPath(): boolean {
    return (
      (this.stateFlags & (COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.DIRTY)) ===
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  /** Resets flags to initial state (DIRTY | IDLE) */
  reset(): void {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  /** Returns a string representation of the active flags */
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
