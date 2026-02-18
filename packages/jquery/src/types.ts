import type {
  AtomOptions as BaseAtomOptions,
  ComputedAtom,
  ComputedOptions,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

/**
 * Cleanup function returned by effects or components.
 */
export type EffectCleanup = () => void;

/**
 * Result of a reactive factory or component mount.
 */
export type EffectResult = undefined | EffectCleanup;

/**
 * Extended options for Atom creation.
 */
export interface AtomOptions extends BaseAtomOptions {
  /** Name for debugging purposes */
  name?: string;
}

/**
 * Represents a value that can be either dynamic (Atom/Computed) or static.
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | ComputedAtom<T>;

/**
 * Values allowed for DOM properties and attributes.
 */
export type PrimitiveValue = string | number | boolean | null | undefined;

/**
 * CSS value: either a direct reactive value or a tuple of [source, unit].
 * Named type provides clear bone structure for CSS binding configurations.
 */
export type CssValue =
  | ReactiveValue<string | number>
  | [source: ReactiveValue<string | number>, unit: string];

/**
 * CSS bindings map property names to CSS values.
 */
export type CssBindings = Record<string, CssValue>;

/**
 * Configuration options for `atomBind`.
 * @template T - The type of the value for two-way binding ('val').
 */
export interface BindingOptions<T = unknown> {
  /** Binds textContent. Decoupled from generic T to allow any reactive source (usually string/number). */
  text?: ReactiveValue<unknown>;
  /** Binds innerHTML. */
  html?: ReactiveValue<string>;
  /** Map of class names to reactive boolean conditions. */
  class?: Record<string, ReactiveValue<boolean>>;
  /** Map of CSS properties to reactive values or [value, unit] tuples. */
  css?: CssBindings;
  /** Binds attributes with consistent primitive constraints. */
  attr?: Record<string, ReactiveValue<PrimitiveValue>>;
  /** Binds DOM properties. Decoupled from generic T for realistic multi-type property usage. */
  prop?: Record<string, ReactiveValue<unknown>>;
  /** Direct visibility control (display: none). */
  show?: ReactiveValue<boolean>;
  /** Inverse visibility control. */
  hide?: ReactiveValue<boolean>;
  /** Two-way binding for input values. This is the primary use of generic T. */
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  /** Two-way binding for checkboxes and radio buttons. */
  checked?: WritableAtom<boolean>;
  /** Event listeners with automatic batched execution and lifecycle-bound cleanup. */
  on?: Record<string, (e: JQuery.Event) => void>;
}

/**
 * Configuration options for `atomList`.
 */
export interface ListOptions<T> {
  /** Key to track items (property name or extractor function). */
  key: keyof T | ((item: T, index: number) => string | number);
  /** Render function for each item. */
  render: (item: T, index: number) => string | Element | DocumentFragment | JQuery;
  /** Optional post-render binding logic. */
  bind?: ($el: JQuery, item: T, index: number) => void;
  /** Optional update logic when item data changes but DOM is reused. */
  update?: ($el: JQuery, item: T, index: number) => void;
  /** Lifecycle hook: called when an element is added to the list. */
  onAdd?: ($el: JQuery) => void;
  /** Lifecycle hook: called when an element is about to be removed. Supports async transitions. */
  onRemove?: ($el: JQuery) => Promise<void> | void;
  /** Content to show when the list is empty. */
  empty?: string | Element | DocumentFragment | JQuery;
}

/**
 * Configuration options for `atomVal`.
 */
export interface ValOptions<T> {
  /** Delay in milliseconds before syncing DOM input to Atom. */
  debounce?: number;
  /** DOM event to trigger sync (default: 'input'). */
  event?: string;
  /** Parser to convert string input to Atom type T. */
  parse?: (v: string) => T;
  /** Formatter to convert Atom type T to string for DOM display. */
  format?: (v: T) => string;
  /** Custom equality check for comparing parsed values. Defaults to Object.is. */
  equal?: (a: T, b: T) => boolean;
}

/**
 * Configuration options for `atomFetch`.
 */
export interface FetchOptions<T> {
  /** Initial value before first fetch resolves. */
  defaultValue: T;
  /** HTTP method (default: 'GET'). */
  method?: string;
  /** Request headers. */
  headers?: Record<string, string>;
  /** Transform raw response before storing. */
  transform?: (raw: unknown) => T;
  /** Additional $.ajax settings passthrough. */
  ajaxOptions?: JQuery.AjaxSettings;
}

/**
 * Bit flags for input binding state management.
 *
 * DESIGN RATIONALE:
 * - Mutually exclusive phases (SyncingTo*) and orthogonal states (Focused, Composing)
 *   are packed into a single integer for O(1) state checks.
 * - 'Busy' mask is used as a Re-entrancy Guard to prevent infinite sync loops
 *   between DOM events and Atom updates.
 */
export enum BindingFlags {
  None = 0,
  /** Element is currently focused by the user. Prevents abrupt external updates from interrupting typing. */
  Focused = 1 << 0,
  /** User is typing via IME (Korean, Chinese, Japanese). Sync is deferred until composition completion. */
  Composing = 1 << 1,
  /** Internal: DOM -> Atom synchronization in progress. Prevents echo effects. */
  SyncingToAtom = 1 << 2,
  /** Internal: Atom -> DOM synchronization in progress. Prevents echo effects. */
  SyncingToDom = 1 << 3,
  /** Combined mask for any active processing phase (excluding simple focus). */
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

/**
 * State context for two-way input bindings.
 * Consolidates scattered state flags into a single, traceable object.
 */
export interface InputBindingState {
  /** Timeout ID for debounced updates. */
  timeoutId: number | null;
  /** Bitmask of current state flags (BindingFlags). */
  flags: number;
}

/**
 * Creates a fresh InputBindingState with default values.
 */
export function createInputBindingState(): InputBindingState {
  return { timeoutId: null, flags: BindingFlags.None };
}

/**
 * Functional Component type.
 * A function that initializes logic on a jQuery element and returns an optional cleanup function.
 */
export type ComponentFn<P = {}> = ($el: JQuery, props: P) => EffectResult;

declare global {
  interface JQueryStatic {
    /**
     * Reactive Atom Factory.
     * Also serves as a namespace for global configuration.
     */
    atom: {
      <T>(initialValue: T, options?: AtomOptions): WritableAtom<T>;
      /** Global debug toggle for logging and visual highlighting. */
      debug: boolean;
    };
    /** Sync computing primitive. */
    computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
    /** Async computing primitive with mandatory default value. */
    computed<T>(
      fn: () => Promise<T>,
      options: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    /** Side-effect primitive. Returns an object to control lifecycle. */
    effect(fn: () => EffectResult): EffectObject;
    /** Groups multiple updates into a single synchronous notification cycle. */
    batch(fn: () => void): void;
    /** Executes a function without establishing reactive dependencies. */
    untracked<T>(fn: () => T): T;
    /** Runtime check for Atom instances. */
    isAtom(v: unknown): boolean;
    /** Runtime check for ComputedAtom instances. */
    isComputed(v: unknown): boolean;
    /** Runtime check for any reactive node. */
    isReactive(v: unknown): boolean;
    /** Resolves after the next scheduler flush. */
    nextTick(): Promise<void>;
    /** Initializes the lightweight SPA router. */
    route(config: RouteConfig): Router;
    /** Declarative reactive AJAX primitive. */
    atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T>;
  }

  interface JQuery {
    /** Binds textContent to a reactive source. */
    atomText<T>(source: ReactiveValue<T>, formatter?: (v: T) => string): this;
    /** Binds innerHTML to a reactive source (sanitized). */
    atomHtml(source: ReactiveValue<string>): this;
    /** Toggles a CSS class based on a reactive boolean. */
    atomClass(className: string, condition: ReactiveValue<boolean>): this;
    /** Binds a CSS property. */
    atomCss(prop: string, source: ReactiveValue<string | number>, unit?: string): this;
    /** Binds a DOM attribute with security guards. */
    atomAttr(name: string, source: ReactiveValue<PrimitiveValue>): this;
    /** Binds a DOM property. */
    atomProp(name: string, source: ReactiveValue<unknown>): this;
    /** Controls element visibility (display: none). */
    atomShow(condition: ReactiveValue<boolean>): this;
    /** Inverse of atomShow. */
    atomHide(condition: ReactiveValue<boolean>): this;
    /** Two-way binding for input values. */
    atomVal<T>(atom: WritableAtom<T>, options?: ValOptions<T>): this;
    /** Two-way binding for checkbox/radio checked state. */
    atomChecked(atom: WritableAtom<boolean>): this;
    /** Lifecycle-aware event listener. */
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    /** Integrated multi-behavior reactive binding. */
    atomBind(options: BindingOptions): this;

    /** Reactive list rendering with efficient LIS-based reconciliation. */
    atomList<T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): this;

    /** Mounts a functional component with automatic cleanup. */
    atomMount<P>(component: ComponentFn<P>, props?: P): this;
    /** Unmounts the component and its descendants. */
    atomUnmount(): this;

    /** Manually triggers cleanup of all reactive bindings on this element. */
    atomUnbind(): this;
  }
}

/**
 * Context passed to binding handlers for unified lifecycle management.
 */
export interface BindingContext {
  /** The specific jQuery-wrapped element being bound. */
  readonly $el: JQuery;
  /** The raw DOM element. */
  readonly el: HTMLElement;
  /** Registers a cleanup function to be executed when the element is removed. */
  readonly trackCleanup: (fn: EffectCleanup) => void;
}

/**
 * Shared route lifecycle hooks.
 */
interface RouteLifecycle {
  /** Called when entering this route. Can return additional params. */
  onEnter?: (params: Record<string, string>) => Record<string, string> | undefined;
  /** Called when leaving this route. Return false to prevent navigation. */
  onLeave?: () => boolean | undefined;
  /** Called when the same route's query params change (e.g. search filter). */
  onParamsChange?: (params: Record<string, string>) => void;
}

/**
 * Route using a template selector.
 */
interface TemplateRoute extends RouteLifecycle {
  /** Template selector (e.g., '#tmpl-home') */
  template: string;
  render?: never;
  /** Called after template content is appended to the DOM. */
  onMount?: ($content: JQuery) => void;
}

/**
 * Route using a custom render function.
 */
interface RenderRoute extends RouteLifecycle {
  /** Custom render function providing full control over DOM. */
  render: (container: HTMLElement, route: string, params: Record<string, string>) => void;
  template?: never;
}

/**
 * Route definition for a single route.
 * Either template OR render must be provided, but not both.
 */
export type RouteDefinition = TemplateRoute | RenderRoute;

/**
 * Configuration for $.route()
 */
export interface RouteConfig {
  /** Target element selector for rendering route content. */
  target: string;
  /** Default route name when no hash or path is present. */
  default: string;
  /** Route definitions map. */
  routes: Record<string, RouteDefinition>;
  /** Routing mode. 'hash' (location.hash) or 'history' (pushState). Default: 'hash'. */
  mode?: 'hash' | 'history';
  /** Base path for history mode navigation. */
  basePath?: string;
  /** Route name to use for fallback / 404. */
  notFound?: string;
  /** Automatically intercept links with data-route attribute. */
  autoBindLinks?: boolean;
  /** CSS class to add to links that point to the current active route. */
  activeClass?: string;
  /** Global hook called before route transition. */
  beforeTransition?: (from: string, to: string) => void;
  /** Global hook called after route transition. */
  afterTransition?: (from: string, to: string) => void;
}

/**
 * Router instance returned by $.route()
 */
export interface Router {
  /** Reactive atom containing the current route name. */
  currentRoute: WritableAtom<string>;
  /** Reactive computed containing current query parameters. */
  queryParams: ReadonlyAtom<Record<string, string>>;
  /** Navigate to a different route. */
  navigate: (route: string) => void;
  /** Entirely destroy the router and its event listeners. */
  destroy: () => void;
}

export type { WritableAtom, ReadonlyAtom, ComputedAtom, EffectObject, ComputedOptions };
