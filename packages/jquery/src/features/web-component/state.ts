import { Option, SlotBuffer } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { disableAutoCleanupFor } from '@/core/registry';
import { CLEANUP_MARKER, HYDRATION_MARKER } from '@/core/symbols';
import type { EffectObject, WritableAtom } from '@/types';

/** Resolves the active ShadowRoot for component-local operations. @internal */
export const resolveShadowRoot = (
  element: HTMLElement,
  root: Node | ShadowRoot | null | undefined
): Option<ShadowRoot> =>
  root instanceof ShadowRoot
    ? Option.some(root)
    : element.shadowRoot instanceof ShadowRoot
      ? Option.some(element.shadowRoot)
      : Option.none;

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
  root: Option<Node & { [CLEANUP_MARKER]?: boolean }> = Option.none;
  /** Initialization status to prevent redundant setups. */
  isInitialized = false;
  /** Collection of active effects managed by the component. */
  effects = new SlotBuffer<EffectObject>();
  /** Set of nodes that have been hydrated with data-bind mappings. */
  hydratedNodes = new Set<Element>();

  // Attributes Tracking
  /** Source atom containing the snapshot of all observed attributes. */
  attributeAtom: Option<WritableAtom<Record<string, string | null>>> = Option.none;
  /** Observer monitoring attribute changes on the host. */
  attributeObserver: Option<MutationObserver> = Option.none;
  /** Map of individual attribute names to their lens atoms. */
  attributeLenses = new Map<string, WritableAtom<string | null>>();

  // Slots Tracking
  /** Source atom containing the mapping of slot names to assigned nodes. */
  slotsAtom: Option<WritableAtom<Record<string, Node[]>>> = Option.none;
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
    if (Option.isSome(this.attributeObserver)) return;

    const getObserved = () =>
      (this.host.constructor as typeof HTMLElement & { observedAttributes?: string[] })
        .observedAttributes || [];

    const snapshot = () => {
      const observed = getObserved();
      if (observed.length > 0) {
        return Object.fromEntries(observed.map((n) => [n, this.host.getAttribute(n)]));
      }
      return Object.fromEntries(Array.from(this.host.attributes).map((a) => [a.name, a.value]));
    };

    const atom = $.atom(snapshot());
    this.attributeAtom = Option.some(atom);

    const observer = new MutationObserver(() => {
      atom.value = snapshot();
    });
    this.attributeObserver = Option.some(observer);

    const options: MutationObserverInit = { attributes: true };
    const observed = getObserved();
    if (observed.length > 0) options.attributeFilter = observed;

    observer.observe(this.host, options);
  }

  /**
   * Initializes reactive slot tracking.
   */
  ensureSlotTracking(root?: ShadowRoot | null) {
    const srOpt = resolveShadowRoot(this.host, root || Option.toNullable(this.root));

    const snapshot = (sr: ShadowRoot | null) => {
      const next: Record<string, Node[]> = {};
      if (sr) {
        sr.querySelectorAll('slot').forEach((s) => (next[s.name || ''] = s.assignedNodes()));
      }
      return next;
    };

    if (Option.isNone(this.slotsAtom)) {
      this.slotsAtom = Option.some($.atom(snapshot(Option.toNullable(srOpt))));
    }

    Option.match(srOpt, {
      some: (sr) => {
        if (this.slotListeners.has('all')) return;

        // Initial sync
        const atom = Option.expect(
          this.slotsAtom,
          'ComponentState: slotsAtom missing after initialization'
        );
        atom.value = snapshot(sr);

        const listener = (e: Event) => {
          const target = e.target as HTMLSlotElement;
          const current = { ...atom.peek() };
          current[target.name || ''] = target.assignedNodes();
          atom.value = current;
        };

        sr.addEventListener('slotchange', listener);
        this.slotListeners.set('all', listener);
      },
      none: () => {},
    });
  }

  /**
   * Deterministically releases all reactive resources and observers.
   */
  dispose() {
    this.effects.forEach((e) => e.dispose());
    this.effects.dispose();

    this.hydratedNodes.forEach(
      (n) => delete (n as Element & { [HYDRATION_MARKER]?: boolean })[HYDRATION_MARKER]
    );
    this.hydratedNodes.clear();

    Option.map(this.attributeObserver, (obs) => obs.disconnect());
    this.attributeObserver = Option.none;
    this.attributeAtom = Option.none;
    this.attributeLenses.clear();

    const srOpt = resolveShadowRoot(this.host, Option.toNullable(this.root));
    Option.map(srOpt, (sr) => {
      this.slotListeners.forEach((l) => sr.removeEventListener('slotchange', l));
    });

    this.slotListeners.clear();
    this.slotsAtom = Option.none;
    this.slotLenses.clear();

    Option.map(this.root, (root) => {
      if (
        this.appliedStyles.length > 0 &&
        (root instanceof ShadowRoot || root instanceof Document)
      ) {
        root.adoptedStyleSheets = root.adoptedStyleSheets.filter(
          (s) => !this.appliedStyles.includes(s)
        );
      }
      this.appliedStyles = [];

      if (root[CLEANUP_MARKER]) {
        disableAutoCleanupFor(root);
        root[CLEANUP_MARKER] = false;
      }
    });

    this.root = Option.none;
    this.isInitialized = false;
  }
}
