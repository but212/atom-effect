import { BRAND, BrandFlags, isAtom, isWritable, untracked } from '@but212/atom-effect';
import { Option } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import { enableAutoCleanup, registry } from '@/core/registry';
import { CLEANUP_MARKER, CONTEXT_REQUEST, type ContextRequestDetail } from '@/core/symbols';
import type {
  AtomComponentController,
  AtomComponentStatic,
  EffectObject,
  JQueryScopedSelector,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';
import { debug } from '@/utils/debug';
import { SetupFeatures } from './setup';
import { ComponentState } from './state';
import { resolveShadowRoot } from './utils';

/**
 * Diagnostic access for internal engine state.
 * Exposed on `window.__AEJ_INTERNAL__` in debug mode.
 * @internal
 */
interface DebugPortal {
  nodeStateMap: WeakMap<Node, NodeInternalState>;
  sheetCache: Map<string, CSSStyleSheet>;
  version: string;
}

/**
 * Metadata container for AEJ-managed nodes.
 * Using a WeakMap ensures metadata is GC'd when the Node is removed from memory.
 * @internal
 */
interface NodeInternalState {
  providers?: Map<string | symbol, unknown>;
  providerEffects?: Map<string | symbol, EffectObject>;
  injects?: Map<string | symbol, WritableAtom<unknown>>;
  controller?: AtomComponentController;
}

// ─── Internal State Storage ──────────────────────────────────────────────────

const nodeStateMap = new WeakMap<Node, NodeInternalState>();
const sheetCache = new Map<string, CSSStyleSheet>();
const MAX_SHEET_CACHE_SIZE = 100;

// ─── Debug Portal ──────────────────────────────────────────────────

if (debug.enabled && typeof window !== 'undefined') {
  (window as unknown as { __AEJ_INTERNAL__: DebugPortal }).__AEJ_INTERNAL__ = {
    nodeStateMap,
    sheetCache,
    version: '0.32.1',
  };
}

/**
 * WeakMap for elements that were declared as components via static properties
 * but are not yet connected to the DOM.
 */
const autoSetupMap = new WeakMap<HTMLElement, AtomComponentStatic>();

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

const supportsInternals =
  typeof window !== 'undefined' && 'attachInternals' in HTMLElement.prototype;

/**
 * Manages a global cache of CSSStyleSheets to prevent redundant parsing
 * of identical style strings across component instances.
 */
const getOrCreateSheet = (source: string | CSSStyleSheet): CSSStyleSheet => {
  if (source instanceof CSSStyleSheet) return source;
  let sheet = sheetCache.get(source);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    // Simple LRU-ish eviction: remove the first added entry if cache exceeds limit
    if (sheetCache.size >= MAX_SHEET_CACHE_SIZE) {
      const firstKey = sheetCache.keys().next().value;
      if (firstKey !== undefined) sheetCache.delete(firstKey);
    }
    sheetCache.set(source, sheet);
  }
  return sheet;
};

// ─── Context Engine ─────────────────────────────────────────────────────────

/**
 * Internal singleton that coordinates Dependency Injection (DI) across the DOM.
 *
 * Why: DOM tree changes (adding/removing nodes) affect context resolution.
 * This engine tracks those changes and notifies observers.
 */
