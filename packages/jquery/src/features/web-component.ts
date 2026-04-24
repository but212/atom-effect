import { BRAND, BrandFlags, isAtom, isWritable, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import {
  CLEANUP_MARKER,
  CONTEXT_REQUEST,
  type ContextRequestDetail,
  HYDRATION_MARKER,
} from '@/core/symbols';
import type {
  AtomComponentController,
  EffectObject,
  JQueryScopedSelector,
  ReactiveValue,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';
import { flattenToFormData } from '@/utils';
import { debug } from '@/utils/debug';

/**
 * Consolidated metadata for DOM nodes participating in the AEJ ecosystem.
 *
 * Logic: Internal State Management
 * Maintains reactive resources (providers, injections, and controllers)
 * associated with a specific node, tracked via a WeakMap to prevent leaks.
 *
 * @internal
 */
interface NodeInternalState {
  /** Map of keys to provided reactive values. */
  providers?: Map<string | symbol, unknown>;
  /** Map of keys to disposal effects for provided atoms (e.g., CSS Bridge). */
  providerEffects?: Map<string | symbol, EffectObject>;
  /** Map of keys to active injection proxy atoms. */
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  /** The reactive controller instance for Custom Elements. */
  controller?: AtomComponentController;
}

// ─── Internal State Storage ──────────────────────────────────────────────────

const nodeStateMap = new WeakMap<Node, NodeInternalState>();
const sheetCache = new Map<string, CSSStyleSheet>();
const MAX_SHEET_CACHE_SIZE = 100;

/** Retrieves or initializes the internal metadata state for a node. @internal */
const getInternalState = (node: Node): NodeInternalState => {
  let state = nodeStateMap.get(node);
  if (!state) {
    state = {};
    nodeStateMap.set(node, state);
  }
  return state;
};

// ─── Environment & Compatibility ───────────────────────────────────────────────

const supportsConstructableStylesheets =
  typeof window !== 'undefined' &&
  'adoptedStyleSheets' in Document.prototype &&
  'replaceSync' in CSSStyleSheet.prototype;

/**
 * Detection for Form-Associated Custom Elements (FACE) support.
 * @internal
 */
const supportsInternals =
  typeof window !== 'undefined' && 'attachInternals' in HTMLElement.prototype;

/**
 * Normalizes a style source into a shareable CSSStyleSheet.
 *
 * @internal
 */
const getOrCreateSheet = (source: string | CSSStyleSheet): CSSStyleSheet => {
  if (source instanceof CSSStyleSheet) return source;
  let sheet = sheetCache.get(source);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(source);

    // Limits the cache size to prevent memory leaks from dynamic CSS.
    if (sheetCache.size >= MAX_SHEET_CACHE_SIZE) {
      const firstKey = sheetCache.keys().next().value;
      if (firstKey !== undefined) sheetCache.delete(firstKey);
    }

    sheetCache.set(source, sheet);
  }
  return sheet;
};

/** Resolves the active ShadowRoot for component-local operations. @internal */
const resolveShadowRoot = (
  element: HTMLElement,
  root: Node | ShadowRoot | null | undefined
): ShadowRoot | null =>
  root instanceof ShadowRoot
    ? root
    : element.shadowRoot instanceof ShadowRoot
      ? element.shadowRoot
      : null;

// ─── Context Engine (Encapsulated Versioning) ───────────────────────────────

/**
 * Orchestrates global hierarchy versioning and DOM discovery.
 *
 * Logic: Reactive Hierarchy Tracking
 * Encapsulates a global MutationObserver that increments a version atom
 * whenever nodes are added or removed. This triggers re-discovery of
 * injected contexts to ensure they always point to the nearest provider.
 *
 * @internal
 */
const ContextEngine = (() => {
  const version = $.atom(0);
  let isBumpPending = false;
  let observer: MutationObserver | null = null;

  const bump = () => {
    if (isBumpPending) return;
    isBumpPending = true;
    queueMicrotask(() => {
      version.value++;
      isBumpPending = false;
    });
  };

  /** Lazily initializes the global mutation observer. */
  const ensureObserver = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.addedNodes.length > 0 || m.removedNodes.length > 0)) {
        bump();
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  return {
    get version() {
      ensureObserver();
      return version;
    },
    bump,
    discover(target: HTMLElement, key: string | symbol): unknown {
      ensureObserver();
      let found: unknown = null;
      const event = new CustomEvent<ContextRequestDetail>(CONTEXT_REQUEST, {
        detail: {
          key,
          callback: (atom) => {
            found = atom;
          },
        },
        bubbles: true,
        composed: true,
      });
      target.dispatchEvent(event);
      return found;
    },
  };
})();

