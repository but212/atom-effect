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

/** A function that performs cleanup tasks for a reactive effect or component. */
export type EffectCleanup = () => void;

/** Represents the unmounting phase of a component's lifecycle. */
export interface ComponentLifecycle {
  /** Cleanup task executed during the unmount phase. */
  unmount: EffectCleanup;
}

/** The result of a reactive effect function, which may include cleanup logic. */
export type EffectResult = undefined | EffectCleanup | ComponentLifecycle;

/** A function used to determine equality between two reactive values. */
export type EqualFn<T> = (a: T, b: T) => boolean;

/**
 * Configuration options for creating reactive atoms.
 *
 * @public
 */
export interface AtomOptions extends BaseAtomOptions {
  /** Optional name for debugging and diagnostic purposes. */
  name?: string;
  /** Whether to trigger updates synchronously. Default is false (batched). */
  sync?: boolean;
}

/**
 * A value that can be a static literal, a reactive atom, or a getter function.
 *
 * Logic: Polymorphic Input
 * Supports raw values for static initialization, reactive atoms for state-driven
 * updates, or functional getters for deferred execution of complex logic.
 *
 * @public
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);

/**
 * A value that can be a static literal, a reactive atom, a promise, or a getter
 * function that returns any of these.
 *
 * When to use:
 * - CSS or Attribute bindings that require data from an asynchronous source.
 * - Integration with fetch-based reactive atoms where values resolve over time.
 *
 * @public
 */
export type AsyncReactiveValue<T> =
  | T
  | ReadonlyAtom<T | Promise<T>>
  | Promise<T>
  | (() => T | Promise<T>);

/** Supported primitive types for attribute and property bindings. */
export type PrimitiveValue = string | number | boolean | null | undefined;

/** A CSS property value or a tuple containing a value and its unit (e.g., [10, 'px']). */
export type CssValue =
  | AsyncReactiveValue<string | number>
  | [source: AsyncReactiveValue<number>, unit: string];

/** A mapping of CSS property names to their reactive values. */
export type CssBindings = Record<string, CssValue>;

/**
 * Declaration of reactive bindings for a DOM element.
 *
 * Logic: Binding Strategy Map
 * Maps reactive sources to specific DOM manipulation strategies (text, class,
 * val, etc.). This declarative structure allows the engine to batch updates
 * and optimize resource cleanup automatically.
 *
 * @public
 */
export interface BindingOptions<T = unknown> {
  /** Binds the element's text content. Can include an optional formatter. */
  text?:
    | AsyncReactiveValue<unknown>
    | [source: AsyncReactiveValue<unknown>, formatter: (v: unknown) => string];
  /** Binds the element's inner HTML. Use with caution for untrusted content. */
  html?: AsyncReactiveValue<string>;
  /** Toggles CSS classes based on reactive conditions. */
  class?: Record<string, AsyncReactiveValue<boolean>>;
  /** Binds CSS styles reactively. */
  css?: CssBindings;
  /** Binds HTML attributes reactively. */
  attr?: Record<string, AsyncReactiveValue<PrimitiveValue>>;
  /** Binds DOM properties reactively. */
  prop?: Record<string, AsyncReactiveValue<unknown>>;
  /** Toggles element visibility (`display: block/none`) based on a condition. */
  show?: AsyncReactiveValue<boolean>;
  /** Hides the element (`display: none`) when the condition is true. */
  hide?: AsyncReactiveValue<boolean>;
  /** Two-way binding for form input values. */
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  /** Two-way binding for checkbox and radio checked states. */
  checked?: WritableAtom<boolean>;
  /** Orchestrates two-way bindings for an entire form element. */
  form?:
    | WritableAtom<T extends object ? T : unknown>
    | [
        atom: WritableAtom<T extends object ? T : unknown>,
        options: FormOptions<T extends object ? T : unknown>,
      ];
  /** Registers event listeners with automatic lifecycle management. */
  on?: Record<string, (e: JQuery.Event) => void>;
}

/** A writable atom that includes an explicit disposal mechanism. @internal */
export interface DisposableWritableAtom<T> extends WritableAtom<T> {
  /** Releases all reactive resources and observers associated with the atom. */
  dispose(): void;
}

/** Supported key types for identifying items in a reactive list. */
export type ListKey = string | number;

/** Valid return types for a list item render function. */
export type ListRenderResult = string | Element | DocumentFragment | JQuery;

