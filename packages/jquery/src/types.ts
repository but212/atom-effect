/**
 * @module AEJReactiveTypes
 *
 * Responsibility:
 * Defines the core type system for reactive JQuery bindings, including lifecycle
 * hooks, polymorphic inputs, and component specifications.
 *
 * Design Intent:
 * Provides a type-safe interface for declarative DOM manipulation while
 * ensuring compatibility with the underlying atom-effect core.
 */

import type {
  AtomOptions as BaseAtomOptions,
  EffectCleanup,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

/**
 * Role: Lifecycle Teardown
 * Encapsulates cleanup logic executed during the unmount phase.
 */
export interface ComponentLifecycle {
  /** Task to release resources, observers, or listeners. */
  unmount: EffectCleanup;
}

/** The result of a reactive effect function, which may include cleanup logic. */
export type EffectResult = undefined | EffectCleanup | ComponentLifecycle;

/**
 * Logic: Equality Comparison
 * Used to optimize reactivity by preventing updates when values are
 * logically equivalent, even if object references have changed.
 */
export type EqualFn<T> = (first: T, second: T) => boolean;

/**
 * Configuration options for creating reactive atoms.
 *
 * When to use:
 * - When creating a new state atom that requires a name for diagnostics
 *   or specific update scheduling (sync vs batched).
 *
 * @public
 * @example
 * const count = atom(0, { name: 'counter', sync: true });
 */
export type AtomOptions<T = unknown> = BaseAtomOptions<T>;

/**
 * Logic: Polymorphic Input
 * Supports raw values for static initialization, reactive atoms for state-driven
 * updates, or functional getters for deferred execution of complex logic.
 *
 * When to use:
 * - In component props or binding options where the input source is uncertain.
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

/**
 * Reason: Unit Standardization
 * Tuples allow for reactive numeric values to be automatically suffixed
 * with a unit string (e.g., 'px', '%') during DOM synchronization.
 */
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
 * @example
 * // Single element binding
 * $('#user-card').bind({
 *   text: [nameAtom, (v) => `Hello, ${v}`],
 *   class: { 'is-active': isActiveAtom },
 *   css: { color: themeColorAtom },
 *   on: { click: () => console.log('Clicked!') }
 * });
 */
/** @internal */
export type UnwrapAsyncReactiveValue<T> =
  T extends ReadonlyAtom<infer U>
    ? U extends Promise<infer P>
      ? P
      : U
    : T extends Promise<infer U>
      ? U
      : T extends () => infer U
        ? U extends Promise<infer P>
          ? P
          : U
        : T;

export interface BindingOptions<T = unknown, TText = unknown> {
  /** Binds the element's text content. Can include an optional formatter. */
  text?:
    | TText
    | [
        source: TText,
        formatter?: ((v: UnwrapAsyncReactiveValue<TText>) => string) | null | undefined,
      ];
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
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options?: ValOptions<T> | null | undefined];
  /** Two-way binding for checkbox and radio checked states. */
  checked?: WritableAtom<boolean>;
  /** Orchestrates two-way bindings for an entire form element. */
  form?:
    | WritableAtom<T extends object ? T : unknown>
    | WritableAtom<unknown>[]
    | [
        atom: WritableAtom<T extends object ? T : unknown> | WritableAtom<unknown>[],
        options?: FormOptions<T extends object ? T : unknown> | null | undefined,
      ];
  /** Registers event listeners with automatic lifecycle management. */
  on?: Record<string, (event: JQuery.Event) => void>;
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
 * @example
 * const items = atom([{ id: 1, text: 'A' }, { id: 2, text: 'B' }]);
 *
 * $('#list').list(items, {
 *   key: 'id',
 *   render: (item) => `<li>${item.text}</li>`,
 *   onAdd: ($element) => $element.fadeIn()
 * });
 */
export interface ListOptions<T> {
  /** The property name or function used to extract unique keys. */
  key: keyof T | ListKeyFn<T>;
  /** Function to generate the DOM representation for an item. */
  render: (item: T, index: number) => ListRenderResult;
  /** Optional callback to apply bindings to the rendered element. */
  bind?: ($element: JQuery, item: T, index: number) => void;
  /** Optional callback triggered when an item's data is updated. */
  update?: ($element: JQuery, item: T, index: number) => void;
  /** Callback triggered when a new element is added to the list. */
  onAdd?: ($element: JQuery) => void;
  /** Callback triggered when an element is removed (can be used for transitions). */
  onRemove?: ($element: JQuery) => Promise<void> | void;
  /** Content to display when the list is empty. */
  empty?: ListRenderResult;
  /** Event handlers bound to individual list items. */
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  /** Optional function for custom item equality checks. */
  isEqual?: (first: T, second: T) => boolean;
}

/** Options for customizing two-way value bindings. */
export interface ValOptions<T> {
  /** Time in milliseconds to delay atom synchronization after user input. */
  debounce?: number;
  /** The DOM event used to trigger synchronization (e.g., 'change'). */
  event?: string;
  /** Function to parse the DOM string value into the atom's type. */
  parse?: (rawValue: string) => T;
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
  /** Reactive validation schema mapping paths to validators. */
  validation?: Record<string, (fieldValue: unknown) => string | boolean>;
}

/**
 * Configuration for reactive AJAX requests.
 *
 * @public
 * @example
 * const userData = $.fetch('https://api.example.com/user', {
 *   defaultValue: null,
 *   eager: true,
 *   transform: (res) => res.data
 * });
 */
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
  transform?: (raw: unknown, jqXHR: JQuery.jqXHR) => T | Promise<T>;
  /** Direct overrides for the underlying jQuery AJAX settings. */
  ajaxOptions?: JQuery.AjaxSettings | (() => JQuery.AjaxSettings);
  /** Callback triggered when the request fails. */
  onError?: (error: unknown) => void;
  /** Whether to trigger the initial request immediately upon creation. */
  eager?: boolean;
}

