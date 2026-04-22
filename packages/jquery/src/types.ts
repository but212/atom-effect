import type {
  AtomOptions as BaseAtomOptions,
  ComputedAtom,
  ComputedOptions,
  EffectObject,
  Paths,
  PathValue,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

export type EffectCleanup = () => void;
export interface ComponentLifecycle {
  unmount: EffectCleanup;
}
export type EffectResult = undefined | EffectCleanup | ComponentLifecycle;
export type EqualFn<T> = (a: T, b: T) => boolean;

export interface AtomOptions extends BaseAtomOptions {
  name?: string;
  sync?: boolean;
}

/**
 * Logic: Polymorphic Input
 * Supports raw values for static initialization, reactive Atoms for state-driven
 * updates, or functional getters for deferred execution of complex logic.
 *
 * @public
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);

/**
 * When to use:
 * - CSS or Attribute bindings that require data from an async source.
 * - Integration with fetch-based reactive atoms.
 *
 * @public
 */
export type AsyncReactiveValue<T> =
  | T
  | ReadonlyAtom<T | Promise<T>>
  | Promise<T>
  | (() => T | Promise<T>);

export type PrimitiveValue = string | number | boolean | null | undefined;

export type CssValue =
  | AsyncReactiveValue<string | number>
  | [source: AsyncReactiveValue<number>, unit: string];

export type CssBindings = Record<string, CssValue>;

/**
 * Logic: Binding Strategy Map
 * Maps reactive sources to specific DOM manipulation strategies (text, class,
 * val, etc.). This declarative structure allows the engine to batch
 * updates and optimize cleanup automatically.
 *
 * @public
 */
export interface BindingOptions<T = unknown> {
  text?:
    | AsyncReactiveValue<unknown>
    | [source: AsyncReactiveValue<unknown>, formatter: (v: unknown) => string];
  html?: AsyncReactiveValue<string>;
  class?: Record<string, AsyncReactiveValue<boolean>>;
  css?: CssBindings;
  attr?: Record<string, AsyncReactiveValue<PrimitiveValue>>;
  prop?: Record<string, AsyncReactiveValue<unknown>>;
  show?: AsyncReactiveValue<boolean>;
  hide?: AsyncReactiveValue<boolean>;
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  checked?: WritableAtom<boolean>;
  form?:
    | WritableAtom<T extends object ? T : unknown>
    | [
        atom: WritableAtom<T extends object ? T : unknown>,
        options: FormOptions<T extends object ? T : unknown>,
      ];
  on?: Record<string, (e: JQuery.Event) => void>;
}

export interface DisposableWritableAtom<T> extends WritableAtom<T> {
  dispose(): void;
}

export type ListKey = string | number;
export type ListRenderResult = string | Element | DocumentFragment | JQuery;
export type ListKeyFn<T> = (item: T, index: number) => ListKey;

/**
 * Optimization: DOM Reconciliation
 * Uses a 'key' for identity tracking to minimize DOM churn by reordering
 * existing elements instead of re-rendering the entire list when
 * the underlying data changes.
 *
 * @public
 */
export interface ListOptions<T> {
  key: keyof T | ListKeyFn<T>;
  render: (item: T, index: number) => ListRenderResult;
  bind?: ($el: JQuery, item: T, index: number) => void;
  update?: ($el: JQuery, item: T, index: number) => void;
  onAdd?: ($el: JQuery) => void;
  onRemove?: ($el: JQuery) => Promise<void> | void;
  empty?: ListRenderResult;
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  isEqual?: (a: T, b: T) => boolean;
}

export interface ValOptions<T> {
  debounce?: number;
  event?: string;
  parse?: (v: string) => T;
  format?: (v: T) => string;
  equal?: EqualFn<T>;
}

export interface FormOptions<T> extends ValOptions<T> {
  /** Custom function to transform field value based on path before atomic sync. */
  transform?: (path: string, value: unknown) => unknown;
  /** Callback triggered when a field value changes. */
  onChange?: (path: string, value: unknown) => void;
}

export interface FetchOptions<T> {
  defaultValue: T;
  name?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});
  headers?: Record<string, string>;
  transform?: (raw: unknown, xhr: JQuery.jqXHR) => T;
  ajaxOptions?: JQuery.AjaxSettings | (() => JQuery.AjaxSettings);
  onError?: (err: unknown) => void;
  eager?: boolean;
}

export interface FetchError extends Error {
  jqXHR?: JQuery.jqXHR;
}

