import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AtomComponentController, JQueryScopedSelector, ReadonlyAtom } from '@/types';

// ─── Internal Symbols ────────────────────────────────────────────────────────

/**
 * Keyed slot for AEJ state attached directly to DOM nodes.
 * @internal
 */
const AEJ_STATE = Symbol.for('aej:state');

/**
 * Marker for MutationObserver activity.
 *
 * Reason: Written directly onto the reactive root node so external observers
 * (e.g. tests, devtools) can cheaply verify if auto-cleanup is enabled.
 * @internal
 */
const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');

// ─── Internal Types ───────────────────────────────────────────────────────────

/** @internal */
interface AEJState {
  controller?: AtomComponentController;
  providers?: Map<string | symbol, unknown>;
}

/** @internal */
type AEJNode = Node & {
  [AEJ_STATE]?: AEJState;
  [CLEANUP_MARKER]?: boolean;
};

// ─── Internal Helpers ─────────────────────────────────────────────────────────

/** @internal */
function asAEJNode(node: Node): AEJNode {
  return node;
}

/** @internal */
function getAEJState(node: Node, create = false): AEJState | undefined {
  const n = asAEJNode(node);
  if (!n[AEJ_STATE] && create) n[AEJ_STATE] = {};
  return n[AEJ_STATE];
}

/**
 * Resolves a flexible element argument to a single HTMLElement.
 * @internal
 */
function resolveElement(element: HTMLElement | JQuery | string): HTMLElement | null {
  if (element instanceof HTMLElement) return element;
  if (typeof element === 'string') return document.querySelector<HTMLElement>(element);
  return ((element as JQuery)[0] as HTMLElement) ?? null;
}

/**
 * Resolves a flexible element argument to an array of HTMLElements.
 * @internal
 */
function resolveElements(element: HTMLElement | JQuery | string): HTMLElement[] {
  if (element instanceof HTMLElement) return [element];
  if (typeof element === 'string')
    return Array.from(document.querySelectorAll<HTMLElement>(element));
  return (element as JQuery).toArray() as HTMLElement[];
}

/**
 * Traverses the composed tree to find a provided context value.
 *
 * Optimization: Uses Symbols and nodeType for O(depth) lookup.
 *
 * @internal
 */
function findContext(target: HTMLElement, key: string | symbol): unknown | null {
  // Logic: Start from parent to prevent self-injection (Bug 4)
  let curr: Node | null = target.parentNode;

  while (curr) {
    const providers = asAEJNode(curr)[AEJ_STATE]?.providers;
    if (providers?.has(key)) return providers.get(key);

    const next: Node | null = curr.parentNode;
    if (next) {
      curr = next;
    } else if (curr.nodeType === 11) {
      // DocumentFragment / ShadowRoot
      curr = (curr as ShadowRoot).host || null;
    } else {
      curr = null;
    }
  }

  return null;
}

/**
 * Creates a scoped jQuery selector function.
 *
 * Reason: Standard jQuery $(selector, context) fails when context is a
 * ShadowRoot. We fallback to native querySelectorAll for these cases.
 *
 * @internal
 */