// ─── Context Proxy Resolver ─────────────────────────────────────────────────

/**
 * Creates a reactive proxy atom for dependency injection.
 *
 * Logic: Hybrid Discovery
 * Implements a dual-resolution strategy:
 * 1. Synchronous: Immediate discovery when `.value` or `.peek()` is accessed.
 * 2. Reactive: Subscribes to the `ContextEngine.version` to re-resolve
 *    the value if the DOM hierarchy changes.
 *
 * @internal
 */
function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  const resolve = (isPeek: boolean) => {
    if (isPeek) ContextEngine.version.peek();
    else ContextEngine.version.value;
    return untracked(() => ContextEngine.discover(target, key)) as WritableAtom<T> | T | null;
  };

  const getLiveValue = (isPeek: boolean) => {
    const p = resolve(isPeek);
    return (isAtom(p) ? (isPeek ? p.peek() : p.value) : p) as T;
  };

  let sharedAtom: ReadonlyAtom<T> | null = null;
  const getShared = () => {
    if (!sharedAtom) sharedAtom = $.computed(() => getLiveValue(false));
    return sharedAtom;
  };

  return {
    get value() {
      return getLiveValue(false);
    },
    set value(v: T) {
      const p = resolve(true);
      if (isWritable(p)) p.value = v;
    },
    peek() {
      return getLiveValue(true);
    },
    subscribe: (fn) => getShared().subscribe(fn),
    subscriberCount: () => (sharedAtom ? sharedAtom.subscriberCount() : 0),
    dispose: () => {
      if (sharedAtom) {
        sharedAtom.dispose();
        sharedAtom = null;
      }
    },
    [BRAND]: BrandFlags.Atom | BrandFlags.Writable,
  } as WritableAtom<T>;
}

// ─── Reactive State Manager ─────────────────────────────────────────────────

/**
 * Centralizes all component-specific reactive state and resource tracking.
 *
 * Logic: Rule 5 - Data Dominates
 * Consolidates lifecycle resources (effects, observers, lenses) into a
 * single class instance to simplify teardown and state management.
 *
 * @internal
 */
class ComponentState {
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
   *
   * Logic: Single Source of Truth
   * A single MutationObserver updates a global attribute snapshot atom,
   * while individual attribute lenses provide fine-grained reactivity.
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
   *
   * Logic: Composite Monitoring
   * Combines initial scanning of the ShadowRoot with `slotchange`
   * listeners to maintain a reactive mapping of projected content.
   */
  ensureSlotTracking(root?: ShadowRoot | null) {
    const sr = resolveShadowRoot(this.host, root || this.root);

    if (!this.slotsAtom) {
      const initial: Record<string, Node[]> = {};
      if (sr) {
        sr.querySelectorAll('slot').forEach((s) => (initial[s.name || ''] = s.assignedNodes()));
      }
      this.slotsAtom = $.atom(initial);
    }

    if (!sr || this.slotListeners.has('all')) return;

    /** Logic: Initial Hydration Sync */
    const sync = () => {
      const next = { ...this.slotsAtom!.peek() };
      sr.querySelectorAll('slot').forEach((s) => (next[s.name || ''] = s.assignedNodes()));
      this.slotsAtom!.value = next;
    };
    sync();

    const listener = (e: Event) => {
      const target = e.target as HTMLSlotElement;
      this.slotsAtom!.value = {
        ...this.slotsAtom!.peek(),
        [target.name || '']: target.assignedNodes(),
      };
    };
    sr.addEventListener('slotchange', listener);
    this.slotListeners.set('all', listener);
  }