/** Definition for a mountable component that manages its own lifecycle. */
export type ComponentFn<P = Record<string, unknown>> = ($el: JQuery, props: P) => EffectResult;

export interface RouteLifecycle {
  onEnter?: (
    params: Record<string, string>,
    router: Router
  ) => Record<string, string> | undefined | false;
  onLeave?: (router: Router) => boolean | undefined;
  title?: string;
}

export interface RouteDefinition extends RouteLifecycle {
  template?: string;
  render?: (
    container: HTMLElement,
    route: string,
    params: Record<string, string>,
    onUnmount: (cleanupFn: () => void) => void,
    router: Router
  ) => void;
  onMount?: ($content: JQuery, onUnmount: (cleanupFn: () => void) => void, router: Router) => void;
}

export interface RouteConfig {
  target: string | JQuery<HTMLElement> | HTMLElement;
  default?: string;
  routes?: Record<string, RouteDefinition>;
  mode?: 'hash' | 'history';
  basePath?: string;
  notFound?: string;
  autoBindLinks?: boolean;
  activeClass?: string;
  beforeTransition?: (from: string, to: string) => void;
  afterTransition?: (from: string, to: string) => void;
}

export interface Router {
  currentRoute: ReadonlyAtom<string>;
  queryParams: ReadonlyAtom<Record<string, string>>;
  params: ReadonlyAtom<Record<string, string>>;
  navigate: (route: string) => void;
  destroy: () => void;
}

export interface AtomNavOptions {
  target: string | JQuery<HTMLElement> | HTMLElement;
  selector?: string;
  headers?: Record<string, string>;
  onBeforeLoad?: (url: string) => boolean | undefined | Promise<boolean | undefined>;
  onMount?: ($container: JQuery, url: string) => void;
  onUnmount?: ($container: JQuery, oldUrl: string) => void;
  onError?: (err: unknown, url: string) => boolean | undefined;
  scrollToTop?: boolean;
  syncTitle?: boolean;

  window?: Window & typeof globalThis;
}

export interface AtomNav {
  currentUrl: ReadonlyAtom<string>;
  isPending: ReadonlyAtom<boolean>;
  hasError: ReadonlyAtom<boolean>;
  navigate(url: string, options?: { replace?: boolean }): Promise<void>;
  destroy: () => void;
}

/**
 * Logic: Feedback Loop Protection
 * Prevents recursive update loops between the DOM and reactive Atoms
 * during two-way data flow (e.g., IME composition or rapid input events).
 *
 * @internal
 */
export enum BindingFlags {
  None = 0,
  Focused = 1 << 0,
  Composing = 1 << 1,
  SyncingToAtom = 1 << 2,
  SyncingToDom = 1 << 3,
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

/**
 * Options for jQuery overrides.
 * @public
 */
export interface PatchOptions {
  /**
   * Wraps .on()/.one() in batch() for auto-reactive updates.
   * @default true
   */
  events?: boolean;
  /**
   * Hooks .remove()/.empty()/.detach() for automatic memory management.
   * @default true
   */
  lifecycle?: boolean;
}

/**
 * Configuration options for AEJ.
 * @public
 */
export interface AEJConfig {
  /**
   * jQuery prototype patches.
   * Set to false to disable all patches.
   */
  patch?: boolean | PatchOptions;
  /**
   * Automatic MutationObserver for memory management.
   * Set to false to manage cleanup manually.
   */
  autoCleanup?: boolean | { root: Element | ShadowRoot | DocumentFragment };
}

/**
 * A scoped version of the jQuery selector function.
 * Only supports element selection within the component boundary.
 * @public
 */
export type JQueryScopedSelector = (
  selector: string | JQuery | HTMLElement,
  context?: Element | Document | JQuery | ShadowRoot | DocumentFragment
) => JQuery;

/**
 * Interface representing the features added to a component by AEJ.
 *
 * Provides structured access to the component's root and reactive DI.
 * @public
 */
export interface AtomComponentFeatures {
  /** The raw host element. */
  readonly host: HTMLElement;
  /** The active root node (ShadowRoot or Host). Available after setup(). */
  readonly root: Node | null;
  /**
   * Scoped jQuery selector.
   * Limited to selecting elements within the component's shadowRoot or host.
   */
  readonly $: JQueryScopedSelector;

