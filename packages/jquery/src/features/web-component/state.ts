import $ from 'jquery';
import { disableAutoCleanupFor } from '@/core/registry';
import { CLEANUP_MARKER, HYDRATION_MARKER } from '@/core/symbols';
import type { EffectObject, WritableAtom } from '@/types';

/** Resolves the active ShadowRoot for component-local operations. @internal */
export const resolveShadowRoot = (
  element: HTMLElement,
  root: Node | ShadowRoot | null | undefined
): ShadowRoot | null =>
  root instanceof ShadowRoot
    ? root
    : element.shadowRoot instanceof ShadowRoot
      ? element.shadowRoot
      : null;

/**
 * Centralizes all component-specific reactive state and resource tracking.
 *
 * Logic: Data Dominates
 * Consolidates lifecycle resources (effects, observers, lenses) into a
 * single class instance to simplify teardown and state management.
 *
 * @internal
 */
export class ComponentState {
  /** The root node (host or shadowRoot) managed by this state. */
  root: (Node & { [CLEANUP_MARKER]?: boolean }) | null = null;
  /** Initialization status to prevent redundant setups. */
  isInitialized = false;
  /** Collection of active effects managed by the component. */
  effects = new Set<EffectObject>();
  /** Set of nodes that have been hydrated with data-bind mappings. */
  hydratedNodes = new Set<Element>();

  // Attributes Tracking
  /** Source atom containing the snapshot of all observed attributes. */
  attributeAtom: WritableAtom<Record<string, string | null>> | null = null;
  /** Observer monitoring attribute changes on the host. */
  attributeObserver: MutationObserver | null = null;
  /** Map of individual attribute names to their lens atoms. */
  attributeLenses = new Map<string, WritableAtom<string | null>>();

  // Slots Tracking
  /** Source atom containing the mapping of slot names to assigned nodes. */
  slotsAtom: WritableAtom<Record<string, Node[]>> | null = null;
  /** Map of individual slot names to their lens atoms. */
  slotLenses = new Map<string, WritableAtom<Node[]>>();
  /** Internal listeners for slotchange events. */
  slotListeners = new Map<string, (e: Event) => void>();

  /** List of constructable stylesheets applied to the root. */
  appliedStyles: CSSStyleSheet[] = [];

  constructor(public host: HTMLElement) {}

  /**
   * Initializes attribute tracking if not already active.
   */
  ensureAttributeTracking() {
    if (this.attributeObserver) return;

    const getObserved = () =>
      (this.host.constructor as typeof HTMLElement & { observedAttributes?: string[] })
        .observedAttributes || [];

    const snapshot = () => {
      const observed = getObserved();
      const attrs: Record<string, string | null> = {};
      if (observed.length > 0) {
        observed.forEach((n) => (attrs[n] = this.host.getAttribute(n)));
      } else {
        for (const a of this.host.attributes) attrs[a.name] = a.value;
      }
      return attrs;
    };

    this.attributeAtom = $.atom(snapshot());
    this.attributeObserver = new MutationObserver(() => {
      this.attributeAtom!.value = snapshot();
    });

    const options: MutationObserverInit = { attributes: true };
    const observed = getObserved();
    if (observed.length > 0) options.attributeFilter = observed;

    this.attributeObserver.observe(this.host, options);
  }

  /**
   * Initializes reactive slot tracking.
   */
  ensureSlotTracking(root?: ShadowRoot | null) {
    const sr = resolveShadowRoot(this.host, root || this.root);

    const snapshot = () => {
      const next: Record<string, Node[]> = {};
      if (sr) {
        sr.querySelectorAll('slot').forEach((s) => (next[s.name || ''] = s.assignedNodes()));
      }
      return next;
    };

    if (!this.slotsAtom) {
      this.slotsAtom = $.atom(snapshot());
    }

    if (!sr || this.slotListeners.has('all')) return;

    // Initial sync
    this.slotsAtom.value = snapshot();

    const listener = (e: Event) => {
      const target = e.target as HTMLSlotElement;
      const current = { ...this.slotsAtom!.peek() };
      current[target.name || ''] = target.assignedNodes();
      this.slotsAtom!.value = current;
    };

    sr.addEventListener('slotchange', listener);
    this.slotListeners.set('all', listener);
  }

  /**
   * Deterministically releases all reactive resources and observers.
   */
  dispose() {
    this.effects.forEach((e) => e.dispose());
    this.effects.clear();

    this.hydratedNodes.forEach(
      (n) => delete (n as Element & { [HYDRATION_MARKER]?: boolean })[HYDRATION_MARKER]
    );
    this.hydratedNodes.clear();

    this.attributeObserver?.disconnect();
    this.attributeObserver = null;
    this.attributeAtom = null;
    this.attributeLenses.clear();

    const sr = resolveShadowRoot(this.host, this.root);
    if (sr) {
      this.slotListeners.forEach((l) => sr.removeEventListener('slotchange', l));
    }
    this.slotListeners.clear();
    this.slotsAtom = null;
    this.slotLenses.clear();

    if (
      this.appliedStyles.length > 0 &&
      (this.root instanceof ShadowRoot || this.root instanceof Document)
    ) {
      this.root.adoptedStyleSheets = this.root.adoptedStyleSheets.filter(
        (s) => !this.appliedStyles.includes(s)
      );
    }
    this.appliedStyles = [];

    try {
      if (this.root?.[CLEANUP_MARKER]) {
        disableAutoCleanupFor(this.root);
        this.root[CLEANUP_MARKER] = false;
      }
    } finally {
      this.root = null;
      this.isInitialized = false;
    }
  }
}
