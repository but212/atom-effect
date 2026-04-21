import $ from 'jquery';
import { disableAutoCleanupFor, enableAutoCleanup, registry } from '@/core/registry';
import type { AEJContextMap } from '@/types';

/**
 * Constants & Markers
 * @internal
 */
const REQ_EVT = 'aej:context-request';
const CLEANUP_MARKER = Symbol.for('aej:cleanup-enabled');
const PROVIDERS_KEY = Symbol.for('aej:providers');

/**
 * Internal Context interface for DI event transport.
 * @internal
 */
interface AEJContext<T = unknown> {
  key: string | symbol;
  val: T | null;
}

/**
 * Internal extension of HTMLElement to track provider metadata.
 * @internal
 */
interface ElementWithProviders extends HTMLElement {
  [PROVIDERS_KEY]?: Map<string | symbol, unknown>;
}

/** @internal */
const INITIALIZED_PROVIDERS = new WeakSet<Element>();

/**
 * Interface representing the features added to a component by AEJ.
 *
 * Includes scoped jQuery access and a simplified DI API.
 * @public
 */
export interface AtomComponentFeatures {
  /** Scoped jQuery instance targeting shadowRoot (if present) or the host element. */
  readonly $root: JQuery;
  /** Registers a reactive provider on this element. */
  provideAtom<K extends keyof AEJContextMap>(key: K, val: AEJContextMap[K]): void;
  provideAtom(key: string | symbol, val: unknown): void;
  /** Injects a reactive context from an ancestor. */
  injectAtom<K extends keyof AEJContextMap>(key: K): AEJContextMap[K] | null;
  injectAtom<T>(key: string | symbol): T | null;
}

/**
 * Controller providing AEJ features via composition instead of inheritance.
 *
 * Use this to add reactive capabilities to standard Web Components.
 * @public
 */
export interface AtomComponentController extends AtomComponentFeatures {
  /**
   * Initializes the component's reactive lifecycle.
   * @param shadowRoot - Optional ShadowRoot (required for 'closed' mode components).
   */
  setup(shadowRoot?: ShadowRoot): void;
  /** Tears down all reactive bindings. Call in disconnectedCallback. */
  teardown(): void;
}

// --- Internal Helpers ---

/**
 * Normalizes polymorphic element input (string selector, HTMLElement, or JQuery)
 * into a native HTMLElement array.
 * @internal
 */
function toElementArray(element: HTMLElement | JQuery | string): HTMLElement[] {
  if (typeof element === 'string') {
    return Array.from(document.querySelectorAll(element)) as HTMLElement[];
  }
  if (element instanceof HTMLElement) {
    return [element];
  }
  return (element as JQuery).toArray() as HTMLElement[];
}

/**
 * Orchestrates a context request dispatch with Shadow DOM boundary traversal.
 * @internal
 */
function requestContext(target: HTMLElement, key: string | symbol): unknown | null {
  const context: AEJContext<unknown> = { key, val: null };
  const eventOptions: CustomEventInit<AEJContext<unknown>> = {
    detail: context,
    bubbles: true,
    composed: true,
  };

  // Phase 1: Native bubbling dispatch.
  // Works for same-root providers or cross-boundary providers in environments
  // where jQuery or other listeners correctly handle retargeted events.
  target.dispatchEvent(new CustomEvent(REQ_EVT, eventOptions));
  if (context.val !== null) return context.val;

  // Phase 2: Manual Shadow Host chain traversal fallback.
  // Guarantees resolution even when event retargeting or bubbling is hindered
  // by complex shadow nesting or framework-specific event systems.
  let currentRoot = target.getRootNode();
  while (currentRoot instanceof ShadowRoot) {
    const host = currentRoot.host;
    const fallbackCtx: AEJContext<unknown> = { key, val: null };
    host.dispatchEvent(new CustomEvent(REQ_EVT, { ...eventOptions, detail: fallbackCtx }));

    if (fallbackCtx.val !== null) return fallbackCtx.val;
    currentRoot = host.getRootNode();
  }

  return null;
}

// --- Main APIs ---