/** A function that extracts a unique identity key from a list item. */
export type ListKeyFn<T> = (item: T, index: number) => ListKey;

/**
 * Configuration options for reactive list rendering.
 *
 * Optimization: DOM Reconciliation
 * Uses unique keys for identity tracking to minimize DOM churn by reordering
 * existing elements instead of re-rendering the entire list when data changes.
 *
 * @public
 */
export interface ListOptions<T> {
  /** The property name or function used to extract unique keys. */
  key: keyof T | ListKeyFn<T>;
  /** Function to generate the DOM representation for an item. */
  render: (item: T, index: number) => ListRenderResult;
  /** Optional callback to apply bindings to the rendered element. */
  bind?: ($el: JQuery, item: T, index: number) => void;
  /** Optional callback triggered when an item's data is updated. */
  update?: ($el: JQuery, item: T, index: number) => void;
  /** Callback triggered when a new element is added to the list. */
  onAdd?: ($el: JQuery) => void;
  /** Callback triggered when an element is removed (can be used for transitions). */
  onRemove?: ($el: JQuery) => Promise<void> | void;
  /** Content to display when the list is empty. */
  empty?: ListRenderResult;
  /** Event handlers bound to individual list items. */
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  /** Optional function for custom item equality checks. */
  isEqual?: (a: T, b: T) => boolean;
}

/** Options for customizing two-way value bindings. */
export interface ValOptions<T> {
  /** Time in milliseconds to delay atom synchronization after user input. */
  debounce?: number;
  /** The DOM event used to trigger synchronization (e.g., 'change'). */
  event?: string;
  /** Function to parse the DOM string value into the atom's type. */
  parse?: (v: string) => T;
  /** Function to format the atom's value for DOM display. */
  format?: (v: T) => string;
  /** Function for custom value equality checks. */
  equal?: EqualFn<T>;
}

/** Options for orchestrating form-wide reactive synchronization. */
export interface FormOptions<T> extends ValOptions<T> {
  /** Function to transform field values based on their object path before synchronization. */
  transform?: (path: string, value: unknown) => unknown;
  /** Callback triggered whenever any field in the form changes. */
  onChange?: (path: string, value: unknown) => void;
}

/** Configuration for reactive AJAX requests. */
export interface FetchOptions<T> {
  /** The value returned while the request is pending or if it fails. */
  defaultValue: T;
  /** Optional name for debugging and diagnostic logging. */
  name?: string;
  /** HTTP method to use for the request. */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});
  /** Custom HTTP headers to include in the request. */
  headers?: Record<string, string>;
  /** Function to transform the raw response before it is stored in the atom. */
  transform?: (raw: unknown, xhr: JQuery.jqXHR) => T;
  /** Direct overrides for the underlying jQuery AJAX settings. */
  ajaxOptions?: JQuery.AjaxSettings | (() => JQuery.AjaxSettings);
  /** Callback triggered when the request fails. */
  onError?: (err: unknown) => void;
  /** Whether to trigger the initial request immediately upon creation. */
  eager?: boolean;
}

/** An error object containing the source jqXHR for diagnostic purposes. */
export interface FetchError extends Error {
  /** The underlying jQuery XHR object that caused the error. */
  jqXHR?: JQuery.jqXHR;
}

/** Definition for a mountable component that manages its own reactive lifecycle. */
export type ComponentFn<P = Record<string, unknown>> = ($el: JQuery, props: P) => EffectResult;

/** Lifecycle hooks for navigating between application routes. */
export interface RouteLifecycle {
  /**
   * Hook triggered before entering a route.
   * Returning false aborts the navigation.
   */
  onEnter?: (
    params: Record<string, string>,
    router: Router
  ) => Record<string, string> | undefined | false;
  /**
   * Hook triggered before leaving the current route.
   * Returning false prevents navigation away.
   */
  onLeave?: (router: Router) => boolean | undefined;
  /** Optional document title for the route. */
  title?: string;
}

/** Definition of a specific application route and its rendering logic. */
export interface RouteDefinition extends RouteLifecycle {
  /** Selector for a template fragment to be cloned and rendered. */
  template?: string;
  /** Custom function to render the route content into the container. */
  render?: (
    container: HTMLElement,
    route: string,
    params: Record<string, string>,
    onUnmount: (cleanupFn: () => void) => void,
    router: Router
  ) => void;
  /** Callback triggered after the route content has been mounted to the DOM. */
  onMount?: ($content: JQuery, onUnmount: (cleanupFn: () => void) => void, router: Router) => void;
}

