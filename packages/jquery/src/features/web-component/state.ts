import { Option, SlotBuffer } from '@but212/atom-effect-utils';
import { disableAutoCleanupFor } from '@/core/registry';
import { CLEANUP_MARKER, HYDRATION_MARKER } from '@/core/symbols';
import type { EffectObject, WritableAtom } from '@/types';
import { resolveShadowRoot } from './utils';

/**
 * Centralizes all component-specific reactive state and resource tracking.
 * Consolidates lifecycle resources into a single class instance to simplify teardown.
 * @internal
 */
export class ComponentState {
  /** The root node (host or shadowRoot) where bindings and styles are applied. */
  root: Option<Node & { [CLEANUP_MARKER]?: boolean }> = Option.none;

  /** Guards against double-initialization of the same host element. */
  isInitialized = false;

  /**
   * A buffer for all reactive effects created during setup.
   * Disposed as a single unit in `dispose()`.
   */
  effects = new SlotBuffer<EffectObject>();

  /** Set of nodes that have been processed by the hydration engine. */
  hydratedNodes = new Set<Element>();

  /** The root atom containing the full snapshot of attributes. */
  attributeAtom: WritableAtom<Record<string, string | null>> | null = null;
  /** The observer that keeps `attributeAtom` in sync with the DOM. */
  attributeObserver: MutationObserver | null = null;
  /** Memoized lenses into `attributeAtom` to avoid redundant atom creation. */
  attributeLenses = new Map<string, WritableAtom<string | null>>();

  /** The root atom containing the current mapping of assigned nodes per slot. */
  slotsAtom: WritableAtom<Record<string, Node[]>> | null = null;
  /** Memoized lenses into `slotsAtom`. */
  slotLenses = new Map<string, WritableAtom<Node[]>>();
  /** Tracks listeners to allow precise removal during teardown. */
  slotListeners = new Map<string, (e: Event) => void>();

  /** References to constructable stylesheets that must be removed from the root. */
  appliedStyles: CSSStyleSheet[] = [];

  constructor(public host: HTMLElement) {}

  /**
   * Deterministically releases all reactive resources and observers.
   *
   * Warning: Failure to call this on unmount will lead to memory leaks
   * as the MutationObservers and effects will remain active.
   */
  dispose() {
    // 1. Release all reactive effects
    this.effects.forEach((e) => e.dispose());
    this.effects.dispose();

    // 2. Clear hydration markers to allow re-hydration if moved back to DOM
    this.hydratedNodes.forEach((n) => {
      delete (n as Element & { [HYDRATION_MARKER]?: boolean })[HYDRATION_MARKER];
    });
    this.hydratedNodes.clear();

    // 3. Attribute Cleanup
    if (this.attributeObserver) {
      this.attributeObserver.disconnect();
      this.attributeObserver = null;
    }
    this.attributeAtom = null;
    this.attributeLenses.clear();

    // 4. Slot Cleanup (Remove listeners from ShadowRoot)
    const sr = resolveShadowRoot(this.host, Option.toNullable(this.root));
    if (sr) {
      this.slotListeners.forEach((l) => sr.removeEventListener('slotchange', l));
    }
    this.slotListeners.clear();
    this.slotsAtom = null;
    this.slotLenses.clear();

    // 5. Root Node Reset (Styles & Registry)
    const rootNode = Option.toNullable(this.root);
    if (rootNode) {
      // Reason: We must filter our styles out of adoptedStyleSheets rather than
      // resetting the array, as other libraries might have added their own sheets.
      if (
        this.appliedStyles.length > 0 &&
        (rootNode instanceof ShadowRoot || rootNode instanceof Document)
      ) {
        rootNode.adoptedStyleSheets = rootNode.adoptedStyleSheets.filter(
          (s) => !this.appliedStyles.includes(s)
        );
      }
      this.appliedStyles = [];

      const markerNode = rootNode as unknown as { [CLEANUP_MARKER]?: boolean };
      if (markerNode[CLEANUP_MARKER]) {
        disableAutoCleanupFor(rootNode as Element);
        markerNode[CLEANUP_MARKER] = false;
      }
    }

    this.root = Option.none;
    this.isInitialized = false;
  }
}