/** An error object containing the source jqXHR for diagnostic purposes. */
export interface FetchError extends Error {
  /** The underlying jQuery XHR object that caused the error. */
  jqXHR?: JQuery.jqXHR;
}

/** Definition for a mountable component that manages its own reactive lifecycle. */
export type ComponentFn<P = Record<string, unknown>> = ($element: JQuery, props: P) => EffectResult;

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
  /** Optional metadata tags for the route (e.g., description, keywords). */
  meta?: Record<string, string>;
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

/** Represents a structured navigation location. */
export interface RouteLocation {
  /** The normalized path part of the URL. */
  path: string;
  /** Key-value pairs of query string parameters. */
  query: Record<string, string>;
  /** Extracted parameters from dynamic segments (e.g., :id). */
  params: Record<string, string>;
}

/**
 * Interface for programmatically interacting with the application router.
 *
 * @public
 * @example
 * // In a component or effect
 * router.navigate('/dashboard?tab=overview');
 * console.log(router.currentRoute.value);
 */
export interface Router {
  /** Reactive atom containing the current route name. */
  currentRoute: ReadonlyAtom<string>;
  /** Reactive atom containing the current query string parameters. */
  queryParams: ReadonlyAtom<Record<string, string>>;
  /** Reactive atom containing the extracted path parameters. */
  params: ReadonlyAtom<Record<string, string>>;
  /** Reactive atom providing a unified snapshot of the current location. */
  location: ReadonlyAtom<RouteLocation>;
  /** Programmatically navigates to the specified path or location object. */
  navigate: (to: string | Partial<RouteLocation>) => void;
  /** Shuts down the router and releases all observers. */
  destroy: () => void;
}

/** Options for AJAX-based fragment navigation. */
export interface AtomNavOptions {
  /** The target container for injected content. */
  target: string | JQuery<HTMLElement> | HTMLElement;
  /** The CSS selector for link elements whose clicks should be intercepted (default: 'a[data-nav]'). */
  selector?: string;
  /** Custom HTTP headers for navigation requests. */
  headers?: Record<string, string>;
  /** Hook triggered before a navigation request is initiated. */
  onBeforeLoad?: (
    url: string,
    signal: AbortSignal
  ) => boolean | undefined | Promise<boolean | undefined>;
  /** Callback triggered after the content has been injected. */
  onMount?: ($container: JQuery, url: string) => void;
  /** Callback triggered before content is replaced. */
  onUnmount?: ($container: JQuery, oldUrl: string) => void;
  /** Callback for handling navigation errors. */
  onError?: (error: unknown, url: string) => boolean | undefined;
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
 * Composition-based controller for managing a component's reactive lifecycle.
 *
 * When to use:
 * - To build Custom Elements that require reactive attribute and slot synchronization.
 * - To manage complex component lifecycles with automated resource disposal.
 * - To provide or inject reactive state across Shadow DOM boundaries.
 *
 * @public
 */
export interface AtomComponentController {
  /** The raw host element of the component. */
  readonly host: HTMLElement;
  /** The active root node (ShadowRoot or Host container). */
  readonly root: Node | null;
  /**
   * Scoped jQuery selector.
   * Limited to selecting elements within the component's encapsulated DOM.
   */
  readonly $: JQueryScopedSelector;

