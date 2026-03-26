import type {
  AtomOptions as BaseAtomOptions,
  ComputedAtom,
  ComputedOptions,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

// ============================================================================
// Shared API Types
// ============================================================================

/**
 * Cleanup function returned by effects or components.
 */
export type EffectCleanup = () => void;

/**
 * Result of a reactive factory or component mount.
 * Returns `void` (no cleanup) or an `EffectCleanup` function.
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
 * already covered by `ReadonlyAtom<T>`.
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);

/**
 * Represents a value that can be a synchronous `ReactiveValue<T>`,
 * a `Promise<T>`, or an Atom yielding `T | Promise<T>`.
 */
export type AsyncReactiveValue<T> =
  | T
  | ReadonlyAtom<T | Promise<T>>
  | Promise<T>
  | (() => T | Promise<T>);

/**
 * Values allowed for DOM properties and attributes.
 */
export type PrimitiveValue = string | number | boolean | null | undefined;

/**
 * Helper to extract keys of T whose values extend V.
 * Used to ensure `key` property refers to valid ID-like values.
 */
type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

/**
 * CSS value: either a direct reactive value or a numeric tuple of [source, unit].
 */
export type CssValue =
  | AsyncReactiveValue<string | number>
  | [source: AsyncReactiveValue<number>, unit: string];

/**
 * CSS bindings map property names to CSS values.
 */
export type CssBindings = Record<string, CssValue>;

/**
 * Configuration options for `atomBind`.
 * @template T Type of the value for two-way binding (`val` field).
 */
export interface BindingOptions<T = unknown> {
  /** Binds textContent to any reactive source. */
  text?: AsyncReactiveValue<unknown>;
  /** Binds innerHTML to a reactive string source (sanitized). */
  html?: AsyncReactiveValue<string>;
  /** Map of class names to reactive boolean conditions. */
  class?: Record<string, AsyncReactiveValue<boolean>>;
  /** Map of CSS properties to reactive values or [value, unit] tuples. */
  css?: CssBindings;
  /** Binds attributes with consistent primitive constraints. */
  attr?: Record<string, AsyncReactiveValue<PrimitiveValue>>;
  /** Binds DOM properties. */
  prop?: Record<string, AsyncReactiveValue<unknown>>;
  /** Direct visibility control (display: none). */
  show?: AsyncReactiveValue<boolean>;
  /** Inverse visibility control. */
  hide?: AsyncReactiveValue<boolean>;

  /**
   * Two-way binding for input values.
   * Pass an atom or a `[atom, options]` tuple.
   */
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  /** Two-way binding for checkboxes and radio buttons. */
  checked?: WritableAtom<boolean>;
  /** Fully automated two-way form binding using name attributes. */
  form?: WritableAtom<T extends object ? T : unknown>;
  /** Event listeners with automatic batched execution and lifecycle-bound cleanup. */
  on?: Record<string, (e: JQuery.Event) => void>;
}

// ============================================================================
// List API Types
// ============================================================================

/** Key type for Map/Set inside list.ts */
export type ListKey = string | number;

/** Possible return types for render() / empty */
export type ListRenderResult = string | Element | DocumentFragment | JQuery;

/** Key extractor function signature. */
export type ListKeyFn<T> = (item: T, index: number) => ListKey;

/**
 * Configuration options for `atomList`.
 */
export interface ListOptions<T> {
  /**
   * Key to track items. Must be a property name whose value is a string|number,
   * or a key extractor function.
   */
  key: KeysOfType<T, ListKey> | ListKeyFn<T>;
  /** Render function for each item. */
  render: (item: T, index: number) => ListRenderResult;
  /** Optional post-render binding logic. */
  bind?: ($el: JQuery, item: T, index: number) => void;
  /** Optional update logic when item data changes but DOM is reused. */
  update?: ($el: JQuery, item: T, index: number) => void;
  /** Lifecycle hook: called when an element is added to the list. */
  onAdd?: ($el: JQuery) => void;
  /** Lifecycle hook: called when an element is about to be removed. */
  onRemove?: ($el: JQuery) => Promise<void> | void;
  /** Content to show when the list is empty. */
  empty?: ListRenderResult;
  /** Delegated event handlers attached to the container. */
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  /**
   * Custom equality checker to determine if an item has changed.
   * Defaults to `shallowEqual`. If it returns false, the item is re-rendered (unless `update` is provided).
   */
  isEqual?: (a: T, b: T) => boolean;
}

// ============================================================================
// Form & Input Types
// ============================================================================

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

// ============================================================================
// Fetch API Types
// ============================================================================

/**
 * Configuration options for `atomFetch`.
 */
export interface FetchOptions<T> {
  /** Initial value before the first fetch resolves. */
  defaultValue: T;
  /** HTTP method (default: 'GET'). */
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});
  /** HTTP headers. */
  headers?: Record<string, string>;
  /** Transforms the raw response into T. */
  transform?: (raw: unknown) => T;
  /** Additional `$.ajax` settings. Can be a getter function for reactive data tracking. */
  ajaxOptions?: JQuery.AjaxSettings | (() => JQuery.AjaxSettings);
  /** Error callback. */
  onError?: (err: unknown) => void;
  /** Whether to fetch immediately (default: true). */
  eager?: boolean;
}