  /** Registers a reactive provider on this element. */
  provideAtom<T = unknown>(key: string | symbol, val: T): void;
  /** Injects a reactive value from an ancestor. */
  injectAtom<T = unknown>(key: string | symbol): T | null;
}

/**
 * Controller providing AEJ features via composition.
 * @public
 */
export interface AtomComponentController extends AtomComponentFeatures {
  /**
   * Initializes the component's reactive lifecycle.
   * @param shadowRoot - Optional ShadowRoot (required for 'closed' mode components).
   */
  setup(shadowRoot?: ShadowRoot): void;
  /**
   * Tears down reactive bindings.
   * Disconnects observers immediately; actual cleanup is deferred to a microtask.
   */
  teardown(): void;
}

declare global {
  /**
   * Global jQuery namespace extensions (`$`).
   *
   * @public
   */
  interface JQueryStatic {
    /**
     * Creates a writable reactive atom.
     *
     * When to use:
     * - When you need a source of truth for a specific piece of state.
     * - When that state needs to be updated manually (unlike Computeds).
     *
     * @param initialValue - The initial value of the atom.
     * @param options - Configuration options for sync mode, custom equality, or naming.
     * @returns A writable reactive atom.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     * console.log(count.value); // 0
     * count.value++;
     * ```
     */
    atom<T>(initialValue: T, options?: AtomOptions): WritableAtom<T>;
    /**
     * When to use:
     * - When a value needs to be automatically derived from other reactive sources.
     * - To optimize performance by caching expensive calculations.
     *
     * @param fn - The computation function.
     * @param options - Configuration for custom equality or default values.
     * @returns A read-only reactive computed atom.
     *
     * @example
     * ```typescript
     * const count = $.atom(1);
     * const doubled = $.computed(() => count.value * 2);
     *
     * console.log(doubled.value); // 2
     * count.value = 5;
     * console.log(doubled.value); // 10
     * ```
     */
    computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
    computed<T>(
      fn: () => Promise<T>,
      options: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    /**
     * When to use:
     * - To perform side effects (logging, async fetching, DOM updates) in response to state changes.
     * - To synchronize external systems with the reactive state.
     *
     * @param fn - The function to execute. Can return a cleanup function.
     * @param options - Configuration for sync mode or custom error handling.
     * @returns A handle to the created effect for manual control.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     * $.effect(() => {
     *   console.log(`Current count: ${count.value}`);
     *   return () => console.log('Cleanup before next run');
     * });
     *
     * count.value++; // Logs: "Cleanup before next run", "Current count: 1"
     * ```
     */
    effect(
      fn: () => EffectResult,
      options?: import('@but212/atom-effect').EffectOptions
    ): EffectObject;
    /**
     * When to use:
     * - When performing multiple related atom updates that should trigger effects only once.
     * - To improve performance by coalescing multiple updates into a single flush cycle.
     *
     * @param fn - The function containing state updates.
     *
     * @example
     * ```typescript
     * const a = $.atom(0);
     * const b = $.atom(0);
     * $.effect(() => console.log(a.value + b.value));
     *
     * $.batch(() => {
     *   a.value = 1;
     *   b.value = 2;
     * }); // Logs "3" once.
     * ```
     */
    batch(fn: () => void): void;
    /**
     * When to use:
     * - To read reactive state inside an effect without creating a dependency link.
     *
     * @param fn - Function to execute.
     * @returns Result of `fn`.
     *
     * @example
     * ```typescript
     * $.effect(() => {
     *   const val = $.untracked(() => someAtom.value);
     *   console.log('Read without tracking:', val);
     * });
     * ```
     */
    untracked<T>(fn: () => T): T;
    /**
     * Checks if a value is an atom ($).
     *
     * @example
     * ```typescript
     * if ($.isAtom(maybeAtom)) {
     *   console.log(maybeAtom.value);
     * }
     * ```
     */
    isAtom(obj: unknown): obj is WritableAtom<unknown> | ReadonlyAtom<unknown>;
    /**
     * Checks if a value is a Computed atom ($).
     *
     * @example
     * ```typescript
     * if ($.isComputed(maybeAtom)) {
     *   console.log('Derived value detected');
     * }
     * ```
     */
    isComputed(obj: unknown): obj is ComputedAtom<unknown>;
    /**
     * Returns a promise that resolves after the next scheduler flush.
     *
     * @example
     * ```typescript
     * await $.nextTick();
     * ```
     */
    nextTick(): Promise<void>;

    /**
     * Global diagnostic logger for the Atom-Effect library.
     *
     * When to use:
     * - Debugging reactive updates and DOM mutations in real-time.
     * - Inspecting error causes in binding hooks.
     *
     * Logic: Runtime Control
     * Toggle `debug.enabled` at runtime (e.g., via browser console) to
     * activate or deactivate visual instrumentation without a page reload.
     *
     * @example
     * ```typescript
     * $.debug.enabled = true; // Enable visual highlights
     * ```
     *
     * @public
     */
    debug: {
      enabled: boolean;
      warn(prefix: string, message: string, ...rest: unknown[]): void;
      error(prefix: string, message: string, cause: unknown): void;
      domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown): void;
    };

    /**
     * Creates a two-way "lens" for a specific property path via `$.atomLens`.
     *
     * @param atom - The source atom.
     * @param path - Dot-separated path (e.g., 'user.profile.name').
     * @returns A new writable lens atom.
     *
     * @example
     * ```typescript
     * const store = $.atom({ user: { name: 'Alice' } });
     * const nameLens = $.atomLens(store, 'user.name');
     * nameLens.value = 'Bob'; // Updates store
     * ```
     */
    atomLens<T extends object, P extends Paths<T>>(
      atom: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Composes an existing lens with a sub-path via `$.composeLens`.
     *
     * @example
     * ```typescript
     * const userLens = $.atomLens(store, 'user');
     * const nameLens = $.composeLens(userLens, 'name');
     * ```
     */
    composeLens<T extends object, P extends Paths<T>>(
      lens: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Creates a lens factory bound to an atom via `$.lensFor`.
     *
     * @example
     * ```typescript
     * const lensify = $.lensFor(store);
     * const nameLens = lensify('user.name');
     * ```
     */
    lensFor<T extends object>(
      atom: WritableAtom<T>
    ): <P extends Paths<T>>(p: P) => DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Initializes a client-side router for the application.
     *
     * Logic: Reactive Routing
     * Orchestrates URL synchronization, path matching, and dynamic view rendering.
     * Uses atoms to provide reactive access to `currentRoute` and `params`,
     * enabling secondary UI elements to reactively update sidebars or breadcrumbs.
     *
     * Capabilities:
     * - Multi-mode support: 'history' (pushState) or 'hash' for legacy support.
     * - Dynamic matching: High-performance param extraction for named route segments.
     * - Reactive state: Integrated with the core atom system for effortless UI syncing.
     * - Lifecycle hooks: Fine-grained navigation control via `onEnter` and `onLeave`.
     *
     * @example
     * ```typescript
     * const router = $.route({
     *   target: '#app',
     *   routes: {
     *     '/': { template: '#home-tmpl' },
     *     '/user/:id': {
     *       render: (el, name, params) => {
     *         $(el).text(`User Profile: ${params.id}`);
     *       }
     *     }
     *   }
     * });
     * ```
     *
     * @public
     */
    route(config: RouteConfig): Router;

    /**
     * When to use:
     * - Fetching data that depends on other reactive atoms (auto-refetch on dependency change).
     * - Implementing built-in concurrency management (automatic cancellation of stale requests).
     *
     * Logic: Concurrency Control
     * - Uses `AbortController` and `jqXHR.abort()` to ensures that only the result
     *   of the most recent request is reflected in the atom's state.
     * - Discards older, "out-of-order" responses to prevent UI flickering.
     *
     * @param source - A static URL string or a reactive function that returns a URL.
     * @param options - Configuration for default values, custom headers, and response transformation.
     *
     * @returns A computed atom that automatically manages the async lifecycle.
     *
     * @example
     * ```typescript
     * const userId = $.atom(1);
     * const user = $.atomFetch(() => `/api/users/${userId.value}`, {
     *   defaultValue: { name: 'Loading...' },
     *   eager: true
     * });
     *
     * $.effect(() => {
     *   console.log(`Current user: ${user.value.name}`);
     * });
     * ```
     *
     * @public
     */
    atomFetch<T>(
      url: string | (() => string),
      opts: FetchOptions<T>
    ): ComputedAtom<T> & { abort: () => void; dispose(): void };

    /**
     * SPA-style navigation for AJAX-loaded content.
     *
     * When to use:
     * - To implement fragment-based partial page updates without full reload.
     * - When you need automatic cleanup of bindings in the replaced container.
     *
     * @param options - Configuration for target container and navigation hooks.
     *
     * @example
     * const nav = $.atomNav({
     *   target: '#main-content',
     *   onBeforeLoad: (url) => console.log(`Navigating to ${url}`)
     * });
     *
     * @public
     */
    atomNav(options: AtomNavOptions): AtomNav;

    /**
     * Registers an element (or multiple) as a provider for a reactive context.
     *
     * When to use:
     * - When you need to share state (atoms) with deep descendant elements.
     * - To avoid "prop drilling" in complex component hierarchies.
     *
     * @param element - The host element, selector, or JQuery collection.
     * @param key - Unique identifier for the context.
     * @param val - The value (usually an Atom) to be shared.
     *
     * @example
     * const theme = $.atom('dark');
     * $.provideAtom('#app', 'theme', theme);
     *
     * @public
     */
    provideAtom(element: HTMLElement | JQuery | string, key: string | symbol, val: unknown): void;

    /**
     * Injects a reactive context provided by an ancestor element.
     *
     * When to use:
     * - To consume state provided by a parent/ancestor component.
     * - To decouple child components from specific data sources.
     *
     * @param element - The element or selector requesting the context.
     * @param key - The unique identifier of the context to find.
     * @returns The injected value if a provider was found, otherwise `null`.
     *
     * @example
     * const theme = $.injectAtom(this, 'theme');
     * if (theme) {
     *   $(this).atomClass('dark-mode', $.computed(() => theme.value === 'dark'));
     * }
     *
     * @public
     */
    injectAtom<T = unknown>(
      element: HTMLElement | JQuery | string,
      key: string | symbol
    ): ReadonlyAtom<T> | null;

    /**
     * Composition-based helper for AEJ Web Components.
     *
     * When to use:
     * - When adding reactive capabilities to standard Custom Elements.
     * - When you want to avoid 'this' pollution and maintain perfect type safety.
     *
     * @param element - The host element (usually `this`).
     * @returns A controller for managing reactive lifecycle and scoped root.
     *
     * @example
     * class MyComp extends HTMLElement {
     *   // Reason: class field initializers run after super(), so capturing `this` here is valid.
     *   private aej = $.useAtomComponent(this);
     *
     *   connectedCallback() {
     *     this.aej.setup();
     *     this.aej.$('h1').text('Hello AEJ');
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
    useAtomComponent(element: HTMLElement): AtomComponentController;

    /**
     * Initializes Atom-Effect jQuery with the specified configuration.
     * @param config - Configuration options.
     */
    initAEJ(config?: AEJConfig): void;
  }

  /**
   * jQuery Instance Method extensions (`$('...').method()`).
   *
   * @public
   */
  interface JQuery {
    /**
     * When to use:
     * - Rendering raw text that should stay in sync with an atom.
     * - Automatically updating labels, counts, or status messages.
     *
     * @example
     * ```typescript
     * $('.count').atomText(counterAtom, (v) => `Current: ${v}`);
     * ```
     *
     * @public
     */
    atomText<T>(src: AsyncReactiveValue<T>, fmt?: (v: T) => string): this;
    /**
     * Caution: Ensure the source data is trusted. Rendering unsanitized HTML
     * from user input can lead to XSS vulnerabilities.
     *
     * When to use:
     * - Rendering complex markup or rich text that contains formatting tags.
     *
     * @public
     */
    atomHtml(src: AsyncReactiveValue<string>): this;
    /**
     * Reactively toggles CSS classes based on atom conditions.
     *
     * Logic: Supports both single class toggling and batch class management
     * via a mapping object.
     *
     * When to use:
     * - Adding 'active', 'disabled', or 'hidden' states to elements.
     * - Managing complex UI component states with multiple class flags.
     *
     * @example
     * ```typescript
     * // 1. Single class
     * $('.btn').atomClass('is-active', activeAtom);
     *
     * // 2. Class map
     * $('.item').atomClass({
     *   'is-loading': loadingAtom,
     *   'is-hidden': hiddenAtom
     * });
     * ```
     *
     * @public
     */
    atomClass(name: string, cond: AsyncReactiveValue<boolean>): this;
    atomClass(map: Record<string, AsyncReactiveValue<boolean>>): this;
    /**
     * When to use:
     * - Driving visual styles like opacity, width, or color from state.
     * - Dynamic layouts where dimensions depend on reactive calculations.
     *
     * Logic: Normalizes properties and units (e.g., 'px') to ensure
     * consistent style application across browsers.
     *
     * @example
     * ```typescript
     * // 1. Single property
     * $('.bar').atomCss('width', progressAtom, '%');
     *
     * // 2. Property map
     * $('.box').atomCss({
     *    opacity: opacityAtom,
     *    backgroundColor: colorAtom
     * });
     * ```
     *
     * @public
     */
    atomCss(prop: string, src: AsyncReactiveValue<string | number>, unit?: string): this;
    atomCss(map: CssBindings): this;
    /**
     * Reactively updates DOM attributes based on atom changes.
     *
     * When to use:
     * - Updating `id`, `title`, `alt`, or `data-*` attributes.
     *
     * @public
     */
    atomAttr(name: string, src: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(map: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    /**
     * Reactively updates DOM properties (e.g., `disabled`, `readOnly`).
     *
     * When to use:
     * - Toggling stateful properties that require boolean values or direct property access.
     *
     * @public
     */
    atomProp<T>(name: string, src: AsyncReactiveValue<T>): this;
    atomProp(map: Record<string, AsyncReactiveValue<unknown>>): this;
    /**
     * Toggles visibility (`display: none`) when the condition is true.
     *
     * @public
     */
    atomShow(cond: AsyncReactiveValue<boolean>): this;
    /**
     * Hides the element (`display: none`) when the condition is true.
     *
     * @public
     */
    atomHide(cond: AsyncReactiveValue<boolean>): this;

    /**
     * Two-way binding for form input values.
     *
     * Logic: Automatically synchronizes the input's `value` with a writable
     * atom, handling both atom-to-DOM updates and DOM-to-atom changes.
     *
     * When to use:
     * - Handling text inputs, textareas, and select menus.
     *
     * @public
     */
    atomVal<T>(atom: WritableAtom<T>, opts?: ValOptions<T>): this;

    /**
     * Two-way binding for checkboxes and radio buttons.
     *
     * @public
     */
    atomChecked(atom: WritableAtom<boolean>): this;

    /**
     * Orchestrates two-way binding for an entire form.
     *
     * Logic: Maps form fields (via `name` attributes) to nested properties
     * of a reactive object atom.
     *
     * When to use:
     * - Synchronizing a complex data model with a standard HTML form.
     *
     * @public
     */
    atomForm<T extends object>(atom: WritableAtom<T>, opts?: FormOptions<T>): this;

    /**
     * Configures a standard event listener with automatic lifecycle cleanup.
     *
     * @public
     */
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    /**
     * Unified entry point for declaring multiple reactive bindings in a single call.
     *
     * Logic: Iterates through the provided options and executes the
     * corresponding tasks in a deterministic order (e.g., text before class).
     *
     * When to use:
     * - Initializing multiple bindings on an element efficiently.
     *
     * @example
     * ```typescript
     * $('.btn').atomBind({
     *   text: labelAtom,
     *   class: { 'is-primary': primaryAtom },
     *   on: { click: handleClick }
     * });
     * ```
     *
     * @public
     */
    atomBind<T = unknown>(opts: BindingOptions<T>): this;

    /**
     * Logic: Orchestrates the synchronization between a reactive data source and
     * the DOM tree. It manages a persistent `ListContext` for diffing.
     *
     * Optimization:
     * - Employs a double-ended diffing algorithm to minimize DOM manipulations.
     * - Uses sanitized batch-rendering for optimized cold-start performance.
     *
     * @example
     * ```typescript
     * $('#my-list').atomList(itemsAtom, {
     *   key: 'id',
     *   render: (item) => `<li>${item.name}</li>`
     * });
     * ```
     *
     * @public
     */
    atomList<T>(src: ReadonlyAtom<T[]>, opts: ListOptions<T>): this;

    /**
     * Logic: Lifecycle Orchestration
     * Handles automatic teardown of existing bindings, isolated component
     * execution within a safe reactive window, and registration of
     * teardown hooks in the global registry.
     *
     * @example
     * ```typescript
     * const MyCounter = ($el, props) => {
     *   const count = atom(0);
     *   effect(() => $el.text(`${props.title}: ${count.value}`));
     *   return () => console.log('Cleanup');
     * };
     *
     * $('.host').atomMount(MyCounter, { title: 'Clicks' });
     * ```
     *
     * @public
     */
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    /**
     * Manually triggers the teardown phase for the component and all nested bindings.
     *
     * @public
     */
    atomUnmount(): this;

    /**
     * Manually destroys all reactive bindings associated with the collection.
     *
     * @public
     */
    atomUnbind(): this;
  }
}

export type { ComputedAtom, ComputedOptions, EffectObject, ReadonlyAtom, WritableAtom };
