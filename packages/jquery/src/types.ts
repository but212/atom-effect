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
 * Generic equality predicate shared by `ValOptions` and any future consumer.
 * Extracted as a named type to avoid duplicating the inline function signature.
 */
export type EqualFn<T> = (a: T, b: T) => boolean;

/**
 * Extended options for Atom creation.
 */
export interface AtomOptions extends BaseAtomOptions {
  /** Name for debugging purposes */
  name?: string;
}

/**
 * Represents a value that can be either a reactive node (Atom or Computed)
 * or a plain static value of the same type.
 *
 * `ComputedAtom<T>` is a structural sub-type of `ReadonlyAtom<T>`, so it is
 * already covered by `ReadonlyAtom<T>` — listing it separately would be
 * redundant and misleading.
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T>;

/**
 * Values allowed for DOM properties and attributes.
 */
export type PrimitiveValue = string | number | boolean | null | undefined;

/**
 * CSS value: either a direct reactive value or a numeric tuple of [source, unit].
 *
 * The tuple form `[source, unit]` only accepts numeric sources because appending
 * a unit suffix to a string value (e.g. `"100%" + "px"`) is semantically
 * meaningless. Use `ReactiveValue<string>` directly when the full CSS value is
 * already a string (e.g. `fontFamilyAtom`).
 */
export type CssValue =
  | ReactiveValue<string | number>
  | [source: ReactiveValue<number>, unit: string];

/**
 * CSS bindings map property names to CSS values.
 */
export type CssBindings = Record<string, CssValue>;

/**
 * Configuration options for `atomBind`.
 */
export interface BindingOptions {
  /** Binds textContent to any reactive source (usually string/number). */
  text?: ReactiveValue<unknown>;
  /** Binds innerHTML to a reactive string source (sanitized). */
  html?: ReactiveValue<string>;
  /** Map of class names to reactive boolean conditions. */
  class?: Record<string, ReactiveValue<boolean>>;
  /** Map of CSS properties to reactive values or [value, unit] tuples. */
  css?: CssBindings;
  /** Binds attributes with consistent primitive constraints. */
  attr?: Record<string, ReactiveValue<PrimitiveValue>>;
  /** Binds DOM properties. */
  prop?: Record<string, ReactiveValue<unknown>>;
  /** Direct visibility control (display: none). */
  show?: ReactiveValue<boolean>;
  /** Inverse visibility control. */
  hide?: ReactiveValue<boolean>;
  /**
   * Two-way binding for input values.
   * Pass a bare atom or a `[atom, options]` tuple to customise parse/format/debounce.
   */
  val?: WritableAtom<unknown> | [atom: WritableAtom<unknown>, options: ValOptions<unknown>];
  /** Two-way binding for checkboxes and radio buttons. */
  checked?: WritableAtom<boolean>;
  /** Event listeners with automatic batched execution and lifecycle-bound cleanup. */
  on?: Record<string, (e: JQuery.Event) => void>;
}

// ── List internals ────────────────────────────────────────────────────────────

/** Key type for Map/Set inside list.ts */
export type ListKey = string | number;

/** Lifecycle state of the itemMap entry */
export type ListItemState = 'new' | 'replaced';

/** Possible return types for render() / empty */
export type ListRenderResult = string | Element | DocumentFragment | JQuery;

/** Key extractor — used for ListOptions.key field & getKey variable type */
export type ListKeyFn<T> = (item: T, index: number) => ListKey;

/**
 * Item record stored in itemMap.
 * @internal For list.ts only
 */
export interface ListItemEntry<T> {
  $el: JQuery;
  item: T;
  state?: ListItemState | undefined;
}

/**
 * Configuration options for `atomList`.
 */
export interface ListOptions<T> {
  /** Key to track items (property name or extractor function). */
  key: keyof T | ListKeyFn<T>;
  /** Render function for each item. */
  render: (item: T, index: number) => ListRenderResult;
  /** Optional post-render binding logic. */
  bind?: ($el: JQuery, item: T, index: number) => void;
  /** Optional update logic when item data changes but DOM is reused. */
  update?: ($el: JQuery, item: T, index: number) => void;
  /** Lifecycle hook: called when an element is added to the list. */
  onAdd?: ($el: JQuery) => void;
  /** Lifecycle hook: called when an element is about to be removed. Supports async transitions. */
  onRemove?: ($el: JQuery) => Promise<void> | void;
  /** Content to show when the list is empty. */
  empty?: ListRenderResult;
  /**
   * Delegated event handlers attached to the container (not to each item).
   *
   * Keys follow the pattern `"eventType"` or `"eventType selector"`.
   * A single listener per event type is registered on the container,
   * and the callback receives the matched item data, its current index,
   * and the original jQuery event.
   *
   * @example
   * ```js
   * events: {
   *   'click .delete': (item, index, e) => remove(item.id),
   *   'click': (item, index, e) => select(item),
   * }
   * ```
   */
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
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
  equal?: EqualFn<T>;
}