  /**
   * Deterministically releases all reactive resources and observers.
   *
   * Logic: Resource Reversal
   * Restores the node to its pre-hydrated state by removing hydration
   * markers and disconnecting observers in reverse order.
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

// ─── Controller Implementation ───────────────────────────────────────────────

/**
 * Composition-based helper for building reactive Custom Elements.
 *
 * When to use:
 * - Recommended for integrating reactive state management into standard
 *   Web Components.
 * - Suitable for mapping HTML attributes and slots to reactive atoms.
 *
 * Logic: Lifecycle Integration
 * Returns a controller that orchestrates the initialization and teardown
 * of component-specific reactive resources, synchronized with the
 * element's attachment to the DOM.
 *
 * @param element - The host HTMLElement (usually `this`).
 * @returns A controller instance for managing the component's reactivity.
 *
 * @example
 * ```typescript
 * class MyComp extends HTMLElement {
 *   private aej = $.useAtomComponent(this);
 *   private count = $.atom(0);
 *
 *   connectedCallback() {
 *     this.aej.setup({
 *       bind: { count: this.count }
 *     });
 *   }
 *
 *   disconnectedCallback() {
 *     this.aej.teardown();
 *   }
 * }
 * customElements.define('my-comp', MyComp);
 * ```
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = element.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const internal = getInternalState(element);
  if (internal.controller) return internal.controller;

  let internals: ElementInternals | undefined;
  if (supportsInternals) {
    try {
      internals = element.attachInternals();
    } catch {
      /* Ignored */
    }
  }

  const state = new ComponentState(element);

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return state.root;
    },

    get internals() {
      return internals;
    },

    get attrs() {
      state.ensureAttributeTracking();
      return (name: string) => {
        let lens = state.attributeLenses.get(name);
        if (!lens) {
          lens = $.atomLens(state.attributeAtom!, name);
          state.attributeLenses.set(name, lens);
        }
        return lens;
      };
    },

    get slots() {
      state.ensureSlotTracking();
      return (name: string) => {
        const key = name === 'default' ? '' : name;
        let lens = state.slotLenses.get(key);
        if (!lens) {
          lens = $.atomLens(state.slotsAtom!, key);
          state.slotLenses.set(key, lens);
        }
        return lens;
      };
    },

    $: ((selector, context) => {
      const ctx = context || state.root || element;
      if (typeof selector !== 'string') return $(selector) as unknown as JQuery;

      return ctx instanceof DocumentFragment
        ? ($(Array.from(ctx.querySelectorAll<HTMLElement>(selector))) as unknown as JQuery)
        : ($(selector, ctx as Element) as unknown as JQuery);
    }) as JQueryScopedSelector,

    provideAtom: (key: string | symbol, val: unknown) => provideAtom(element, key, val),
    injectAtom: <T = unknown>(key: string | symbol) => injectAtom<T>(element, key),

    setup(options: Parameters<AtomComponentController['setup']>[0]) {
      if (state.isInitialized) {
        const incoming = options instanceof Node ? options : options?.shadowRoot;
        if (incoming && incoming !== state.root) throw new Error('Call teardown() first.');
        return;
      }

      const config =
        options instanceof Node ? { shadowRoot: options as ShadowRoot } : options || {};
      const sr = config.shadowRoot || element.shadowRoot;

      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      state.root = (sr ?? element) as Node & { [CLEANUP_MARKER]?: boolean };
      if (!state.root![CLEANUP_MARKER]) {
        enableAutoCleanup(state.root as Element);
        state.root![CLEANUP_MARKER] = true;
      }

      state.ensureSlotTracking(sr);

      // Feature Activations
      if (config.dispatch) SetupHelpers.dispatch(element, config.dispatch, state.effects);
      if (config.bind) SetupHelpers.hydrate(state.root as Element, config.bind, state);
      if (
        config.styles &&
        supportsConstructableStylesheets &&
        (state.root instanceof ShadowRoot || state.root instanceof Document)
      ) {
        state.appliedStyles = SetupHelpers.styles(state.root, config.styles);
      }
      if (config.aria && internals) SetupHelpers.aria(internals, config.aria, state.effects);
      if (config.parts) SetupHelpers.parts(state.root as Element, config.parts, state.effects);
      if ((config.value || config.validation) && internals) {
        SetupHelpers.form(element, internals, config.value, config.validation, state.effects);
      }

      state.isInitialized = true;
    },

    teardown() {
      const s = getInternalState(element);
      s.providers?.clear();
      s.providerEffects?.forEach((e) => e.dispose());
      s.providerEffects?.clear();
      s.injects?.clear();

      ContextEngine.bump();
      state.dispose();
      registry.deferCleanup(element);
    },
  } as unknown as AtomComponentController;

  internal.controller = controller;
  return controller;
}

// ─── Setup Feature Helpers ──────────────────────────────────────────────────

/**
 * Collection of decomposed activation logic for setup components.
 *
 * Logic: Feature Specialization
 * Separates concerns for different reactive integrations (ARIA, Styles,
 * Form, Dispatch) to maintain maintainability.
 *
 * @internal
 */
