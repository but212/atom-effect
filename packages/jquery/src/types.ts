import type {
  AtomOptions as BaseAtomOptions,
  ComputedAtom,
  ComputedOptions,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

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
 */
export interface BindingOptions<T> {
  text?: ReactiveValue<T>;
  html?: ReactiveValue<string>;
  class?: Record<string, ReactiveValue<boolean>>;
  css?: CssBindings;
  attr?: Record<string, ReactiveValue<string | boolean | null>>;
  prop?: Record<string, ReactiveValue<T>>;
  show?: ReactiveValue<boolean>;
  hide?: ReactiveValue<boolean>;
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  checked?: WritableAtom<boolean>;
  on?: Record<string, (e: JQuery.Event) => void>;
}

/**
 * Configuration options for `atomList`.
 */
export interface ListOptions<T> {
  key: keyof T | ((item: T, index: number) => string | number);
  render: (item: T, index: number) => string | Element | DocumentFragment | JQuery;
  bind?: ($el: JQuery, item: T, index: number) => void;
  update?: ($el: JQuery, item: T, index: number) => void;
  onAdd?: ($el: JQuery) => void;
  onRemove?: ($el: JQuery) => Promise<void> | void;
  empty?: string | Element | DocumentFragment | JQuery;
}

/**
 * Configuration options for `atomVal`.
 */
export interface ValOptions<T> {
  debounce?: number;
  event?: string;
  parse?: (v: string) => T;
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
 * State context for two-way input bindings.
 * Consolidates scattered state flags into a single, traceable object.
 * This is the "bone structure" for input binding lifecycle management.
 */
/**
 * Bit flags for input binding state management.
 * Consolidates mutually exclusive phases and orthogonal states (focus) into a single integer.
 */
export enum BindingFlags {
  None = 0,
  Focused = 1 << 0,
  Composing = 1 << 1,
  SyncingToAtom = 1 << 2,
  SyncingToDom = 1 << 3,
  // Mask for any active processing phase (excluding simple focus)
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

/**
 * State context for two-way input bindings.
 * Consolidates scattered state flags into a single, traceable object.
 * This is the "bone structure" for input binding lifecycle management.
 */
export interface InputBindingState {
  /** Timeout ID for debounced updates */
  timeoutId: number | null;
  /** Bitmask of current state flags */
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
 */
export type ComponentFn<P = {}> = ($el: JQuery, props: P) => undefined | (() => void);

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
    effect(fn: () => undefined | (() => void)): EffectObject;
    batch(fn: () => void): void;
    untracked<T>(fn: () => T): T;
    isAtom(v: unknown): boolean;
    isComputed(v: unknown): boolean;
    isReactive(v: unknown): boolean;
    nextTick(): Promise<void>;
    route(config: RouteConfig): Router;
    atomFetch<T>(urlOrFn: string | (() => string), options: FetchOptions<T>): ComputedAtom<T>;
  }

  interface JQuery {
    // Chainable methods
    atomText<T>(source: ReactiveValue<T>, formatter?: (v: T) => string): this;
    atomHtml(source: ReactiveValue<string>): this;
    atomClass(className: string, condition: ReactiveValue<boolean>): this;
    atomCss(prop: string, source: ReactiveValue<string | number>, unit?: string): this;
    atomAttr(name: string, source: ReactiveValue<string | boolean | null>): this;
    atomProp<T extends string | number | boolean | null | undefined>(
      name: string,
      source: ReactiveValue<T>
    ): this;
    atomShow(condition: ReactiveValue<boolean>): this;
    atomHide(condition: ReactiveValue<boolean>): this;
    atomVal<T>(atom: WritableAtom<T>, options?: ValOptions<T>): this;
    atomChecked(atom: WritableAtom<boolean>): this;
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    // Integrated binding
    atomBind<T extends string | number | boolean | null | undefined>(
      options: BindingOptions<T>
    ): this;

    // List rendering
    atomList<T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): this;

    // Component mounting
    atomMount<P>(component: ComponentFn<P>, props?: P): this;
    atomUnmount(): this;

    // Cleanup
    atomUnbind(): this;
  }
}

/**
 * Context passed to binding handlers for cleanup and effect registration.
 */
export interface BindingContext {
  readonly $el: JQuery;
  readonly el: HTMLElement;
  readonly trackCleanup: (fn: () => void) => void;
}

/**
 * Shared route lifecycle hooks.
 */
interface RouteLifecycle {
  /** Called when entering this route. Can return additional params. */
  onEnter?: (params: Record<string, string>) => Record<string, string> | undefined;
  /** Called when leaving this route. Return false to prevent navigation. */
  onLeave?: () => boolean | undefined;
}

/**
 * Route using a template selector.
 */
interface TemplateRoute extends RouteLifecycle {
  /** Template selector (e.g., '#tmpl-home') */
  template: string;
  render?: never;
}

/**
 * Route using a custom render function.
 */
interface RenderRoute extends RouteLifecycle {
  /** Custom render function */
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
  /** Target element selector for rendering route content */
  target: string;
  /** Default route name */
  default: string;
  /** Route definitions map */
  routes: Record<string, RouteDefinition>;
  /** Routing mode. 'hash' uses location.hash, 'history' uses pushState. Default: 'hash' */
  mode?: 'hash' | 'history';
  /** Base path for history mode (e.g., '/app'). Ignored in hash mode. Default: '' */
  basePath?: string;
  /** Route name to use for 404/not found */
  notFound?: string;
  /** Automatically bind links with data-route attribute */
  autoBindLinks?: boolean;
  /** CSS class to add to active links */
  activeClass?: string;
  /** Called before transitioning between routes */
  beforeTransition?: (from: string, to: string) => void;
  /** Called after transitioning between routes */
  afterTransition?: (from: string, to: string) => void;
}

/**
 * Router instance returned by $.route()
 */
export interface Router {
  /** Reactive atom containing current route name */
  currentRoute: WritableAtom<string>;
  /** Navigate to a different route */
  navigate: (route: string) => void;
  /** Cleanup and destroy the router */
  destroy: () => void;
}

export type { WritableAtom, ReadonlyAtom, ComputedAtom, EffectObject, ComputedOptions };
