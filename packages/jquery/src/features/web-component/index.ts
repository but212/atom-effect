import { BRAND, BrandFlags, isAtom, isWritable, untracked } from '@but212/atom-effect';
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

/**
 * Diagnostic access for internal engine state.
 * @internal
 */
interface DebugPortal {
  nodeStateMap: WeakMap<Node, NodeInternalState>;
  sheetCache: Map<string, CSSStyleSheet>;
  version: string;
}

/**
 * Consolidated metadata for DOM nodes participating in the AEJ ecosystem.
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

// ─── Debug Portal (Point 3) ──────────────────────────────────────────────────

if (debug.enabled && typeof window !== 'undefined') {
  (window as unknown as { __AEJ_INTERNAL__: DebugPortal }).__AEJ_INTERNAL__ = {
    nodeStateMap,
    sheetCache,
    version: '0.31.0',
  };
}

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

const getOrCreateSheet = (source: string | CSSStyleSheet): CSSStyleSheet => {
  if (source instanceof CSSStyleSheet) return source;
  let sheet = sheetCache.get(source);
  if (!sheet) {
    sheet = new CSSStyleSheet();
    sheet.replaceSync(source);
    if (sheetCache.size >= MAX_SHEET_CACHE_SIZE) {
      const firstKey = sheetCache.keys().next().value;
      if (firstKey !== undefined) sheetCache.delete(firstKey);
    }
    sheetCache.set(source, sheet);
  }
  return sheet;
};

// ─── Context Engine (Encapsulated Versioning) ───────────────────────────────

const ContextEngine = (() => {
  const version = $.atom(0);
  let isBumpPending = false;
  let observer: MutationObserver | null = null;
  let activeCount = 0;

  const bump = () => {
    if (isBumpPending) return;
    isBumpPending = true;
    queueMicrotask(() => {
      version.value++;
      isBumpPending = false;
    });
  };

  const init = (el: HTMLElement) => {
    const specs = autoSetupMap.get(el);
    if (specs) {
      const ctrl = getInternalState(el).controller;
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
    }
  };

  const ensureObserver = () => {
    if (observer || typeof document === 'undefined') return;
    observer = new MutationObserver((mutations) => {
      let needsBump = false;
      for (let i = 0; i < mutations.length; i++) {
        const m = mutations[i];
        if (m && m.addedNodes.length > 0) {
          needsBump = true;
          m.addedNodes.forEach((node) => {
            if (node instanceof HTMLElement) {
              init(node);
              node.querySelectorAll('*').forEach((el) => init(el as HTMLElement));
            }
          });
        }
        if (m && m.removedNodes.length > 0) needsBump = true;
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
    retain() {
      activeCount++;
      if (activeCount === 1) ensureObserver();
    },
    release() {
      activeCount--;
      if (activeCount === 0) releaseObserver();
    },
    discover(target: HTMLElement, key: string | symbol): unknown {
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
    subscribe: (fn) => {
      ContextEngine.retain();
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

      if (config.dispatch) SetupFeatures.dispatch(element, config.dispatch, state.effects);
      if (config.bind)
        SetupFeatures.hydrate(
          state.root as Element,
          config.bind,
          state.effects,
          state.hydratedNodes
        );
      if (
        config.styles &&
        supportsConstructableStylesheets &&
        (state.root instanceof ShadowRoot || state.root instanceof Document)
      ) {
        state.appliedStyles = SetupFeatures.styles(state.root, config.styles.map(getOrCreateSheet));
      }
      if (config.aria && internals) SetupFeatures.aria(internals, config.aria, state.effects);
      if (config.parts) SetupFeatures.parts(state.root as Element, config.parts, state.effects);
      if ((config.value || config.validation) && internals) {
        SetupFeatures.form(element, internals, config.value, config.validation, state.effects);
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
      autoSetupMap.set(element, ctor);
    }
  }

  internal.controller = controller;
  return controller;
}

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
