import { SlotBuffer } from '@but212/atom-effect-utils';

// ── DepSlotBuffer ───────────────────────────────────────────────────────

import type { Dependency } from '@/types';
import type { DependencyLink } from './tracking';

/**
 * A specialized buffer optimized for dependency tracking and validation cycles.
 *
 * Logic: Extends SlotBuffer to provide O(1) node-to-index mappings via an internal
 * Map and supports "claiming" logic to reuse dependency links between re-evaluation cycles.
 */
export class DepSlotBuffer extends SlotBuffer<DependencyLink> {
  /** A lookup table for O(1) dependency resolution. Initialized lazily for large buffers. */
  private _map: Map<Dependency, number> | null = null;
  /** Threshold for transitioning from sequential scans to map-based resolution. */
  private readonly _SCAN_THRESHOLD = 32;

  /** Indicates whether the buffer contains any computed nodes. */
  hasComputeds = false;

  /** Prepares the buffer for a new tracking phase. */
  prepareTracking(): void {
    this.hasComputeds = false;
  }

  protected override _onItemRemoved(link: DependencyLink): void {
    link.unsub?.();
  }

  override setAt(index: number, item: DependencyLink | null): void {
    const old = this.at(index);
    super.setAt(index, item);

    if (old) this._map?.delete(old.node);
    if (item) this._map?.set(item.node, index);
  }

  /**
   * Attempts to locate and reuse a dependency link from a previous cycle.
   *
   * Logic: Performs a multi-stage search beginning with a direct hit check at the
   * expected `trackIndex`. Falls back to an internal Map lookup or sequential scan.
   *
   * @param dep - The dependency node to identify.
   * @param trackIndex - The predicted physical index for the dependency.
   * @returns true if the dependency was successfully found and reused.
   */
  claimExisting(dep: Dependency, trackIndex: number): boolean {
    const length = this._count;
    if (length <= trackIndex) return false;

    const current = this.at(trackIndex);

    // Logic: Fast-path for direct hits where the dependency remains at the same position.
    if (current && current.node === dep && current.unsub) {
      current.version = dep.version;
      return true;
    }

    if (this._map !== null || length - trackIndex > this._SCAN_THRESHOLD) {
      return this._claimViaMap(dep, trackIndex);
    }

    // Data-driven search: Iterate through remaining slots using the uniform at() accessor.
    for (let i = trackIndex + 1; i < length; i++) {
      const foundLink = this.at(i);
      if (foundLink && foundLink.node === dep && foundLink.unsub) {
        foundLink.version = dep.version;
        // Optimization: Performs a manual swap to minimize index validation overhead.
        this._rawWrite(trackIndex, foundLink);
        this._rawWrite(i, current);
        return true;
      }
    }

    return false;
  }

  private _claimViaMap(dep: Dependency, trackIndex: number): boolean {
    this._map ??= this._initMap();
    const map = this._map;
    const existingIndex = map.get(dep);
    if (existingIndex === undefined || existingIndex < trackIndex) return false;

    const link = this.at(existingIndex);
    if (link === null || !link.unsub) return false;

    link.version = dep.version;

    if (existingIndex !== trackIndex) {
      const occupant = this.at(trackIndex);
      this._rawSwap(existingIndex, trackIndex);

      map.set(dep, trackIndex);
      if (occupant?.unsub) map.set(occupant.node, existingIndex);
    }
    return true;
  }

  private _initMap(): Map<Dependency, number> {
    const map = new Map<Dependency, number>();
    if (this._s0?.unsub) map.set(this._s0.node, 0);
    if (this._s1?.unsub) map.set(this._s1.node, 1);
    if (this._s2?.unsub) map.set(this._s2.node, 2);
    if (this._s3?.unsub) map.set(this._s3.node, 3);

    const ov = this._overflow;
    if (ov !== null) {
      for (let i = 0, len = ov.length; i < len; i++) {
        const link = ov[i];
        if (link?.unsub) map.set(link.node, i + 4);
      }
    }
    return map;
  }

  /**
   * Inserts a new dependency link at the specified tracking index.
   *
   * Logic: If the slot is occupied, the previous occupant is shifted to a new slot.
   * This maintains the insertion order required for consistent validation cycles.
   */
  insertNew(trackIdx: number, link: DependencyLink): void {
    const occupant = this.at(trackIdx);
    this._rawWrite(trackIdx, link);

    if (occupant !== null) {
      const newIdx = this._rawAdd(occupant);
      if (newIdx >= this._count) this._count = newIdx + 1;
      if (this._map && occupant.unsub) this._map.set(occupant.node, newIdx);
    }

    if (trackIdx >= this._count) this._count = trackIdx + 1;
    this._actualCount++;

    if (this._map && link.unsub) this._map.set(link.node, trackIdx);
  }

  override push(item: DependencyLink): number {
    const idx = super.push(item);
    if (this._map && item.unsub) this._map.set(item.node, idx);
    return idx;
  }

  /**
   * Removal is prohibited for DepSlotBuffer to maintain graph integrity during validation.
   * Use truncateFrom(0) or disposeAll() for cleanup.
   *
   * @throws {Error} Always.
   */
  override remove(_item: DependencyLink): boolean {
    throw new Error('remove() prohibited');
  }

  /** Compaction is a no-op for DepSlotBuffer. */
  override compact(): void {}

  override truncateFrom(index: number): void {
    super.truncateFrom(index);
    if (this._map !== null) {
      this._map = null;
    }
  }

  /** Truncates the buffer and resets computed state indicators. */
  disposeAll(): void {
    this.truncateFrom(0);
    this.hasComputeds = false;
  }
}