/** Global configuration for the reactive router. */
export interface RouteConfig {
  /** The root element or selector where route content will be injected. */
  target: string | JQuery<HTMLElement> | HTMLElement;
  /** The default path to navigate to if no route matches. */
  default?: string;
  /** Mapping of path patterns to route definitions. */
  routes?: Record<string, RouteDefinition>;
  /** Synchronization mode: 'hash' or HTML5 'history' API. */
  mode?: 'hash' | 'history';
  /** Base path for the application (useful for history mode). */
  basePath?: string;
  /** Path to navigate to when a requested route is not found. */
  notFound?: string;
  /** Whether to automatically intercept and route link clicks. */
  autoBindLinks?: boolean;
  /** CSS class applied to navigation elements matching the active route. */
  activeClass?: string;
  /** Callback triggered immediately before a navigation transition starts. */
  beforeTransition?: (from: string, to: string) => void;
  /** Callback triggered after a navigation transition has completed. */
  afterTransition?: (from: string, to: string) => void;
}

/** Interface for programmatically interacting with the application router. */
export interface Router {
  /** Reactive atom containing the current route name. */
  currentRoute: ReadonlyAtom<string>;
  /** Reactive atom containing the current query string parameters. */
  queryParams: ReadonlyAtom<Record<string, string>>;
  /** Reactive atom containing the extracted path parameters. */
  params: ReadonlyAtom<Record<string, string>>;
  /** Programmatically navigates to the specified path. */
  navigate: (route: string) => void;
  /** Shuts down the router and releases all observers. */
  destroy: () => void;
}

/** Options for AJAX-based fragment navigation. */
export interface AtomNavOptions {
  /** The target container for injected content. */
  target: string | JQuery<HTMLElement> | HTMLElement;
  /** Optional sub-selector to extract from the loaded document. */
  selector?: string;
  /** Custom HTTP headers for navigation requests. */
  headers?: Record<string, string>;
  /** Hook triggered before a navigation request is initiated. */
  onBeforeLoad?: (url: string) => boolean | undefined | Promise<boolean | undefined>;
  /** Callback triggered after the content has been injected. */
  onMount?: ($container: JQuery, url: string) => void;
  /** Callback triggered before content is replaced. */
  onUnmount?: ($container: JQuery, oldUrl: string) => void;
  /** Callback for handling navigation errors. */
  onError?: (err: unknown, url: string) => boolean | undefined;
  /** Whether to reset scroll position to the top after navigation. */
  scrollToTop?: boolean;
  /** Whether to synchronize the document title with the loaded page. */
  syncTitle?: boolean;
  /** Optional window context for cross-origin navigation. */
  window?: Window & typeof globalThis;
}

/** Interface for managing AJAX fragment navigation. */
export interface AtomNav {
  /** Reactive atom containing the currently loaded URL. */
  currentUrl: ReadonlyAtom<string>;
  /** Reactive atom indicating whether a navigation request is in progress. */
  isPending: ReadonlyAtom<boolean>;
  /** Reactive atom indicating whether the last navigation failed. */
  hasError: ReadonlyAtom<boolean>;
  /** Navigates to a specific URL and replaces the container content. */
  navigate(url: string, options?: { replace?: boolean }): Promise<void>;
  /** Disposes of the navigation manager and observers. */
  destroy: () => void;
}

/**
 * Internal state flags for two-way bindings.
 *
 * Logic: Feedback Loop Protection
 * Prevents recursive update loops between the DOM and reactive atoms
 * during two-way data flow (e.g., IME composition or rapid input events).
 *
 * @internal
 */