function createScopedSelector(host: HTMLElement, getRoot: () => Node | null): JQueryScopedSelector {
  return (selector, context) => {
    const root = getRoot() || host;
    if (typeof selector !== 'string') return $(selector) as JQuery;

    const ctx = context || root;

    if (ctx instanceof DocumentFragment) {
      return $(Array.from(ctx.querySelectorAll<HTMLElement>(selector))) as JQuery;
    }

    return $(selector, ctx) as JQuery;
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Composition-based helper for AEJ Web Components.
 *
 * When to use:
 * - When adding reactive capabilities to standard Custom Elements.
 * - When you want to avoid 'this' pollution and maintain perfect type safety.
 *
 * @param element - The host Custom Element (usually `this`).
 * @returns A controller for managing reactive lifecycle and scoped root.
 *
 * @example
 * class MyComp extends HTMLElement {
 *   private aej = $.useAtomComponent(this);
 *
 *   connectedCallback() {
 *     this.aej.setup();
 *     this.aej.$('span').text('Hello');
 *   }
 *
 *   disconnectedCallback() {
 *     this.aej.teardown();
 *   }
 * }
 * customElements.define('my-comp', MyComp);
 *
 * @public
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  const state = getAEJState(element, true)!;
  if (state.controller) return state.controller;

  // Reason: Consolidate internal state to ensure teardown atomicity.
  const reactive = {
    root: null as AEJNode | null,
    isInitialized: false,
  };

  const controller: AtomComponentController = {
    host: element,

    get root() {
      return reactive.root;
    },

    $: createScopedSelector(element, () => reactive.root),

    provideAtom(key: string | symbol, val: unknown) {
      provideAtom(element, key, val);
    },

    injectAtom<T = unknown>(key: string | symbol): T | null {
      return findContext(element, key) as T | null;
    },

    setup(shadowRoot?: ShadowRoot) {
      if (reactive.isInitialized) {
        if (shadowRoot && shadowRoot !== reactive.root) {
          throw new Error('Call teardown() before setting up with a different shadowRoot.');
        }
        return;
      }

      const sr = shadowRoot || element.shadowRoot;
      if (sr) {
        registry.markHost(element);
        registry.registerShadow(element, sr);
      }

      reactive.root = asAEJNode(sr ?? element);

      if (!reactive.root[CLEANUP_MARKER]) {
        enableAutoCleanup(reactive.root as Element | ShadowRoot);
        reactive.root[CLEANUP_MARKER] = true;
      }

      reactive.isInitialized = true;
    },

    teardown() {
      if (!reactive.isInitialized) return;

      // Reason: Atomic reset. Flag is set to false BEFORE cleanup to prevent
      // re-entry if cleanup functions throw.
      reactive.isInitialized = false;

      try {
        if (reactive.root?.[CLEANUP_MARKER]) {
          disableAutoCleanupFor(reactive.root);
          reactive.root[CLEANUP_MARKER] = false;
        }
      } finally {
        reactive.root = null;
        registry.deferCleanup(element);
      }
    },
  };

  state.controller = controller;
  return controller;
}

/**
 * Registers a provider for a reactive context value on one or more elements.
 *
 * When to use:
 * - When you need to share state (atoms) with deep descendant elements.
 * - To avoid "prop drilling" in complex component hierarchies.
 *
 * @param element - The host element, CSS selector, or jQuery collection.
 * @param key - Unique identifier for the context.
 * @param val - The value (usually an Atom) to share.
 *
 * @example
 * const theme = $.atom('dark');
 * $.provideAtom('#app', 'theme', theme);
 *
 * @public
 */
export function provideAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol,
  val: unknown
): void {
  for (const el of resolveElements(element)) {
    const s = getAEJState(el, true)!;
    if (!s.providers) s.providers = new Map();
    s.providers.set(key, val);
  }
}

/**
 * Injects a reactive context provided by an ancestor element.
 *
 * When to use:
 * - To consume state provided by a parent/ancestor component.
 * - To decouple child components from specific data sources.
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to find.
 * @returns The provided value if found, otherwise `null`.
 *
 * @example
 * // In a child component
 * const theme = $.injectAtom(this, 'theme');
 * if (theme) {
 *   $(this).atomClass('dark-mode', $.computed(() => theme.value === 'dark'));
 * }
 *
 * @public
 */
export function injectAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): ReadonlyAtom<unknown> | null {
  const target = resolveElement(element);
  if (!target) return null;

  // Logic: Late Binding support for Web Components.
  // Custom Elements are not connected during construction.
  // We return a lazy computed atom so property initializers work consistently.
  if (!target.isConnected && target.tagName.includes('-')) {
    return $.computed(() => {
      const provider = findContext(target, key);
      return ($.isAtom(provider) ? provider.value : provider) as unknown;
    }) as ReadonlyAtom<unknown>;
  }

  const provider = findContext(target, key);
  if (provider === null) return null;

  // Reason: Return the actual atom if provided, otherwise a static computed wrapper
  // to ensure consistent 'ReadonlyAtom' duck-typing interface.
  if ($.isAtom(provider)) return provider as unknown as ReadonlyAtom<unknown>;
  return $.computed(() => provider as unknown) as ReadonlyAtom<unknown>;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
