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
    // Minimizes GetAt/SetAt overhead by accessing properties directly.
    if (trackIndex < 4) {
      // Slot 0
      if (trackIndex <= 0) {
        const l = this._s0;
        if (l && l.node === dep && l.unsub) {
          l.version = dep.version;
          return true;
        }
      }
      // Slot 1
      if (trackIndex <= 1 && count > 1) {
        const l = this._s1;
        if (l && l.node === dep && l.unsub) {
          l.version = dep.version;
          if (trackIndex !== 1) {
            const occ = this._s0;
            this._s1 = occ;
            this._s0 = l;
          }
          return true;
        }
      }
      // Slot 2
      if (trackIndex <= 2 && count > 2) {
        const l = this._s2;
        if (l && l.node === dep && l.unsub) {
          l.version = dep.version;
          if (trackIndex !== 2) {
            this._swapInline(2, trackIndex, l);
          }
          return true;
        }
      }
      // Slot 3
      if (trackIndex <= 3 && count > 3) {
        const l = this._s3;
        if (l && l.node === dep && l.unsub) {
          l.version = dep.version;
          if (trackIndex !== 3) {
            this._swapInline(3, trackIndex, l);
          }
          return true;
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
      for (let i = trackIndex; i < count; i++) {
        const link = this.getAt(i);
        if (link?.unsub) this._map.set(link.node, i);
      }
    }

    const existingIndex = this._map.get(dep);
    if (existingIndex === undefined || existingIndex < trackIndex) return false;

    const link = this.getAt(existingIndex);
    if (link == null || !link.unsub) return false;

    link.version = dep.version;
    if (existingIndex !== trackIndex) {
      const occupant = this.getAt(trackIndex);
      this.setAt(trackIndex, link);
      this.setAt(existingIndex, occupant);
      if (occupant?.unsub) this._map.set(occupant.node, existingIndex);
      this._map.set(dep, trackIndex);
    }
    return true;
  }

  private _swapInline(idx: number, trackIndex: number, link: DependencyLink): void {
    const occupant = this.getAt(trackIndex);
    this.setAt(trackIndex, link);
    this.setAt(idx, occupant);
  }

  private _swapGeneral(idx: number, trackIndex: number, link: DependencyLink): void {
    if (idx === trackIndex) return;
    const occupant = this.getAt(trackIndex);
    this.setAt(trackIndex, link);
    this.setAt(idx, occupant);
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
        this.add(occupant);
        if (this._map !== null && occupant.unsub) {
          this._map.set(occupant.node, this._count - 1);
        }
      }
    }

    if (trackIndex === 0) this._s0 = link;
    else if (trackIndex === 1) this._s1 = link;
    else if (trackIndex === 2) this._s2 = link;
    else if (trackIndex === 3) this._s3 = link;
    else this.setAt(trackIndex, link);

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
   */
  seal(): void {
    const count = this._count;
    const vbits = BITPACK.VERSION_BITS;
    let hash = 0;

    switch (count) {
      case 0:
        this._depsHash = 0;
        return;
      case 1: {
        const l0 = this._s0!;
        hash = (hash + (l0.version << vbits) + l0.node.id) | 0;
        break;
      }
      case 2: {
        const l0 = this._s0!;
        const l1 = this._s1!;
        hash = (hash + (l0.version << vbits) + l0.node.id) | 0;
        hash = (hash + (l1.version << vbits) + l1.node.id) | 0;
        break;
      }
      case 3: {
        const l0 = this._s0!;
        const l1 = this._s1!;
        const l2 = this._s2!;
        hash = (hash + (l0.version << vbits) + l0.node.id) | 0;
        hash = (hash + (l1.version << vbits) + l1.node.id) | 0;
        hash = (hash + (l2.version << vbits) + l2.node.id) | 0;
        break;
      }
      case 4: {
        const l0 = this._s0!;
        const l1 = this._s1!;
        const l2 = this._s2!;
        const l3 = this._s3!;
        hash = (hash + (l0.version << vbits) + l0.node.id) | 0;
        hash = (hash + (l1.version << vbits) + l1.node.id) | 0;
        hash = (hash + (l2.version << vbits) + l2.node.id) | 0;
        hash = (hash + (l3.version << vbits) + l3.node.id) | 0;
        break;
      }
      default: {
        const l0 = this._s0!;
        const l1 = this._s1!;
        const l2 = this._s2!;
        const l3 = this._s3!;
        hash = (hash + (l0.version << vbits) + l0.node.id) | 0;
        hash = (hash + (l1.version << vbits) + l1.node.id) | 0;
        hash = (hash + (l2.version << vbits) + l2.node.id) | 0;
        hash = (hash + (l3.version << vbits) + l3.node.id) | 0;

        const ov = this._overflow!;
        for (let i = 0, len = ov.length; i < len; i++) {
          const l = ov[i]!;
          hash = (hash + (l.version << vbits) + l.node.id) | 0;
        }
      }
    }
    this._depsHash = hash;
  }

  /**
   * Efficient O(N) fast-path dirty check using the sealed version hash.
   */
  isDirtyFast(): boolean {
    const count = this._count;
    const vbits = BITPACK.VERSION_BITS;
    let hash = 0;

    switch (count) {
      case 0:
        return false;
      case 1: {
        const n = this._s0!.node;
        hash = (hash + (n.version << vbits) + n.id) | 0;
        break;
      }
      case 2: {
        const n0 = this._s0!.node;
        const n1 = this._s1!.node;
        hash = (hash + (n0.version << vbits) + n0.id) | 0;
        hash = (hash + (n1.version << vbits) + n1.id) | 0;
        break;
      }
      case 3: {
        const n0 = this._s0!.node;
        const n1 = this._s1!.node;
        const n2 = this._s2!.node;
        hash = (hash + (n0.version << vbits) + n0.id) | 0;
        hash = (hash + (n1.version << vbits) + n1.id) | 0;
        hash = (hash + (n2.version << vbits) + n2.id) | 0;
        break;
      }
      case 4: {
        const n0 = this._s0!.node;
        const n1 = this._s1!.node;
        const n2 = this._s2!.node;
        const n3 = this._s3!.node;
        hash = (hash + (n0.version << vbits) + n0.id) | 0;
        hash = (hash + (n1.version << vbits) + n1.id) | 0;
        hash = (hash + (n2.version << vbits) + n2.id) | 0;
        hash = (hash + (n3.version << vbits) + n3.id) | 0;
        break;
      }
      default: {
        const n0 = this._s0!.node;
        const n1 = this._s1!.node;
        const n2 = this._s2!.node;
        const n3 = this._s3!.node;
        hash = (hash + (n0.version << vbits) + n0.id) | 0;
        hash = (hash + (n1.version << vbits) + n1.id) | 0;
        hash = (hash + (n2.version << vbits) + n2.id) | 0;
        hash = (hash + (n3.version << vbits) + n3.id) | 0;

        const ov = this._overflow!;
        for (let i = 0, len = ov.length; i < len; i++) {
          const n = ov[i]!.node;
          hash = (hash + (n.version << vbits) + n.id) | 0;
        }
      }
    }
    return hash !== this._depsHash;
  }

  /**
   * Captures a DJB2-based version snapshot for async drift detection.
   */
  captureVersionSnapshot(): number {
    const count = this._count;
    let hash = 0;

    switch (count) {
      case 0:
        return 0;
      case 1: {
        hash = ((hash << 5) - hash + this._s0!.node.version) | 0;
        break;
      }
      case 2: {
        hash = ((hash << 5) - hash + this._s0!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s1!.node.version) | 0;
        break;
      }
      case 3: {
        hash = ((hash << 5) - hash + this._s0!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s1!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s2!.node.version) | 0;
        break;
      }
      case 4: {
        hash = ((hash << 5) - hash + this._s0!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s1!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s2!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s3!.node.version) | 0;
        break;
      }
      default: {
        hash = ((hash << 5) - hash + this._s0!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s1!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s2!.node.version) | 0;
        hash = ((hash << 5) - hash + this._s3!.node.version) | 0;

        const ov = this._overflow!;
        for (let i = 0, len = ov.length; i < len; i++) {
          hash = ((hash << 5) - hash + ov[i]!.node.version) | 0;
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