/**
 * Configuration options for `atomFetch`.
 */
export interface FetchOptions<T> {
  /**
   * Value exposed by the atom before the first fetch resolves.
   * Also returned while a subsequent fetch is in flight.
   */
  defaultValue: T;
  /**
   * HTTP method forwarded to `$.ajax` (default: `'GET'`).
   * Takes precedence over the same field in `ajaxOptions`.
   * Accepts any string for non-standard methods; common values are
   * auto-completed: `'GET'`, `'POST'`, `'PUT'`, `'PATCH'`, `'DELETE'`.
   */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});
  /**
   * HTTP headers forwarded to `$.ajax`.
   * Takes precedence over the same field in `ajaxOptions`.
   */
  headers?: Record<string, string>;
  /**
   * Transforms the raw `$.ajax` response into `T`.
   *
   * When omitted the raw response is cast to `T` with no runtime validation.
   * Provide this function whenever the server response shape is not
   * guaranteed to match `T` at runtime.
   */
  transform?: (raw: unknown) => T;
  /**
   * Additional `$.ajax` settings.
   * Top-level fields (`url`, `method`, `headers`) always override the same
   * fields here, so avoid duplicating them to prevent silent conflicts.
   */
  ajaxOptions?: JQuery.AjaxSettings;
  /**
   * Called when the fetch fails with a non-abort error.
   * Receives the raw rejection value from `$.ajax`.
   * Does not suppress the error — the computed atom still enters its error
   * state and `hasError` becomes true.
   */
  onError?: (err: unknown) => void;
  /**
   * When `true` (default), the first fetch starts immediately on creation.
   * When `false`, the fetch is deferred until `atom.value` is first accessed.
   */
  eager?: boolean;
}

/**
 * Error potentially thrown or returned by atomFetch when a network request fails.
 * Includes the native error specifics, alongside the original jQuery XHR object.
 */
export interface FetchError extends Error {
  /** The original jQuery XHR object, available if the error originated from a network failure. */
  jqXHR?: JQuery.jqXHR;
}

// ============================================================================
// Input binding internals
// Consumed only by input-binding.ts. Centralised here so enum definitions live
// alongside their sibling types, but marked @internal — not part of the public
// API surface and subject to change without notice.
// ============================================================================

/**
 * Bit flags for input binding state management.
 *
 * DESIGN RATIONALE:
 * - Mutually exclusive phases (SyncingTo*) and orthogonal states (Focused, Composing)
 *   are packed into a single integer for O(1) state checks.
 * - 'Busy' mask is used as a Re-entrancy Guard to prevent infinite sync loops
 *   between DOM events and Atom updates.
 *
 * @internal
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
 * Functional Component type.
 * A function that initializes logic on a jQuery element and returns an optional cleanup function.
 * `P` defaults to `object` (empty props) — use `P = Record<string, never>` for strictly no-props
 * components.
 */
export type ComponentFn<P = object> = ($el: JQuery, props: P) => EffectResult;

