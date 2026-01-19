import { SMI_MAX } from '@/constants';
import type { DependencyId } from '@/types';
import { generateId } from '@/utils/debug';

/**
 * Base class for all reactive nodes (Atoms, Computed, Effects).
 *
 * Optimized for V8 hidden classes:
 * - Initializes Smi (Small Integer) fields first.
 * - Provides common identity, flag, and version management.
 *
 * Phase-Shift Versioning:
 * - version uses 30-bit structure (10-bit Cycle + 20-bit Phase)
 * - Enables branchless operations for version comparison and priority calculation
 */
export class ReactiveNode {
  /** Unique numerical identifier (Smi) */
  readonly id: DependencyId;

  /** Internal flags (Smi) for state management (Disposed, Dirty, etc.) */
  flags: number;

  /**
   * Version counter using phase-shift encoding (Smi).
   * Upper 10 bits = Cycle (rotation count), Lower 20 bits = Phase (angle)
   * Enables branchless comparison and priority calculation.
   */
  version: number;

  constructor() {
    this.id = (generateId() & SMI_MAX) as DependencyId;
    this.flags = 0;
    this.version = 0;
  }

  /**
   * Rotates the phase by 1, automatically incrementing cycle on overflow.
   *
   * Performance Benefits:
   * - Branchless: No conditional statements
   * - O(1): Single bitwise AND operation
   * - Smi-safe: Result always within 30-bit range (0x3fffffff)
   *
   * When Phase reaches 0xfffff (1,048,575), the next increment:
   * - Overflows into Cycle bits
   * - Phase resets to 0
   * - Cycle increments by 1
   *
   * @returns The new version after phase rotation
   */
  protected rotatePhase(): number {
    return (this.version = (this.version + 1) & SMI_MAX);
  }

  /**
   * Calculates the logical distance (shift) between current and cached version.
   *
   * Uses modular arithmetic to handle cycle wraparound correctly.
   * The result represents how many phase rotations have occurred since
   * the cached version was recorded.
   *
   * Performance Benefits:
   * - Branchless: Single subtraction with mask
   * - Handles wraparound: Works correctly even when version overflows
   *
   * Use Cases:
   * - Scheduler priority: Large shifts indicate stale updates
   * - Dependency staleness: Detect how outdated a cached value is
   *
   * @param cachedVersion - The previously cached version to compare against
   * @returns Non-negative shift distance (0 to 0x3fffffff)
   */
  getShift(cachedVersion: number): number {
    return (this.version - cachedVersion) & SMI_MAX;
  }
}

