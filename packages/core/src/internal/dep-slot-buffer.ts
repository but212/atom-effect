import { BITPACK } from '@/constants';
import type { DependencyLink } from '@/core/dep-tracking';
import type { Dependency } from '@/types';
import { SlotBuffer } from './slot-buffer';

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
   * Resets tracking metadata for a new evaluation pass.
   * Ensures 'hasComputeds' is clean.
   */
  prepareTracking(): void {
    this.hasComputeds = false;
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
    const count = this._count;
    if (trackIndex >= count) return false;

    // 1. Hybrid O(1) Map Fallback for Mega-Nodes
    const remaining = count - trackIndex;
    if (this._map !== null || remaining > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

    // 2. Unrolled Fast Path for Inline Slots (0..3)
    // Avoids overhead of getAt/setAt by using switch-fallthrough and direct access.
    if (trackIndex < 4) {
      switch (trackIndex) {
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 0: {
          const l = this._s0;
          if (l && l.node === dep && l.unsub) {
            l.version = dep.version;
            return true;
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 1: {
          if (count > 1) {
            const l = this._s1;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 1) {
                // we know trackIndex is 0 here
                this._s1 = this._s0;
                this._s0 = l;
              }
              return true;
            }
          }
        }
        // biome-ignore lint/suspicious/noFallthroughSwitchClause: intentional fallthrough for sequential search
        case 2: {
          if (count > 2) {
            const l = this._s2;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 2) {
                // swap with trackIndex (0 or 1)
                const occ = trackIndex === 0 ? this._s0 : this._s1;
                if (trackIndex === 0) this._s0 = l;
                else this._s1 = l;
                this._s2 = occ;
              }
              return true;
            }
          }
        }
        case 3: {
          if (count > 3) {
            const l = this._s3;
            if (l && l.node === dep && l.unsub) {
              l.version = dep.version;
              if (trackIndex !== 3) {
                // swap with trackIndex (0, 1, or 2)
                let occ: DependencyLink | null;
                if (trackIndex === 0) {
                  occ = this._s0;
                  this._s0 = l;
                } else if (trackIndex === 1) {
                  occ = this._s1;
                  this._s1 = l;
                } else {
                  occ = this._s2;
                  this._s2 = l;
                }
                this._s3 = occ;
              }
              return true;
            }
          }
        }
      }
    }

    // 3. Sequential Scan for Overflow
    const start = trackIndex > 4 ? trackIndex : 4;
    const ov = this._overflow;
    if (ov) {
      for (let i = start - 4, len = ov.length; i < len; i++) {
        const link = ov[i];
        if (link && link.node === dep && link.unsub) {
          link.version = dep.version;
          this._swapGeneral(i + 4, trackIndex, link);
          return true;
        }
      }
    }

    return false;
  }

  private _claimViaMap(dep: Dependency, trackIndex: number): boolean {
    if (this._map === null) {
      this._map = new Map();
      const count = this._count;
      // Partitioned scan to avoid getAt() dispatch in loop
      if (trackIndex < 4) {
        if (trackIndex <= 0 && this._s0?.unsub) this._map.set(this._s0.node, 0);
        if (trackIndex <= 1 && this._s1?.unsub) this._map.set(this._s1.node, 1);
        if (trackIndex <= 2 && this._s2?.unsub) this._map.set(this._s2.node, 2);
        if (trackIndex <= 3 && this._s3?.unsub) this._map.set(this._s3.node, 3);
      }
      const ov = this._overflow;
      if (ov && count > 4) {
        const start = trackIndex > 4 ? trackIndex : 4;
        for (let i = start - 4, len = ov.length; i < len; i++) {
          const link = ov[i];
          if (link?.unsub) this._map.set(link.node, i + 4);
        }
      }
    }

    const existingIndex = this._map.get(dep);
    if (existingIndex === undefined || existingIndex < trackIndex) return false;

    const link = this.getAt(existingIndex);
    if (link == null || !link.unsub) return false;

    link.version = dep.version;
    if (existingIndex !== trackIndex) {
      // Inlined swap to avoid dispatch overhead
      const occupant = this.getAt(trackIndex);
      this.setAt(trackIndex, link);
      this.setAt(existingIndex, occupant);
      if (occupant?.unsub) this._map.set(occupant.node, existingIndex);
      this._map.set(dep, trackIndex);
    }
    return true;
  }

  private _swapGeneral(idx: number, trackIndex: number, link: DependencyLink): void {
    if (idx === trackIndex) return;

    // Use direct access for the likely case where idx is in overflow
    const occupant = this.getAt(trackIndex);
    this.setAt(trackIndex, link);

    if (idx === 0) this._s0 = occupant;
    else if (idx === 1) this._s1 = occupant;
    else if (idx === 2) this._s2 = occupant;
    else if (idx === 3) this._s3 = occupant;
    else {
      const ov = this._overflow!;
      ov[idx - 4] = occupant;
    }
  }

  /**
   * Inserts a new link at `trackIndex`, relocating the current occupant
   * to the end of the buffer so it can be cleanly unsubscribed later by `truncateFrom`.
   */
  insertNew(trackIndex: number, link: DependencyLink): void {
    const count = this._count;
    if (trackIndex < count) {
      const occupant = this.getAt(trackIndex);
      if (occupant != null) {
        // Direct overflow append avoids inline gap-scan overhead in add()
        // since we know all inline slots are occupied when trackIndex < count.
        this._addToOverflow(occupant);
        if (this._map !== null && occupant.unsub) {
          this._map.set(occupant.node, this._count - 1);
        }
      }
    }

    if (trackIndex === 0) this._s0 = link;
    else if (trackIndex === 1) this._s1 = link;
    else if (trackIndex === 2) this._s2 = link;
    else if (trackIndex === 3) this._s3 = link;
    else {
      let ov = this._overflow;
      if (!ov) {
        ov = [];
        this._overflow = ov;
      }
      ov[trackIndex - 4] = link;
    }

    if (trackIndex >= count) {
      this._count = trackIndex + 1;
    }
  }

  /**
   * Discards all links from the given index onwards.
   * Unsubscribes each link before removing it.
   */
  truncateFrom(index: number): void {
    if (index >= this._count) return;

    super.truncateFrom(index);

    if (this._map !== null) {
      this._map.clear();
      this._map = null;
    }
  }

  /**
   * Seals the buffer after a tracking pass completes.
   * Computes the additive snapshot hash of all dependency versions.
   *
   * Uses link.version (snapshot at tracking time) — NOT node.version.
   */
  seal(): void {
    const count = this._count;
    if (count === 0) {
      this._depsHash = 0;
      return;
    }

    const vbits = BITPACK.VERSION_BITS;
    let hash = 0;

    // Inline slots (unrolled)
    if (count >= 1) {
      const l = this._s0!;
      hash = (hash + (l.version << vbits) + l.node.id) | 0;
    }
    if (count >= 2) {
      const l = this._s1!;
      hash = (hash + (l.version << vbits) + l.node.id) | 0;
    }
    if (count >= 3) {
      const l = this._s2!;
      hash = (hash + (l.version << vbits) + l.node.id) | 0;
    }
    if (count >= 4) {
      const l = this._s3!;
      hash = (hash + (l.version << vbits) + l.node.id) | 0;
    }

    // Overflow
    if (count > 4) {
      const ov = this._overflow!;
      for (let i = 0, len = ov.length; i < len; i++) {
        const l = ov[i]!;
        hash = (hash + (l.version << vbits) + l.node.id) | 0;
      }
    }

    this._depsHash = hash;
  }

  /**
   * Efficient O(N) fast-path dirty check using the sealed version hash.
   *
   * Uses node.version (current live version) to detect drift from
   * the sealed snapshot.
   */
  isDirtyFast(): boolean {
    const count = this._count;
    if (count === 0) return false;

    const vbits = BITPACK.VERSION_BITS;
    let hash = 0;

    // Inline slots (unrolled)
    if (count >= 1) {
      const n = this._s0!.node;
      hash = (hash + (n.version << vbits) + n.id) | 0;
    }
    if (count >= 2) {
      const n = this._s1!.node;
      hash = (hash + (n.version << vbits) + n.id) | 0;
    }
    if (count >= 3) {
      const n = this._s2!.node;
      hash = (hash + (n.version << vbits) + n.id) | 0;
    }
    if (count >= 4) {
      const n = this._s3!.node;
      hash = (hash + (n.version << vbits) + n.id) | 0;
    }

    // Overflow
    if (count > 4) {
      const ov = this._overflow!;
      for (let i = 0, len = ov.length; i < len; i++) {
        const n = ov[i]!.node;
        hash = (hash + (n.version << vbits) + n.id) | 0;
      }
    }

    return hash !== this._depsHash;
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