  /**
   * Factory function that returns a reactive lens atom for a specific HTML attribute.
   * Accessing a name returns a WritableAtom<string | null>.
   */
  readonly attrs: (name: string) => WritableAtom<string | null>;

  /**
   * Factory function that returns a reactive lens atom for a specific Shadow DOM slot.
   * Provides ReadonlyAtom<Node[]> for each named slot (or 'default' for unnamed).
   */
  readonly slots: (name: string) => ReadonlyAtom<Node[]>;

  /**
   * Access to the component's internal state and accessibility properties via ElementInternals.
   * Available only if the browser supports attachInternals().
   */
  readonly internals?: ElementInternals | undefined;

  /** Registers a reactive provider on this element for dependency injection. */
  provideAtom<T = unknown>(key: string | symbol, value: T): void;
  /** Injects a reactive value provided by an ancestor element. */
  injectAtom<T = unknown>(key: string | symbol): WritableAtom<T | null> | null;

  /**
   * Initializes the component's reactive lifecycle and observers.
   *
   * Logic: Hybrid Options
   * Accepts a raw ShadowRoot for traditional usage or a configuration object
   * for declarative hydration and automatic event dispatching.
   *
   * @param options - ShadowRoot or configuration object for hydration and event dispatching.
   */
  setup(
    options?:
      | ShadowRoot
      | DocumentFragment
      | {
          shadowRoot?: ShadowRoot | DocumentFragment;
          /** Maps event names to atoms or getter functions for automatic dispatching. */
          dispatch?: Record<string, ReactiveValue<unknown>>;
          /** Maps data-bind keys to atoms for declarative DOM hydration. */
          bind?: Record<string, ReadonlyAtom<unknown>>;
          /**
           * Constructable stylesheets to be shared across instances.
           * Strings are automatically converted to shared CSSStyleSheet objects.
           */
          styles?: (string | CSSStyleSheet)[];
          /**
           * Reactive accessibility bindings via AriaMixin (ElementInternals).
           * Maps ARIA properties (e.g., 'ariaExpanded') to atoms.
           */
          aria?: Record<string, ReadonlyAtom<unknown>>;
          /**
           * Reactive CSS Part bindings.
           * Maps element selectors or data-aej-part keys to atoms for dynamic part names.
           */
          parts?: Record<string, ReadonlyAtom<string | string[] | Record<string, boolean> | null>>;
          /**
           * Reactive value for Form-Associated Custom Elements (FACE).
           * Automatically synchronized with the native <form> via internals.setFormValue().
           */
          val?:
            | ReadonlyAtom<unknown>
            | { value: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> };
          value?:
            | ReadonlyAtom<unknown>
            | { value: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> };
          /**
           * Reactive validation logic for Form-Associated Custom Elements (FACE).
           * Can be a validation message string, a ValidityStateFlags object, or an atom/function returning either.
           */
          validation?:
            | ReadonlyAtom<ValidityStateFlags | string>
            | ((value: unknown) => ValidityStateFlags | string);
        }
  ): void;

  /**
   * Tears down all reactive bindings and observers.
   * Disconnects observers immediately; actual cleanup is deferred to a microtask.
   *
   * Logic: Cleanup Mechanism
   * Releases all listeners, observers, and effects created during setup() or
   * through reactive property access (attrs/slots).
   */
  teardown(): void;
}

/**
 * Represents an HTMLElement that has been enhanced with an AEJ controller.
 *
 * @public
 */
export type AtomComponentElement<T extends HTMLElement = HTMLElement> = T & {
  readonly aej: AtomComponentController;
};

/**
 * Declarative specification for Atom-Effect components.
 * @internal
 */
export interface AtomComponentStatic {
  aejStyles?: (string | CSSStyleSheet)[];
  aejBind?: Record<string, ReadonlyAtom<unknown>>;
  aejAria?: Record<string, ReadonlyAtom<unknown>>;
  aejParts?: Record<string, ReadonlyAtom<string | string[] | Record<string, boolean> | null>>;
  aejDispatch?: Record<string, ReactiveValue<unknown>>;
  aejVal?: ReadonlyAtom<unknown> | { value: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> };
  aejValue?:
    | ReadonlyAtom<unknown>
    | { value: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> };
  aejValidation?:
    | ReadonlyAtom<ValidityStateFlags | string>
    | ((value: unknown) => ValidityStateFlags | string);
}

export type { EffectCleanup, ReadonlyAtom, WritableAtom };