// ============================================================================
// jQuery global interface augmentation
// Extends JQueryStatic and JQuery with atom-effect plugin methods.
// Importing this file applies these augmentations as a side effect.
// ============================================================================

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
    atomFetch<T>(
      urlOrFn: string | (() => string),
      options: FetchOptions<T>
    ): ComputedAtom<T> & { abort: () => void };
  }

  interface JQuery {
    /** Binds textContent to a reactive source. */
    atomText<T>(source: ReactiveValue<T>, formatter?: (v: T) => string): this;
    /** Binds innerHTML to a reactive source (sanitized). */
    atomHtml(source: ReactiveValue<string>): this;
    /** Toggles a single CSS class based on a reactive boolean. */
    atomClass(className: string, condition: ReactiveValue<boolean>): this;
    /** Toggles multiple CSS classes from a map of class names to reactive booleans. */
    atomClass(classMap: Record<string, ReactiveValue<boolean>>): this;
    /** Binds a single CSS property to a reactive value, with an optional unit suffix. */
    atomCss(prop: string, source: ReactiveValue<string | number>, unit?: string): this;
    /** Binds multiple CSS properties from a map of property names to reactive values. */
    atomCss(cssMap: CssBindings): this;
    /** Binds a single DOM attribute to a reactive value with security guards. */
    atomAttr(name: string, source: ReactiveValue<PrimitiveValue>): this;
    /** Binds multiple DOM attributes from a map of attribute names to reactive values. */
    atomAttr(attrMap: Record<string, ReactiveValue<PrimitiveValue>>): this;
    /** Binds a single DOM property to a reactive value. */
    atomProp<T>(name: string, source: ReactiveValue<T>): this;
    /** Binds multiple DOM properties from a map of property names to reactive values. */
    atomProp<T>(propMap: Record<string, ReactiveValue<T>>): this;
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
 *
 * @internal consumed only by unified.ts and its callers within this package.
 */
export interface BindingContext {
  /** The specific jQuery-wrapped element being bound. */
  readonly $el: JQuery;
  /** The raw DOM element. */
  readonly el: HTMLElement;
  /** Registers a cleanup function to be executed when the element is removed. */
  readonly trackCleanup: (fn: EffectCleanup) => void;
}

// ============================================================================
// Route types
// ============================================================================

/**
 * Shared route lifecycle hooks available on every route definition.
 */
export interface RouteLifecycle {
  /**
   * Called when entering this route. May return additional params to merge
   * into the params object passed to `render` / `onMount`.
   */
  onEnter?: (params: Record<string, string>) => Record<string, string> | undefined;
  /**
   * Called when leaving this route.
   * Return `false` to block navigation; returning `void` (or nothing) allows it.
   */
  onLeave?: () => boolean | undefined;
  /** Called when the same route is re-activated with new query parameters. */
  onParamsChange?: (params: Record<string, string>) => void;
}

/**
 * Route that renders content by cloning a `<template>` element.
 */
export interface TemplateRoute extends RouteLifecycle {
  /** CSS selector for a `<template>` element (e.g., `'#tmpl-home'`). */
  template: string;
  render?: never;
  /** Called after template content is appended to the container. */
  onMount?: ($content: JQuery) => void;
}

/**
 * Route that renders content via a custom function.
 */
export interface RenderRoute extends RouteLifecycle {
  /** Custom render function providing full control over the container DOM. */
  render: (container: HTMLElement, route: string, params: Record<string, string>) => void;
  template?: never;
}

/**
 * Route definition for a single route.
 * Exactly one of `template` or `render` must be provided.
 *
 * Use `isTemplateRoute` / `isRenderRoute` from `utils.ts` for safe narrowing
 * instead of direct property access.
 */
export type RouteDefinition = TemplateRoute | RenderRoute;

/**
 * Configuration for `$.route()`.
 */
export interface RouteConfig {
  /** CSS selector of the element into which route content is rendered. */
  target: string;
  /** Route name used when the URL has no explicit route segment. */
  default: string;
  /** Map of route names to their definitions. */
  routes: Record<string, RouteDefinition>;
  /**
   * Routing strategy. Default: `'hash'`.
   * - `'hash'`    — reads/writes `location.hash` (`#routeName`).
   * - `'history'` — reads/writes `location.pathname` via `history.pushState`.
   */
  mode?: 'hash' | 'history';
  /**
   * Path prefix stripped from `location.pathname` in history mode.
   * A trailing slash is normalized away internally.
   * Has no effect in hash mode.
   */
  basePath?: string;
  /** Route name to render when the requested route is not found (404 fallback). */
  notFound?: string;
  /**
   * When `true`, clicks on `[data-route]` elements are intercepted and
   * handled via `navigate()` instead of triggering a full page load.
   * Default: `false`.
   */
  autoBindLinks?: boolean;
  /**
   * CSS class added to `[data-route]` links that match the current route.
   * Also sets `aria-current="page"` on the active link.
   * Default: `'active'`.
   */
  activeClass?: string;
  /**
   * Called before each route transition.
   * `from` is `''` on the very first render (no previous route).
   */
  beforeTransition?: (from: string, to: string) => void;
  /**
   * Called after each route transition completes.
   * `from` is `''` on the very first render (no previous route).
   */
  afterTransition?: (from: string, to: string) => void;
}

/**
 * Router instance returned by `$.route()`.
 *
 * `currentRoute` and `queryParams` reflect the current URL state reactively:
 * - In `'hash'` mode, `queryParams` is parsed from the query string after `?`
 *   in the hash fragment (e.g., `#home?page=2` → `{ page: '2' }`).
 * - In `'history'` mode, `queryParams` is parsed from `location.search`.
 */
export interface Router {
  /**
   * Reactive atom containing the current route name.
   * Read-only — use `navigate()` to change routes so that the URL stays in sync.
   */
  currentRoute: ReadonlyAtom<string>;
  /**
   * Reactive atom containing the current query parameters as a plain object.
   * Updated automatically on URL changes; reset to `{}` on programmatic navigation.
   */
  queryParams: ReadonlyAtom<Record<string, string>>;
  /** Navigate programmatically to the named route. */
  navigate: (route: string) => void;
  /** Destroy the router, removing all event listeners and reactive effects. */
  destroy: () => void;
}

export type { WritableAtom, ReadonlyAtom, ComputedAtom, EffectObject, ComputedOptions };
