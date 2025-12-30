/**
 * @fileoverview Computed state flags management
 * @description Bit flag utilities for efficient computed state management
 */

import { AsyncState, COMPUTED_STATE_FLAGS } from '../../constants';
import type { AsyncStateType } from '../../types';

/**
 * State flags manager for computed atoms
 * Uses bitwise operations for efficient state checks and updates
 */
export class ComputedStateFlags {
  private stateFlags: number;

  constructor() {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  // ========================================
  // Dirty State
  // ========================================

  isDirty(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.DIRTY) !== 0;
  }

  setDirty(): void {
    this.stateFlags |= COMPUTED_STATE_FLAGS.DIRTY;
  }

  clearDirty(): void {
    this.stateFlags &= ~COMPUTED_STATE_FLAGS.DIRTY;
  }

  // ========================================
  // Idle State
  // ========================================

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

  // ========================================
  // Pending State
  // ========================================

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

  // ========================================
  // Resolved State
  // ========================================

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

  // ========================================
  // Rejected State
  // ========================================

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

  // ========================================
  // Recomputing State
  // ========================================

  isRecomputing(): boolean {
    return (this.stateFlags & COMPUTED_STATE_FLAGS.RECOMPUTING) !== 0;
  }

  setRecomputing(value: boolean): void {
    if (value) {
      this.stateFlags |= COMPUTED_STATE_FLAGS.RECOMPUTING;
    } else {
      this.stateFlags &= ~COMPUTED_STATE_FLAGS.RECOMPUTING;
    }
  }

  // ========================================
  // Async State Getter
  // ========================================

  getAsyncState(): AsyncStateType {
    if (this.isPending()) return AsyncState.PENDING;
    if (this.isResolved()) return AsyncState.RESOLVED;
    if (this.isRejected()) return AsyncState.REJECTED;
    return AsyncState.IDLE;
  }

  // ========================================
  // Fast Path Check
  // ========================================

  /**
   * Fast path check for resolved and not dirty state
   * Used for cache hit optimization (~50% faster access)
   */
  isFastPath(): boolean {
    return (
      (this.stateFlags & (COMPUTED_STATE_FLAGS.RESOLVED | COMPUTED_STATE_FLAGS.DIRTY)) ===
      COMPUTED_STATE_FLAGS.RESOLVED
    );
  }

  // ========================================
  // Reset
  // ========================================

  reset(): void {
    this.stateFlags = COMPUTED_STATE_FLAGS.DIRTY | COMPUTED_STATE_FLAGS.IDLE;
  }

  // ========================================
  // Debug Info
  // ========================================

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