const ContextEngine = (() => {
  const version = $.atom(0);
  let isBumpPending = false;
  let observer: MutationObserver | null = null;
  let activeCount = 0;

  /**
   * Signals that the DOM tree has changed, potentially invalidating cached injections.
   * Debounced to a microtask to avoid excessive re-computations during bulk updates.
   */
  const bump = () => {
    if (isBumpPending) return;
    isBumpPending = true;
    queueMicrotask(() => {
      version.value++;
      isBumpPending = false;
    });
  };

  /**
   * Initializes a "late-bound" component that was discovered in the DOM.
   */
  const init = (el: HTMLElement) => {
    const specs = autoSetupMap.get(el);
    if (specs) {
      const ctrl = nodeStateMap.get(el)?.controller;
      if (ctrl) {
        ctrl.setup({
          ...(specs.aejStyles && { styles: specs.aejStyles }),
          ...(specs.aejBind && { bind: specs.aejBind }),
          ...(specs.aejAria && { aria: specs.aejAria }),
          ...(specs.aejParts && { parts: specs.aejParts }),
          ...(specs.aejDispatch && { dispatch: specs.aejDispatch }),
          ...(specs.aejValue && { value: specs.aejValue }),
          ...(specs.aejValidation && { validation: specs.aejValidation }),
        });
      }
      autoSetupMap.delete(el);
      ContextEngine.release();
    }
  };

  const ensureObserver = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      let needsBump = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i]!;
        if (m.addedNodes.length > 0) {
          needsBump = true;
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j];
            if (node instanceof HTMLElement) {
              init(node);
              // Deep scan for nested components that might have been added in a fragment
              const children = node.querySelectorAll('*');
              for (let k = 0; k < children.length; k++) {
                init(children[k] as HTMLElement);
              }
            }
          }
        }
        if (m.removedNodes.length > 0) needsBump = true;
      }
      if (needsBump) bump();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  const releaseObserver = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  };

  return {
    get version() {
      return version;
    },
    bump,
    /** Activates DOM monitoring when at least one component is waiting for connection. */
    retain() {
      activeCount++;
      if (activeCount === 1) ensureObserver();
    },
    /** Deactivates DOM monitoring when no components are pending. */
    release() {
      activeCount--;
      if (activeCount === 0) releaseObserver();
    },
    /**
     * Resolves a context key by dispatching a bubbling DOM event.
     * This mimics the native Web Component Context API proposal.
     */
    discover(target: HTMLElement, key: string | symbol): Option<unknown> {
      let found: Option<unknown> = Option.none;
      const event = new CustomEvent<ContextRequestDetail>(CONTEXT_REQUEST, {
        detail: {
          key,
          callback: (atom) => {
            found = Option.some(atom);
          },
        },
        bubbles: true,
        composed: true, // Traverse shadow boundaries
      });
      target.dispatchEvent(event);
      return found;
    },
  };
})();

// ─── Context Proxy Resolver ─────────────────────────────────────────────────

/**
 * Creates a reactive proxy that follows a context value as it moves in the DOM.
 *
 * If the element is moved under a different provider, this proxy will automatically
 * update to the new provider's value because it tracks `ContextEngine.version`.
 */