export enum BindingFlags {
  /** No active synchronization or interaction. */
  None = 0,
  /** The input element is currently focused by the user. */
  Focused = 1 << 0,
  /** The user is currently performing IME composition. */
  Composing = 1 << 1,
  /** Synchronization from DOM to Atom is currently active. */
  SyncingToAtom = 1 << 2,
  /** Synchronization from Atom to DOM is currently active. */
  SyncingToDom = 1 << 3,
  /** The binding is considered busy and will ignore external updates. */
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

/**
 * Options for customizing jQuery core method overrides.
 *
 * @public
 */
export interface PatchOptions {
  /**
   * Automatically wraps .on()/.one() callbacks in $.batch() for reactivity.
   * @default true
   */
  events?: boolean;
  /**
   * Hooks .remove()/.empty()/.detach() for automatic resource cleanup.
   * @default true
   */
  lifecycle?: boolean;
}

/**
 * Global configuration settings for the library.
 *
 * @public
 */
export interface AEJConfig {
  /**
   * Configuration for jQuery prototype patches.
   * Set to false to disable all automated overrides.
   */
  patch?: boolean | PatchOptions;
  /**
   * Configuration for the automated MutationObserver cleanup system.
   * Set to false to manage reactive resource disposal manually.
   */
  autoCleanup?: boolean | { root: Element | ShadowRoot | DocumentFragment };
}

/**
 * A scoped version of the jQuery selector function.
 *
 * Logic: Scope Enforcement
 * Restricts element selection to the component's internal DOM tree (ShadowRoot
 * or host container) to ensure encapsulation and prevent cross-component leaks.
 *
 * @public
 */
export type JQueryScopedSelector = (
  selector: string | JQuery | HTMLElement,
  context?: Element | Document | JQuery | ShadowRoot | DocumentFragment
) => JQuery;

/**
 * Interface representing the reactive capabilities injected into a component.
 *
 * @public
 */
export interface AtomComponentFeatures {
  /** The raw host element of the component. */
  readonly host: HTMLElement;
  /** The active root node (ShadowRoot or Host container). */
  readonly root: Node | null;
  /**
   * Scoped jQuery selector.
   * Limited to selecting elements within the component's encapsulated DOM.
   */
  readonly $: JQueryScopedSelector;

  /** Registers a reactive provider on this element for dependency injection. */
  provideAtom<T = unknown>(key: string | symbol, val: T): void;
  /** Injects a reactive value provided by an ancestor element. */
  injectAtom<T = unknown>(key: string | symbol): WritableAtom<T> | null;
}

/**
 * Composition-based controller for managing a component's reactive lifecycle.
 *
 * @public
 */
export interface AtomComponentController extends AtomComponentFeatures {
  /**
   * Reactive atoms synchronized with observed HTML attributes.
   * Includes only attributes defined in the static `observedAttributes` array.
   */
  readonly attrs: Record<string, WritableAtom<string | null>>;