const SetupHelpers = {
  /**
   * Orchestrates reactive CustomEvent dispatching.
   *
   * Logic: Event Bridge
   * Maps atom changes or functional getters to standard DOM events.
   */
  dispatch(
    el: HTMLElement,
    mappings: Record<string, ReactiveValue<unknown>>,
    effects: Set<EffectObject>
  ) {
    for (const [name, source] of Object.entries(mappings)) {
      effects.add(
        $.effect(() => {
          const val = isAtom(source)
            ? source.value
            : typeof source === 'function'
              ? (source as Function)()
              : source;
          const detail =
            typeof source === 'function' && typeof val === 'object' && val !== null
              ? val
              : { value: val };
          el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
          return undefined;
        })
      );
    }
  },

  /**
   * Applies constructable stylesheets to a ShadowRoot or Document.
   */
  styles(root: ShadowRoot | Document, styles: (string | CSSStyleSheet)[]) {
    const sheets = styles.map(getOrCreateSheet);
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets];
    return sheets;
  },

  /**
   * Bridges reactive atoms to the ElementInternals ARIA API.
   */
  aria(
    internals: ElementInternals,
    aria: Record<string, ReadonlyAtom<unknown>>,
    effects: Set<EffectObject>
  ) {
    for (const [prop, atom] of Object.entries(aria)) {
      effects.add(
        $.effect(() => {
          (internals as unknown as Record<string, string | null>)[prop] =
            atom.value == null ? null : String(atom.value);
          return undefined;
        })
      );
    }
  },

  /**
   * Hydrates the DOM subtree with reactive text bindings.
   *
   * Logic: Attribute-Driven Discovery
   * Scans for elements with `data-aej-bind` or `data-bind` and
   * establishes reactive effects for their textContent.
   */
  hydrate(root: Element, bindings: Record<string, ReadonlyAtom<unknown>>, state: ComponentState) {
    const BIND_ATTRS = ['data-aej-bind', 'data-bind'];
    const selector = BIND_ATTRS.map((a) => `[${a}]`).join(',');

    const apply = (node: Element) => {
      const target = node as Element & { [HYDRATION_MARKER]?: boolean };
      if (target[HYDRATION_MARKER]) return;
      for (const attr of BIND_ATTRS) {
        const key = node.getAttribute(attr);
        if (key && bindings[key]) {
          const atom = bindings[key];
          state.effects.add(
            $.effect(() => {
              const val = String(atom.value ?? '');
              if (node.textContent !== val) node.textContent = val;
              return undefined;
            })
          );
          target[HYDRATION_MARKER] = true;
          state.hydratedNodes.add(node);
          break;
        }
      }
    };

    this.observe(root, selector, apply, state.effects);
  },

  /**
   * Synchronizes reactive values with CSS Shadow Parts.
   */
  parts(root: Element, parts: Record<string, ReadonlyAtom<unknown>>, effects: Set<EffectObject>) {
    const apply = (node: Element) => {
      const key = node.getAttribute('data-aej-part');
      if (key && parts[key]) {
        const atom = parts[key];
        effects.add(
          $.effect(() => {
            const val = atom.value;
            /** Logic: CSS Part Token Normalization */
            const normalized =
              typeof val === 'string'
                ? val
                : Array.isArray(val)
                  ? val.join(' ')
                  : Object.entries((val as Record<string, boolean>) || {})
                      .filter((e) => !!e[1])
                      .map((e) => e[0])
                      .join(' ');
            if (node.getAttribute('part') !== normalized) node.setAttribute('part', normalized);
            return undefined;
          })
        );
      }
    };
    this.observe(root, '[data-aej-part]', apply, effects);
  },

  /**
   * Internal utility for maintaining reactive observers over a subtree.
   */
  observe(
    root: Element,
    selector: string,
    apply: (n: Element) => void,
    effects: Set<EffectObject>
  ) {
    $(root)
      .find(selector)
      .addBack(selector)
      .each((_, el) => apply(el));

    const obs = new MutationObserver((muts) =>
      muts.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches(selector)) apply(n);
            $(n)
              .find(selector)
              .each((_, el) => apply(el));
          }
        })
      )
    );
    obs.observe(root, { childList: true, subtree: true });
    effects.add($.effect(() => () => obs.disconnect()));
  },

  /**
   * Orchestrates form-associated behaviors (FACE).
   *
   * Logic: Form Control Integration
   * Bridges internal reactive state to the browser's form submission
   * data and Constraint Validation API.
   */
  form(
    el: HTMLElement,
    internals: ElementInternals,
    value:
      | ReadonlyAtom<unknown>
      | { val: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> }
      | undefined,
    validation:
      | ReadonlyAtom<ValidityStateFlags | string>
      | ((val: unknown) => ValidityStateFlags | string)
      | undefined,
    effects: Set<EffectObject>
  ) {
    const valAtom = !value ? null : isAtom(value) ? value : value.val;
    const stateAtom = !value || isAtom(value) ? null : value.state;

    effects.add(
      $.effect(() => {
        const v = valAtom?.value;
        const s = stateAtom?.value;

        // Security: Data Serialization
        // Uses flattenToFormData to recursively serialize complex objects
        // into standard form-data format.
        if (valAtom) {
          if (typeof v === 'object' && v !== null && !(v instanceof File) && !(v instanceof Blob)) {
            const fd = new FormData();
            flattenToFormData(fd, el.getAttribute('name') || '', v);
            internals.setFormValue(fd, s as string | FormData | null);
          } else {
            internals.setFormValue(v as string | null, s as string | FormData | null);
          }
        }

        // Logic: Validation Sync
        if (validation) {
          const res = isAtom(validation) ? validation.value : validation(v);
          if (typeof res === 'string') {
            internals.setValidity(res ? { customError: true } : {}, res, el);
          } else {
            internals.setValidity(res, undefined, el);
          }
        }
        return undefined;
      })
    );
  },
};