function createContextProxy<T>(target: HTMLElement, key: string | symbol): WritableAtom<T> {
  const resolve = (isPeek: boolean) => {
    // Tracking version makes the calling computed/effect re-run when DOM structure changes
    if (isPeek) ContextEngine.version.peek();
    else ContextEngine.version.value;

    return untracked(() => ContextEngine.discover(target, key)) as Option<WritableAtom<T> | T>;
  };

  const getLiveValue = (isPeek: boolean) => {
    const res = resolve(isPeek);
    if (Option.isNone(res)) return null as T;
    const p = Option.unwrap(res);
    // If the provider provided an Atom, we return its value. Otherwise return the raw value.
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
      const res = resolve(true);
      if (Option.isSome(res)) {
        const p = Option.unwrap(res);
        if (isWritable(p)) p.value = v;
      }
    },
    peek() {
      return getLiveValue(true);
    },
    subscribe: (fn) => {
      ContextEngine.retain(); // Keep observer alive while there are active subscribers
      const unsub = getShared().subscribe(fn);
      return () => {
        unsub();
        ContextEngine.release();
      };
    },
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

// ─── Controller Implementation ───────────────────────────────────────────────

/**
 * Orchestrates AEJ features for a specific DOM element.
 *
 * Usage:
 * ```ts
 * const ctrl = useAtomComponent(el);
 * ctrl.setup({
 *   bind: { '.title': { text: titleAtom } }
 * });
 * ```
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  // Guard: Warn if used on an unregistered custom element (potential typo)
  if (debug.enabled && typeof customElements !== 'undefined') {
    const tagName = element.tagName.toLowerCase();
    if (tagName.includes('-') && !customElements.get(tagName)) {
      debug.warn(SYSTEM_COMPONENT.PREFIX, SYSTEM_COMPONENT.ERRORS.NOT_REGISTERED(tagName));
    }
  }

  const internal = getInternalState(element);
  if (internal.controller) return internal.controller;

  // ElementInternals allows custom elements to participate in forms and accessibility
  let internals: ElementInternals | undefined;
  if (supportsInternals) {
    try {
      internals = element.attachInternals();
    } catch {
      /* Native exception if attachInternals is called twice or not on a custom element */
    }
  }

  const state = new ComponentState(element);

  const controller: AtomComponentController = {
    host: element,
    get root() {
      return Option.toNullable(state.root);
    },
    get internals() {
      return internals;
    },

    /** Returns a reactive lens for a DOM attribute. Updates when the attribute changes. */
    get attrs() {
      if (!state.attributeAtom) {
        const { atom, observer } = SetupFeatures.attributes(element);
        state.attributeAtom = atom;
        state.attributeObserver = observer;
      }
      return (name: string) => {
        let lens = state.attributeLenses.get(name);
        if (!lens) {
          lens = $.atomLens(state.attributeAtom!, name);
          state.attributeLenses.set(name, lens);
        }
        return lens;
      };
    },

    /** Returns a reactive lens for named slots. Useful in Shadow DOM components. */
    get slots() {
      if (!state.slotsAtom) {
        const sr = resolveShadowRoot(element, Option.toNullable(state.root));
        const { atom, listener } = SetupFeatures.slots(sr);
        state.slotsAtom = atom;
        if (sr) state.slotListeners.set('all', listener);
      }
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

    /** Scoped jQuery selector. Defaults to searching within the component's root. */
    $: ((selector, context) => {
      const ctx = context ?? Option.toNullable(state.root) ?? element;
      if (typeof selector !== 'string') return $(selector) as unknown as JQuery;
      return ctx instanceof DocumentFragment
        ? ($(ctx.querySelectorAll(selector)) as unknown as JQuery)
        : ($(selector, ctx as Element) as unknown as JQuery);
    }) as JQueryScopedSelector,

    provideAtom: (key: string | symbol, val: unknown) => provideAtom(element, key, val),
    injectAtom: <T = unknown>(key: string | symbol) => injectAtom<T>(element, key),

    /**
     * Bootstraps component features (bindings, styles, etc.)
     * This is idempotent; calling it twice with the same root does nothing.
     */
    setup(options: Parameters<AtomComponentController['setup']>[0]) {
      if (state.isInitialized) {
        const incoming = options instanceof Node ? options : options?.shadowRoot;
        if (incoming && incoming !== Option.toNullable(state.root))
          throw new Error('Call teardown() first to change the root.');
        return;
      }

      const config =
        options instanceof Node ? { shadowRoot: options as ShadowRoot } : (options ?? {});
      const srOpt = Option.fromNullable(config.shadowRoot ?? element.shadowRoot);

      Option.map(srOpt, (sr) => {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      });

      const rootNode = Option.unwrapOr(srOpt, element) as Node & {
        [CLEANUP_MARKER]?: boolean;
      };
      state.root = Option.some(rootNode);

      // Memory Management: Ensure the root node (ShadowRoot or Element)
      // automatically cleans up AEJ effects when disconnected from the DOM.
      if (!rootNode[CLEANUP_MARKER]) {
        enableAutoCleanup(rootNode as Element);
        rootNode[CLEANUP_MARKER] = true;
      }

      // Feature Initialization Sequence
      if (!state.slotsAtom) {
        const sr = Option.toNullable(srOpt);
        const { atom, listener } = SetupFeatures.slots(sr);
        state.slotsAtom = atom;
        if (sr) state.slotListeners.set('all', listener);
      }

      if (config.dispatch) SetupFeatures.dispatch(element, config.dispatch, state.effects);
      if (config.bind)
        SetupFeatures.hydrate(rootNode as Element, config.bind, state.effects, state.hydratedNodes);

      if (
        config.styles &&
        supportsConstructableStylesheets &&
        (rootNode instanceof ShadowRoot || rootNode instanceof Document)
      ) {
        state.appliedStyles = SetupFeatures.styles(rootNode, config.styles.map(getOrCreateSheet));
      }

      if (config.aria && internals) SetupFeatures.aria(internals, config.aria, state.effects);
      if (config.parts) SetupFeatures.parts(rootNode as Element, config.parts, state.effects);

      if ((config.value || config.validation) && internals) {
        SetupFeatures.form(element, internals, config.value, config.validation, state.effects);
      }

      state.isInitialized = true;
    },

    teardown() {
      const s = nodeStateMap.get(element);
      if (s) {
        s.providers?.clear();
        s.providerEffects?.forEach((e) => e.dispose());
        s.providerEffects?.clear();
        s.injects?.clear();
      }

      if (autoSetupMap.has(element)) {
        autoSetupMap.delete(element);
        ContextEngine.release();
      }

      ContextEngine.bump();
      state.dispose();
      registry.cleanupTree(element);
    },
  } as unknown as AtomComponentController;

  // ─── Automatic Setup for Static Declarations ──────────────────────────────

  const ctor = element.constructor as typeof HTMLElement & AtomComponentStatic;
  const hasStaticSpecs = !!(
    ctor.aejStyles ||
    ctor.aejBind ||
    ctor.aejAria ||
    ctor.aejParts ||
    ctor.aejDispatch ||
    ctor.aejValue ||
    ctor.aejValidation
  );

  if (hasStaticSpecs) {
    if (element.isConnected) {
      controller.setup({
        ...(ctor.aejStyles && { styles: ctor.aejStyles }),
        ...(ctor.aejBind && { bind: ctor.aejBind }),
        ...(ctor.aejAria && { aria: ctor.aejAria }),
        ...(ctor.aejParts && { parts: ctor.aejParts }),
        ...(ctor.aejDispatch && { dispatch: ctor.aejDispatch }),
        ...(ctor.aejValue && { value: ctor.aejValue }),
        ...(ctor.aejValidation && { validation: ctor.aejValidation }),
      });
    } else {
      // If not connected, defer setup until the element is inserted into the DOM.
      autoSetupMap.set(element, ctor);
      ContextEngine.retain();
    }
  }

  registry.setTeardown(element, () => controller.teardown());

  internal.controller = controller;
  return controller;
}