  /**
   * Initializes the component's reactive lifecycle and observers.
   * @param shadowRoot - Optional ShadowRoot context for 'closed' mode components.
   */
  setup(shadowRoot?: ShadowRoot): void;
  /**
   * Tears down all reactive bindings and observers.
   * Disconnects observers immediately; actual cleanup is deferred to a microtask.
   */
  teardown(): void;
}

declare global {
  /**
   * Extensions to the global jQuery object ($).
   *
   * @public
   */
  interface JQueryStatic {
    /**
     * Creates a writable reactive atom.
     *
     * When to use:
     * - When you need a source of truth for a specific piece of application state.
     * - When state needs to be updated manually in response to user actions.
     *
     * @param initialValue - The initial state value.
     * @param options - Configuration for sync mode, custom equality, or naming.
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
     * Creates a read-only atom that derives its value from other reactive sources.
     *
     * When to use:
     * - When a value needs to be automatically calculated based on other atoms.
     * - To optimize performance by caching expensive derived results.
     *
     * @param fn - The calculation function.
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
     * Registers a side effect that automatically re-runs when its dependencies change.
     *
     * When to use:
     * - To perform logging, data fetching, or manual DOM updates in response to state changes.
     * - To synchronize external systems (e.g., local storage) with the reactive state.
     *
     * @param fn - The function to execute. Can return a cleanup callback.
     * @param options - Configuration for sync mode or error handling.
     * @returns A handle for manual control or disposal of the effect.
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
     * Executes multiple state updates in a single atomic cycle.
     *
     * When to use:
     * - When performing multiple related atom updates to prevent redundant effect triggers.
     *
     * @param fn - Function containing multiple atom updates.
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
     * Reads a reactive value without creating a dependency relationship.
     *
     * When to use:
     * - To access reactive state inside an effect without causing the effect to re-run.
     *
     * @param fn - Function to execute in untracked mode.
     * @returns The result of the function.
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
     * Determines if a value is a reactive atom.
     *
     * @param obj - The value to check.
     * @returns True if the value is an atom.
     */
    isAtom(obj: unknown): obj is WritableAtom<unknown> | ReadonlyAtom<unknown>;
    /**
     * Determines if a value is a derived computed atom.
     *
     * @param obj - The value to check.
     * @returns True if the value is a computed atom.
     */
    isComputed(obj: unknown): obj is ComputedAtom<unknown>;
    /**
     * Returns a promise that resolves after the next reactive scheduler cycle.
     *
     * @returns A promise resolving on the next tick.
     */
    nextTick(): Promise<void>;

    /**
     * Global diagnostic system for inspecting reactive behavior.
     *
     * When to use:
     * - Debugging reactive updates and DOM mutations in real-time.
     * - Inspecting error causes and call stacks in binding hooks.
     *
     * Logic: Runtime Control
     * Toggle `debug.enabled` at runtime (e.g., via the browser console) to
     * activate visual instrumentation without requiring a page reload.
     *
     * @example
     * ```typescript
     * $.debug.enabled = true; // Activate visual highlights
     * ```
     *
     * @public
     */
    debug: {
      /** Whether diagnostic logging and visual highlighting are active. */
      enabled: boolean;
      /** Logs a diagnostic warning message. */
      warn(prefix: string, message: string, ...rest: unknown[]): void;
      /** Logs a diagnostic error and its cause. */
      error(prefix: string, message: string, cause: unknown): void;
      /** Logs a DOM mutation and triggers a visual highlight on the target. */
      domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown): void;
    };

    /**
     * Creates a two-way reactive proxy for a nested property path.
     *
     * @param atom - The source atom.
     * @param path - Dot-separated path to the property (e.g., 'user.name').
     * @returns A new writable lens atom.
     *
     * @example
     * ```typescript
     * const store = $.atom({ user: { name: 'Alice' } });
     * const nameLens = $.atomLens(store, 'user.name');
     * nameLens.value = 'Bob'; // Updates the original store
     * ```
     */
    atomLens<T extends object, P extends Paths<T>>(
      atom: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Composes an existing lens with a sub-path.
     *
     * @param lens - The parent lens atom.
     * @param path - Sub-path relative to the lens.
     * @returns A new writable lens atom.
     */
    composeLens<T extends object, P extends Paths<T>>(
      lens: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Creates a lens factory bound to a specific source atom.
     *
     * @param atom - The source atom.
     * @returns A function that generates lenses for the atom's paths.
     */
    lensFor<T extends object>(
      atom: WritableAtom<T>
    ): <P extends Paths<T>>(p: P) => DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Initializes a client-side router for the application.
     *
     * Logic: Reactive Routing
     * Orchestrates URL synchronization, path matching, and dynamic view
     * rendering. Uses atoms to provide reactive access to route state,
     * enabling effortless synchronization of UI elements like breadcrumbs.
     *
     * Capabilities:
     * - Multi-mode support: HTML5 'history' or fragment 'hash' for legacy environments.
     * - Dynamic matching: High-performance parameter extraction for named path segments.
     * - Lifecycle hooks: Fine-grained navigation control via entry/exit guards.
     *
     * @param config - Router configuration settings.
     * @returns A router instance for programmatic navigation.
     *
     * @example
     * ```typescript
     * const router = $.route({
     *   target: '#viewport',
     *   routes: {
     *     '/': { template: '#home-tmpl' },
     *     '/profile/:id': {
     *       render: (el, name, params) => {
     *         $(el).text(`ID: ${params.id}`);
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
     * Creates a computed atom that manages an asynchronous AJAX lifecycle.
     *
     * Logic: Concurrency Control
     * - Uses `AbortController` and `jqXHR.abort()` to ensures that only the
     *   result of the most recent request is reflected in the atom's state.
     * - Discards older, "out-of-order" responses to prevent UI flickering
     *   and data race conditions.
     *
     * When to use:
     * - Fetching data that depends on other reactive atoms.
     * - Implementing automatic refetching and request cancellation.
     *
     * @param source - A static URL or a reactive function returning a URL.
     * @param opts - Fetch configuration and response transformation.
     * @returns A computed atom with abort and disposal capabilities.
     *
     * @example
     * ```typescript
     * const userId = $.atom(1);
     * const user = $.atomFetch(() => `/api/users/${userId.value}`, {
     *   defaultValue: { name: 'Loading...' },
     *   eager: true
     * });
     * ```
     *
     * @public
     */
    atomFetch<T>(
      url: string | (() => string),
      opts: FetchOptions<T>
    ): ComputedAtom<T> & {
      /** Aborts the currently active request. */
      abort: () => void;
      /** Releases all reactive resources and aborts pending requests. */
      dispose(): void;
    };

    /**
     * Initializes fragment-based SPA navigation.
     *
     * When to use:
     * - To implement partial page updates via AJAX without full reloads.
     * - When automatic cleanup of bindings in replaced containers is required.
     *
     * @param options - Navigation configuration.
     * @returns An interface for managing fragment navigation.
     *
     * @public
     */
    atomNav(options: AtomNavOptions): AtomNav;

    /**
     * Registers a reactive context value at a specific DOM root.
     *
     * Logic: Dependency Injection
     * - Shares state with deep descendant elements without prop drilling.
     * - Automatically exposes provided values as CSS variables (`--aej-[key]`).
     * - Uses a global versioning system to trigger re-discovery when nodes move.
     *
     * @param element - The host element, selector, or collection acting as provider.
     * @param key - Unique identifier for the context (string or symbol).
     * @param val - The value to share. Atoms are wrapped in reactive proxies.
     *
     * @example
     * ```typescript
     * const theme = $.atom('dark');
     * $.provideAtom('#app', 'theme', theme);
     * ```
     *
     * @public
     */
    provideAtom(element: HTMLElement | JQuery | string, key: string | symbol, val: unknown): void;

    /**
     * Injects a reactive context provided by an ancestor element.
     *
     * Logic: Hybrid Discovery
     * Consumes state from ancestors without direct coupling. Returns a proxy
     * that automatically re-discovers providers if the element is moved within
     * the DOM hierarchy.
     *
     * @param element - The element or selector requesting the context.
     * @param key - The unique identifier of the context to locate.
     * @returns A reactive proxy atom or null if no provider is found.
     *
     * @public
     */
    injectAtom<T = unknown>(
      element: HTMLElement | JQuery | string,
      key: string | symbol
    ): WritableAtom<T> | null;

    /**
     * Composition-based helper for building reactive Web Components.
     *
     * When to use:
     * - When building standard Custom Elements that require reactive state and DI.
     * - To simplify mapping between HTML attributes and reactive atoms.
     *
     * @param element - The host Custom Element (usually `this`).
     * @returns A controller for managing the component's reactive lifecycle.
     *
     * @example
     * ```typescript
     * class MyComponent extends HTMLElement {
     *   private aej = $.useAtomComponent(this);
     *   connectedCallback() {
     *     this.aej.setup();
     *     // ... setup bindings
     *   }
     *   disconnectedCallback() {
     *     this.aej.teardown();
     *   }
     * }
     * ```
     *
     * @public
     */
    useAtomComponent(element: HTMLElement): AtomComponentController;

    /**
     * Initializes the Atom-Effect jQuery library with custom settings.
     *
     * @param config - Global configuration for patches and cleanup observers.
     */
    initAEJ(config?: AEJConfig): void;
  }

  /**
   * Extensions to the jQuery instance object (fn).
   *
   * @public
   */
  interface JQuery {
    /**
     * Reactively synchronizes the element's text content.
     *
     * When to use:
     * - Rendering labels, status messages, or counters that track state.
     *
     * @param src - The reactive source value.
     * @param fmt - Optional function to format the value for display.
     * @returns The original jQuery collection.
     *
     * @example
     * ```typescript
     * $('.status').atomText(isOnline, (v) => v ? 'Online' : 'Offline');
     * ```
     */
    atomText<T>(src: AsyncReactiveValue<T>, fmt?: (v: T) => string): this;
    /**
     * Reactively synchronizes the element's inner HTML.
     *
     * Caution: Security Risk
     * Rendering unsanitized HTML from user input can lead to XSS attacks.
     * Always ensure the source data is trusted or sanitized.
     *
     * @param src - The reactive source for the HTML content.
     * @returns The original jQuery collection.
     */
    atomHtml(src: AsyncReactiveValue<string>): this;
    /**
     * Toggles CSS classes based on reactive conditions.
     *
     * Logic: Supports both individual class toggling and batch management
     * via mapping objects.
     *
     * @example
     * ```typescript
     * $('.btn').atomClass('is-active', isActive);
     * $('.card').atomClass({ 'is-hidden': isHidden, 'is-loading': isLoading });
     * ```
     */
    atomClass(name: string, cond: AsyncReactiveValue<boolean>): this;
    atomClass(map: Record<string, AsyncReactiveValue<boolean>>): this;
    /**
     * Reactively synchronizes CSS styles.
     *
     * Logic: Normalizes property names and units (e.g., 'px') to ensure
     * cross-browser consistency for dynamic layouts.
     *
     * @example
     * ```typescript
     * $('.box').atomCss('width', progress, '%');
     * $('.overlay').atomCss({ opacity: transparency });
     * ```
     */
    atomCss(prop: string, src: AsyncReactiveValue<string | number>, unit?: string): this;
    atomCss(map: CssBindings): this;
    /**
     * Reactively synchronizes HTML attributes.
     *
     * When to use:
     * - Updating `id`, `title`, `alt`, or `aria-*` attributes.
     *
     * @example
     * ```typescript
     * $('.icon').atomAttr('title', tooltipAtom);
     * ```
     */
    atomAttr(name: string, src: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(map: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    /**
     * Reactively synchronizes DOM properties (e.g., `disabled`, `checked`).
     *
     * When to use:
     * - Toggling stateful properties that require boolean values or direct access.
     */
    atomProp<T>(name: string, src: AsyncReactiveValue<T>): this;
    atomProp(map: Record<string, AsyncReactiveValue<unknown>>): this;
    /**
     * Shows the element (`display: block/initial`) when the condition is true.
     *
     * @param cond - Reactive condition for visibility.
     */
    atomShow(cond: AsyncReactiveValue<boolean>): this;
    /**
     * Hides the element (`display: none`) when the condition is true.
     *
     * @param cond - Reactive condition for hiding.
     */
    atomHide(cond: AsyncReactiveValue<boolean>): this;

    /**
     * Establishes a two-way binding for form input values.
     *
     * Logic: Synchronization Engine
     * Automatically coordinates updates between the DOM's `value` and a
     * writable atom, handling cursor stability and IME composition.
     *
     * @param atom - The writable atom to synchronize with.
     * @param opts - Configuration for debouncing, parsing, and formatting.
     */
    atomVal<T>(atom: WritableAtom<T>, opts?: ValOptions<T>): this;

    /**
     * Establishes a two-way binding for checkboxes and radio buttons.
     *
     * @param atom - The writable atom to synchronize with.
     */
    atomChecked(atom: WritableAtom<boolean>): this;

    /**
     * Orchestrates two-way bindings for an entire form element.
     *
     * Logic: Path Mapping
     * Maps form field `name` attributes to nested properties of a reactive
     * object atom, allowing for efficient synchronization of complex models.
     *
     * @param atom - The writable atom containing the form data object.
     * @param opts - Configuration for transformation and change callbacks.
     */
    atomForm<T extends object>(atom: WritableAtom<T>, opts?: FormOptions<T>): this;

    /**
     * Registers an event listener with automatic lifecycle cleanup.
     *
     * @param event - The event name to listen for.
     * @param handler - The event handler function.
     */
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    /**
     * Entry point for declaring multiple reactive bindings in a single call.
     *
     * Logic: Batch Initialization
     * Iterates through the provided options and executes the corresponding
     * binding logic in a deterministic order for optimal performance.
     *
     * @param opts - A mapping of binding types to their reactive sources.
     */
    atomBind<T = unknown>(opts: BindingOptions<T>): this;

    /**
     * Synchronizes a reactive data source with a list of DOM elements.
     *
     * Logic: List Reconciliation
     * Employs a double-ended diffing algorithm to minimize DOM manipulations
     * by identifying moves, additions, and deletions via unique keys.
     *
     * @param src - The read-only atom containing the source array.
     * @param opts - Configuration for rendering, key extraction, and animations.
     */
    atomList<T>(src: ReadonlyAtom<T[]>, opts: ListOptions<T>): this;

    /**
     * Mounts a reactive component and manages its isolated lifecycle.
     *
     * Logic: Component Sandbox
     * Handles automatic teardown of existing content, isolated component
     * execution, and registration of cleanup hooks in the global registry.
     *
     * @param comp - The component function to mount.
     * @param props - Properties to pass to the component.
     */
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    /**
     * Manually triggers the teardown phase for the component and its bindings.
     *
     * @returns The original jQuery collection.
     */
    atomUnmount(): this;

    /**
     * Manually destroys all reactive bindings associated with the elements.
     *
     * @returns The original jQuery collection.
     */
    atomUnbind(): this;
  }
}

export type { ComputedAtom, ComputedOptions, EffectObject, ReadonlyAtom, WritableAtom };
