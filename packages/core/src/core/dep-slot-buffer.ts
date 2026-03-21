import type { DependencyLink } from '@/core/dep-tracking';
import { SlotBuffer } from '@/core/slot-buffer';
import type { Dependency } from '@/types';

/**
 * Specialized inline-slot container for dependency tracking.
 *
 * Inherits from `SlotBuffer` to share the same zero-allocation inline
 * properties (`_s0`...`_s3`). Adds dependency-specific in-place updates,
 * truncation, and a hybrid O(1) Map fallback for mega-node performance.
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  private _map: Map<Dependency, number> | null = null;
  private readonly _SCAN_THRESHOLD = 32;

  /**
   * Looks for an existing subscription to the given node starting from `trackIndex`.
   * If found, swaps it to `trackIndex`, updates version, and returns true.
   *
   * Automatically falls back to an O(1) Map lookup if the remaining items
   * exceed `_SCAN_THRESHOLD` to prevent O(N^2) mega-node performance cliffs.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    if (trackIndex >= this._count) return false;

    const remaining = this._count - trackIndex;

    // Use Hybrid O(1) Map Fallback for Mega-Nodes
    if (this._map !== null || remaining > this._SCAN_THRESHOLD) {
      if (this._map === null) {
        this._map = new Map();
        for (let i = trackIndex; i < this._count; i++) {
          const link = this.getAt(i);
          if (link?.unsub) {
            this._map.set(link.node, i);
          }
        }
      }

      const existingIndex = this._map.get(dep);
      if (existingIndex !== undefined && existingIndex >= trackIndex) {
        const link = this.getAt(existingIndex);
        if (link?.unsub) {
          link.version = dep.version;
          if (existingIndex !== trackIndex) {
            // Swap them to preserve the occupant at trackIndex for later evaluation
            const occupant = this.getAt(trackIndex);
            if (occupant) {
              this.setAt(existingIndex, occupant);
              if (occupant.unsub) this._map.set(occupant.node, existingIndex);
            } else {
              this.setAt(existingIndex, null);
            }
            this.setAt(trackIndex, link);
          }
          return true;
        }
      }
      return false;
    }

    // Fast linear scan
    for (let i = trackIndex; i < this._count; i++) {
      const link = this.getAt(i);
      if (link && link.node === dep && link.unsub) {
        link.version = dep.version;
        if (i !== trackIndex) {
          // Swap them
          const occupant = this.getAt(trackIndex);
          if (occupant) {
            this.setAt(i, occupant);
          }
          this.setAt(trackIndex, link);
        }
        return true;
      }
    }
    return false;
  }

  /**
   * Inserts a new link at `trackIndex`, relocating the current occupant
   * to the end of the buffer so it can be cleanly unsubscribed later by `truncateFrom`.
   */
  insertNew(trackIndex: number, link: DependencyLink): void {
    if (trackIndex < this._count) {
      const occupant = this.getAt(trackIndex);
      if (occupant) {
        this.add(occupant); // increments _count and appends
        if (this._map !== null && occupant.unsub) {
          this._map.set(occupant.node, this._count - 1);
        }
      }
    }
    this.setAt(trackIndex, link);
  }

  /**
   * Discards all links from the given index onwards.
   * Unsubscribes each link before removing it.
   */
  truncateFrom(index: number): void {
    super.truncateFrom(index, (link) => link.unsub?.());
    if (this._map !== null && index <= this._count) {
      // Typically called at the end of tracking.
      // Safest to clear the map here to avoid holding stale memory.
      this._map.clear();
      this._map = null;
    }
  }

  /** Unsubscribes from all links and resets the buffer. */
  disposeAll(): void {
    if (this._count > 0) {
      this.truncateFrom(0);
    }
    if (this._map !== null) {
      this._map.clear();
      this._map = null;
    }
  }

  /**
   * [Safety Guard]
   * remove() is strictly prohibited in DepSlotBuffer.
   * DepSlotBuffer relies on strict sequential indices. Creating middle null-gaps
   * would break the fast-path sequential access in getAt().
   * Always use truncateFrom() to remove items.
   */
  override remove(_item: DependencyLink): boolean {
    throw new Error(
      'remove() is strictly prohibited in DepSlotBuffer to preserve sequential cache paths.'
    );
  }

  /**
   * [Safety Guard]
   * Since remove() is prohibited, there are no null gaps.
   * Compaction is a completely unnecessary operation.
   */
  override compact(): void {
    // No-op for DepSlotBuffer
  }
}