/** Error payload for atomFetch. */
export interface FetchError extends Error {
  /** The original jQuery XHR object. */
  jqXHR?: JQuery.jqXHR;
}

// ============================================================================
// Component & Router Types
// ============================================================================

/**
 * A function that initializes logic on a jQuery element and returns an optional cleanup function.
 * `P` defaults to `Record<string, unknown>` for convenience. Use `P = Record<string, never>`
 * for strictly no-props components.
 */
export type ComponentFn<P = Record<string, unknown>> = ($el: JQuery, props: P) => EffectResult;

/** Shared route lifecycle hooks. */
export interface RouteLifecycle {
  onEnter?: (params: Record<string, string>, router: Router) => Record<string, string> | undefined;
  onLeave?: (router: Router) => boolean | undefined;
}

export interface TemplateRoute extends RouteLifecycle {
  template: string;
  render?: never;
  onMount?: ($content: JQuery, onUnmount: (cleanupFn: () => void) => void, router: Router) => void;
}

export interface RenderRoute extends RouteLifecycle {
  render: (
    container: HTMLElement,
    route: string,
    params: Record<string, string>,
    onUnmount: (cleanupFn: () => void) => void,
    router: Router
  ) => void;
  template?: never;
}

export type RouteDefinition = TemplateRoute | RenderRoute;

export interface RouteConfig {
  target: string;
  default: string;
  routes: Record<string, RouteDefinition>;
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
  navigate: (route: string) => void;
  destroy: () => void;
}

// ============================================================================
// Internal Types (Implementation Details)
// ============================================================================

/**
 * Bit flags for input binding state management.
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
 * Context passed to binding handlers for unified lifecycle management.
 * @internal
 */
export interface BindingContext {
  readonly el: HTMLElement;
  readonly trackCleanup: (fn: EffectCleanup) => void;
}

// ============================================================================
// JQuery Global Augmentation
// ============================================================================

declare global {
  interface JQueryStatic {
    atom: {
      <T>(initialValue: T, options?: AtomOptions): WritableAtom<T>;
      debug: boolean;
    };
    computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
    computed<T>(
      fn: () => Promise<T>,
      options: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    effect(fn: () => EffectResult): EffectObject;
    batch(fn: () => void): void;
    untracked<T>(fn: () => T): T;
    isAtom(v: unknown): boolean;
    isComputed(v: unknown): boolean;
    isReactive(v: unknown): boolean;
    nextTick(): Promise<void>;
    route(config: RouteConfig): Router;
    atomFetch<T>(
      urlOrFn: string | (() => string),
      options: FetchOptions<T>
    ): ComputedAtom<T> & { abort: () => void };
  }

  interface JQuery {
    atomText<T>(source: AsyncReactiveValue<T>, formatter?: (v: T) => string): this;
    atomHtml(source: AsyncReactiveValue<string>): this;
    atomClass(className: string, condition: AsyncReactiveValue<boolean>): this;
    atomClass(classMap: Record<string, AsyncReactiveValue<boolean>>): this;
    atomCss(prop: string, source: AsyncReactiveValue<string | number>, unit?: string): this;
    atomCss(cssMap: CssBindings): this;
    atomAttr(name: string, source: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(attrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    atomProp<T>(name: string, source: AsyncReactiveValue<T>): this;
    atomProp<T>(propMap: Record<string, AsyncReactiveValue<T>>): this;
    atomShow(condition: AsyncReactiveValue<boolean>): this;
    atomHide(condition: AsyncReactiveValue<boolean>): this;

    atomVal<T>(atom: WritableAtom<T>, options?: ValOptions<T>): this;
    atomChecked(atom: WritableAtom<boolean>): this;
    atomForm<T extends object>(atom: WritableAtom<T>, options?: ValOptions<unknown>): this;
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    atomBind<T = unknown>(options: BindingOptions<T>): this;
    atomList<T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): this;

    atomMount<P>(component: ComponentFn<P>, props?: P): this;
    atomUnmount(): this;
    atomUnbind(): this;
  }
}

export type { ComputedAtom, ComputedOptions, EffectObject, ReadonlyAtom, WritableAtom };