/**
 * Composition-based helper for AEJ Web Components.
 *
 * When to use:
 * - When adding reactive capabilities to standard Custom Elements.
 * - When you want to avoid 'this' pollution and maintain perfect type safety.
 *
 * @param element - The host element (usually 'this').
 * @returns A controller for managing reactive lifecycle and scoped root.
 *
 * @example
 * class MyComp extends HTMLElement {
 *   // Safe: class field initializers run after super(), so capturing `this` here is valid.
 *   private aej = $.useAtomComponent(this);
 *   connectedCallback() {
 *     this.aej.setup();
 *     this.aej.$root.text('Hello AEJ');
 *   }
 *   disconnectedCallback() {
 *     this.aej.teardown();
 *   }
 * }
 *
 * @public
 */
export function useAtomComponent(element: HTMLElement): AtomComponentController {
  // Logic: Closure-scoped boundary tracking for precise cleanup.
  let reactiveRoot: (Node & { [CLEANUP_MARKER]?: boolean }) | null = null;

  return {
    get $root(): JQuery {
      // Note: Cast to JQuery is intentional; jQuery operates on ShadowRoot nodes correctly.
      return $(element.shadowRoot || element) as unknown as JQuery;
    },

    provideAtom(key: string | symbol, val: unknown): void {
      provideAtom(element, key, val);
    },

    injectAtom(key: string | symbol): unknown | null {
      return injectAtom(element, key);
    },

    setup(shadowRoot?: ShadowRoot) {
      registry.markHost(element);

      // Prioritize explicitly provided roots (supporting 'closed' mode components).
      const sr = shadowRoot || element.shadowRoot;
      if (sr) registry.registerShadow(element, sr);

      const boundary = registry.getShadow(element) || element;
      reactiveRoot = boundary as Node & { [CLEANUP_MARKER]?: boolean };

      if (!reactiveRoot[CLEANUP_MARKER]) {
        enableAutoCleanup(reactiveRoot as Element);
        reactiveRoot[CLEANUP_MARKER] = true;
      }
    },

    teardown() {
      // Memory Management: Disconnect MutationObserver to release strong references to ShadowRoots.
      if (reactiveRoot) {
        disableAutoCleanupFor(reactiveRoot);
        reactiveRoot[CLEANUP_MARKER] = false;
        reactiveRoot = null;
      }
      registry.deferredCleanup(element);
    },
  };
}

/**
 * Registers an element (or multiple) as a provider for a reactive context.
 *
 * @param element - The host element, selector, or JQuery collection.
 * @param key - Unique identifier for the context.
 * @param val - The value (usually an Atom) to be shared.
 *
 * @public
 */
export function provideAtom<K extends keyof AEJContextMap>(
  element: HTMLElement | JQuery | string,
  key: K,
  val: AEJContextMap[K]
): void;
export function provideAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol,
  val: unknown
): void;
export function provideAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol,
  val: unknown
): void {
  for (const el of toElementArray(element) as ElementWithProviders[]) {
    let map = el[PROVIDERS_KEY];
    if (!map) el[PROVIDERS_KEY] = map = new Map();

    map.set(key, val);

    if (!INITIALIZED_PROVIDERS.has(el)) {
      el.addEventListener(REQ_EVT, (e: Event) => {
        const detail = (e as CustomEvent<AEJContext<unknown>>).detail;
        const providers = el[PROVIDERS_KEY];

        if (detail && providers?.has(detail.key)) {
          detail.val = providers.get(detail.key);
          e.stopPropagation();
        }
      });
      INITIALIZED_PROVIDERS.add(el);
    }
  }
}

/**
 * Injects a reactive context provided by an ancestor element.
 *
 * @param element - The element or selector requesting the context.
 * @param key - The unique identifier of the context to find.
 * @returns The injected value if a provider was found, otherwise `null`.
 *
 * @public
 */
export function injectAtom<K extends keyof AEJContextMap>(
  element: HTMLElement | JQuery | string,
  key: K
): AEJContextMap[K] | null;
export function injectAtom<T>(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): T | null;
export function injectAtom(
  element: HTMLElement | JQuery | string,
  key: string | symbol
): unknown | null {
  const target =
    typeof element === 'string'
      ? (document.querySelector(element) as HTMLElement)
      : element instanceof HTMLElement
        ? element
        : (element as JQuery)[0];

  return target ? requestContext(target, key) : null;
}

$.extend({ provideAtom, injectAtom, useAtomComponent });