/**
 * Registers a value or atom to be provided to all descendant elements.
 *
 * Side-effect: Synchronizes the value to a CSS variable `--aej-[key]`
 * on the host element for hybrid styling (CSS-in-JS lite).
 *
 * @example
 * provideAtom(el, 'theme', $.atom('dark'));
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

  for (let i = 0; i < targets.length; i++) {
    const el = targets[i]!;
    const state = getInternalState(el);
    if (!state.providers) {
      state.providers = new Map();
      // Listen for injection requests from descendants
      el.addEventListener(CONTEXT_REQUEST, (e: Event) => {
        const { key: reqKey, callback } = (e as CustomEvent<ContextRequestDetail>).detail;
        if (state.providers?.has(reqKey)) {
          e.stopPropagation();
          callback(state.providers.get(reqKey));
        }
      });
    }
    state.providers.set(key, val);

    // CSS Variable Sync Logic
    const keyStr = typeof key === 'symbol' ? key.description : String(key);
    if (keyStr) {
      const varName = `--aej-${keyStr}`;
      const sync = (v: unknown) => el.style.setProperty(varName, String(v ?? ''));
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
  }
  ContextEngine.bump();
}

/**
 * Injects a provided value or atom from an ancestor.
 * Returns a proxy atom that tracks the provider's location in the DOM.
 *
 * @example
 * const theme = injectAtom(el, 'theme');
 * $.effect(() => console.log(theme.value));
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

// Attach to jQuery namespace for global accessibility
$.extend({ provideAtom, injectAtom, useAtomComponent });
