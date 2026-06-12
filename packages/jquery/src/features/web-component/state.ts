/**
 * @module AEJComponentState
 *
 * Responsibility:
 * Manages the internal lifecycle state, reactive resources, and DOM observers
 * for individual Custom Element instances.
 *
 * Design Intent:
 * Encapsulates all transient state for a component instance into a single
 * object. This ensures that resource cleanup is atomic and deterministic,
 * preventing memory leaks even in complex "move" scenarios (DOM re-parenting).
 */

import type { Disposable } from '@but212/atom-effect';
import { SlotBuffer } from '@but212/atom-effect-utils';
import type { WritableAtom } from '@/types';

/**
 * Logic: Resource Consolidation
 * Centralizes all component-specific reactive state and resource tracking
 * into a single class instance to ensure atomic teardown and prevent memory leaks.
 * @internal
 */
export class ComponentState {
  /** The root node (host or shadowRoot) where bindings and styles are applied. */
  root: Node | null = null;

  /** Guards against double-initialization of the same host element. */
  isInitialized = false;

  /**
   * A buffer for all reactive effects, observers, and event listeners created during setup.
   * Disposed as a single unit in `dispose()`.
   */
  effects = new SlotBuffer<Disposable>();

  /** The root atom containing the full snapshot of attributes. */
  attributeAtom: WritableAtom<Record<string, string | null>> | null = null;
  /** Memoized lenses into `attributeAtom` to avoid redundant atom creation. */
  attributeLenses = new Map<string, WritableAtom<string | null>>();

  /** The root atom containing the current mapping of assigned nodes per slot. */
  slotsAtom: WritableAtom<Record<string, Node[]>> | null = null;
  /** Memoized lenses into `slotsAtom`. */
  slotLenses = new Map<string, WritableAtom<Node[]>>();
  /** Tracks whether the slot change listener has been attached to the resolved root. */
  slotListenerAttached = false;

  constructor(public host: HTMLElement) {}

  /**
   * Deterministically releases all reactive resources, observers, and event listeners.
   */
  dispose() {
    this.effects.forEach((e) => e.dispose());
    this.effects.dispose();

    // 2. Attribute Reset
    this.attributeAtom = null;
    this.attributeLenses.clear();

    // 3. Slot Reset
    this.slotsAtom = null;
    this.slotLenses.clear();
    this.slotListenerAttached = false;

    // 4. Root Reset
    this.root = null;
    this.isInitialized = false;
  }
}