// ─── Context Management API ──────────────────────────────────────────────────

/**
 * Registers an element as a provider for a reactive context value.
 *
 * When to use:
 * - Recommended for sharing state (atoms) with deep descendants without
 *   explicit prop drilling.
 * - Suitable for establishing theme or configuration contexts at specific DOM roots.
 *
 * Logic: CSS Bridge
 * Automatically synchronizes provided values with CSS custom properties
 * (`--aej-[key]`) on the host element, allowing for reactive styling.
 *
 * @param element - The host element, selector, or collection acting as provider.
 * @param key - Unique identifier for the context (string or symbol).
 * @param val - The reactive atom or static value to share.
 *
 * @example
 * ```typescript
 * const theme = $.atom('light');
 * $.provideAtom('#app-root', 'theme', theme);
 * ```
 */
export function provideAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol,
  val: unknown
): void {
  const targets =
    element instanceof HTMLElement
      ? [element]
      : typeof element === 'string'
        ? Array.from(document.querySelectorAll<HTMLElement>(element))
        : ((element as JQuery).toArray() as HTMLElement[]);

  targets.forEach((el) => {
    const state = getInternalState(el);
    if (!state.providers) {
      state.providers = new Map();
      el.addEventListener(CONTEXT_REQUEST, (e: Event) => {
        const { key: reqKey, callback } = (e as CustomEvent<ContextRequestDetail>).detail;
        if (state.providers?.has(reqKey)) {
          e.stopPropagation();
          callback(state.providers.get(reqKey));
        }
      });
    }

    state.providers.set(key, val);

    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => el.style.setProperty(varName, v == null ? '' : String(v));
      if (isAtom(val)) {
        if (!state.providerEffects) state.providerEffects = new Map();
        state.providerEffects.get(key)?.dispose();
        state.providerEffects.set(
          key,
          $.effect(() => {
            sync(val.value);
            return undefined;
          })
        );
      } else sync(val);
    }
  });

  ContextEngine.bump();
}

/**
 * Injects a reactive context provided by an ancestor element.
 *
 * When to use:
 * - Recommended for consuming state from an ancestor without direct coupling.
 * - Suitable for creating context-aware components that adapt to their
 *   DOM hierarchy position.
 *
 * Logic: Hybrid Discovery
 * Returns a reactive proxy atom that automatically re-locates providers
 * if the element is moved within the DOM hierarchy.
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to locate.
 * @returns A reactive proxy atom representing the injected context.
 *
 * @example
 * ```typescript
 * const theme = $.injectAtom(this, 'theme');
 * $.effect(() => console.log('Current theme:', theme.value));
 * ```
 */
export function injectAtom<T = unknown>(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): WritableAtom<T> | null {
  const target =
    element instanceof HTMLElement
      ? element
      : typeof element === 'string'
        ? document.querySelector<HTMLElement>(element)
        : ((element as JQuery)[0] as HTMLElement);

  if (!target) return null;

  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = target.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const state = getInternalState(target);
  if (!state.injects) state.injects = new Map();

  let existing = state.injects.get(key);
  if (!existing) {
    existing = createContextProxy<T>(target, key);
    state.injects.set(key, existing);
  }
  return existing as WritableAtom<T>;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
