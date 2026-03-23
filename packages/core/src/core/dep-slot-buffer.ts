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
   * Indicates if the buffer contains at least one computed dependency.
   */
  hasComputeds = false;

  /**
   * Cached dependency version snapshot hash.
   */
  _depsHash = 0;

  constructor() {
    super();
    // Initialize state-related fields explicitly for a stable V8 hidden class shape.
    this._map = null;
    this.hasComputeds = false;
    this._depsHash = 0;
  }

  /**
   * Protected hook called whenever a link is extracted from the buffer.
   * Handles automatic unsubscription without closure allocation.
   */
  protected override _onItemRemoved(link: DependencyLink): void {
    const unsub = link.unsub;
    if (unsub) unsub();
  }

  /**
   * Looks for an existing subscription to the given node starting from `trackIndex`.
   * If found, swaps it to `trackIndex`, updates version, and returns true.
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
    const count = this._count;
    if (trackIndex < count) {
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
    super.truncateFrom(index);
    if (this._map !== null && index <= this._count) {
      // Typically called at the end of tracking.
      // Safest to clear the map here to avoid holding stale memory.
      this._map.clear();
      this._map = null;
    }
  }

  /**
   * Seals the buffer after a tracking pass completes.
   * Computes the XOR snapshot hash of all dependency versions.
   */
  seal(): void {
    let hash = 0;
    const count = this._count;

    // Unroll hot slots access to minimize pointer chasing
    if (count > 0) {
      const l0 = this._s0;
      if (l0) hash = (hash + (l0.version << 16) + l0.node.id) | 0;
      if (count > 1) {
        const l1 = this._s1;
        if (l1) hash = (hash + (l1.version << 16) + l1.node.id) | 0;
        if (count > 2) {
          const l2 = this._s2;
          if (l2) hash = (hash + (l2.version << 16) + l2.node.id) | 0;
          if (count > 3) {
            const l3 = this._s3;
            if (l3) hash = (hash + (l3.version << 16) + l3.node.id) | 0;

            // Overflow path (rare)
            const ov = this._overflow;
            if (ov) {
              for (let i = 0, len = ov.length; i < len; i++) {
                const link = ov[i];
                if (link) hash = (hash + (link.version << 16) + link.node.id) | 0;
              }
            }
          }
        }
      }
    }
    this._depsHash = hash;
  }

  /**
   * O(1) fast-path dirty check using the sealed version hash.
   */
  isDirtyFast(): boolean {
    let hash = 0;
    const count = this._count;

    // Unroll hot slots access
    if (count > 0) {
      const l0 = this._s0;
      if (l0) hash = (hash + (l0.node.version << 16) + l0.node.id) | 0;
      if (count > 1) {
        const l1 = this._s1;
        if (l1) hash = (hash + (l1.node.version << 16) + l1.node.id) | 0;
        if (count > 2) {
          const l2 = this._s2;
          if (l2) hash = (hash + (l2.node.version << 16) + l2.node.id) | 0;
          if (count > 3) {
            const l3 = this._s3;
            if (l3) hash = (hash + (l3.node.version << 16) + l3.node.id) | 0;

            const ov = this._overflow;
            if (ov) {
              for (let i = 0, len = ov.length; i < len; i++) {
                const link = ov[i];
                if (link) hash = (hash + (link.node.version << 16) + link.node.id) | 0;
              }
            }
          }
        }
      }
    }
    return hash !== this._depsHash;
  }

  /**
   * Captures a DJB2-based version snapshot for async drift detection.
   */
  captureVersionSnapshot(): number {
    let hash = 0;
    const count = this._count;

    if (count > 0) {
      const l0 = this._s0;
      if (l0) hash = ((hash << 5) - hash + l0.node.version) | 0;
      if (count > 1) {
        const l1 = this._s1;
        if (l1) hash = ((hash << 5) - hash + l1.node.version) | 0;
        if (count > 2) {
          const l2 = this._s2;
          if (l2) hash = ((hash << 5) - hash + l2.node.version) | 0;
          if (count > 3) {
            const l3 = this._s3;
            if (l3) hash = ((hash << 5) - hash + l3.node.version) | 0;

            const ov = this._overflow;
            if (ov) {
              for (let i = 0, len = ov.length; i < len; i++) {
                const link = ov[i];
                if (link) hash = ((hash << 5) - hash + link.node.version) | 0;
              }
            }
          }
        }
      }
    }
    return hash;
  }

  /** Unsubscribes from all links and resets the buffer. */
  disposeAll(): void {
    if (this._count > 0) {
      this.truncateFrom(0);
    }
    this.hasComputeds = false;
    if (this._map !== null) {
      this._map.clear();
      this._map = null;
    }
  }

  /**
   * [Safety Guard]
   * remove() is strictly prohibited in DepSlotBuffer to preserve sequential cache paths.
   */
  override remove(_item: DependencyLink): boolean {
    throw new Error(
      'remove() is strictly prohibited in DepSlotBuffer to preserve sequential cache paths.'
    );
  }

  /**
   * [Safety Guard]
   * Compaction is unnecessary since remove() is prohibited.
   */
  override compact(): void {
    // No-op for DepSlotBuffer
  }
}
