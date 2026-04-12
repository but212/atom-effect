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

// ============================================================================
// Shared API Types
// ============================================================================

export type EffectCleanup = () => void;
export type EffectResult = undefined | EffectCleanup;
export type EqualFn<T> = (a: T, b: T) => boolean;

export interface AtomOptions extends BaseAtomOptions {
  name?: string;
}

/**
 * Represents a value that can be tracked by the reactive system.
 * - T: Static value (one-time bind)
 * - ReadonlyAtom<T>: Reactive value (updates DOM when atom changes)
 * - () => T: Reactive function (updates DOM when any atom read inside changes)
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);

/**
 * An extension of ReactiveValue that also supports Promises and async functions.
 * The binding system automatically handles the promise lifecycle, showing the
 * latest resolved value and ignoring stale ones (race condition protection).
 */
export type AsyncReactiveValue<T> =
  | T
  | ReadonlyAtom<T | Promise<T>>
  | Promise<T>
  | (() => T | Promise<T>);
export type PrimitiveValue = string | number | boolean | null | undefined;
type KeysOfType<T, V> = { [K in keyof T]: T[K] extends V ? K : never }[keyof T];

export type CssValue =
  | AsyncReactiveValue<string | number>
  | [source: AsyncReactiveValue<number>, unit: string];
export type CssBindings = Record<string, CssValue>;

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

export interface ListOptions<T> {
  key: KeysOfType<T, ListKey> | ListKeyFn<T>;
  render: (item: T, index: number) => ListRenderResult;
  bind?: ($el: JQuery, item: T, index: number) => void;
  update?: ($el: JQuery, item: T, index: number) => void;
  onAdd?: ($el: JQuery) => void;
  onRemove?: ($el: JQuery) => Promise<void> | void;
  empty?: ListRenderResult;
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  isEqual?: (a: T, b: T) => boolean;
}

/**
 * Options for `atomVal`, `atomChecked`, and `atomForm` bindings.
 */
export interface ValOptions<T> {
  /** Debounce duration in milliseconds for DOM -> Atom sync. Defaults to 0. */
  debounce?: number;
  /** jQuery event name(s) to listen to. Defaults to "input". */
  event?: string;
  /** Custom function to parse DOM string to atom type T. */
  parse?: (v: string) => T;
  /** Custom function to format atom type T to DOM string. */
  format?: (v: T) => string;
  /** Custom equality check to prevent redundant atom updates. */
  equal?: EqualFn<T>;
}

/**
 * Options for `atomForm` binding.
 */
export interface FormOptions<T> extends ValOptions<T> {
  /** Custom function to transform field value based on path before atomic sync. */
  transform?: (path: string, value: unknown) => unknown;
  /** Callback triggered when a field value changes. */
  onChange?: (path: string, value: unknown) => void;
}

export interface FetchOptions<T> {
  defaultValue: T;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | (string & {});
  headers?: Record<string, string>;
  transform?: (raw: unknown) => T;
  ajaxOptions?: JQuery.AjaxSettings | (() => JQuery.AjaxSettings);
  onError?: (err: unknown) => void;
  eager?: boolean;
}

export interface FetchError extends Error {
  jqXHR?: JQuery.jqXHR;
}

export type ComponentFn<P = Record<string, unknown>> = ($el: JQuery, props: P) => EffectResult;

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

export enum BindingFlags {
  None = 0,
  Focused = 1 << 0,
  Composing = 1 << 1,
  SyncingToAtom = 1 << 2,
  SyncingToDom = 1 << 3,
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

export interface BindingContext {
  readonly el: HTMLElement;
  readonly trackCleanup: (fn: EffectCleanup) => void;
}

declare global {
  interface JQueryStatic {
    atom: { <T>(v: T, opts?: AtomOptions): WritableAtom<T>; debug: boolean };
    computed<T>(fn: () => T, opts?: ComputedOptions<T>): ComputedAtom<T>;
    computed<T>(
      fn: () => Promise<T>,
      opts: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    effect(fn: () => EffectResult): EffectObject;
    batch(fn: () => void): void;
    untracked<T>(fn: () => T): T;
    isAtom(v: unknown): boolean;
    isComputed(v: unknown): boolean;
    isReactive(v: unknown): boolean;
    nextTick(): Promise<void>;
    atomLens<T extends object, P extends Paths<T>>(
      atom: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;
    composeLens<T extends object, P extends Paths<T>>(
      lens: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;
    lensFor<T extends object>(
      atom: WritableAtom<T>
    ): <P extends Paths<T>>(p: P) => DisposableWritableAtom<PathValue<T, P>>;
    route(config: RouteConfig): Router;
    atomFetch<T>(
      url: string | (() => string),
      opts: FetchOptions<T>
    ): ComputedAtom<T> & { abort: () => void };
  }

  interface JQuery {
    atomText<T>(src: AsyncReactiveValue<T>, fmt?: (v: T) => string): this;
    atomHtml(src: AsyncReactiveValue<string>): this;
    atomClass(name: string, cond: AsyncReactiveValue<boolean>): this;
    atomClass(map: Record<string, AsyncReactiveValue<boolean>>): this;
    atomCss(prop: string, src: AsyncReactiveValue<string | number>, unit?: string): this;
    atomCss(map: CssBindings): this;
    atomAttr(name: string, src: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(map: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    atomProp<T>(name: string, src: AsyncReactiveValue<T>): this;
    atomProp(map: Record<string, AsyncReactiveValue<unknown>>): this;
    atomShow(cond: AsyncReactiveValue<boolean>): this;
    atomHide(cond: AsyncReactiveValue<boolean>): this;
    atomVal<T>(atom: WritableAtom<T>, opts?: ValOptions<T>): this;
    atomChecked(atom: WritableAtom<boolean>): this;
    atomForm<T extends object>(atom: WritableAtom<T>, opts?: FormOptions<T>): this;
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;
    atomBind<T = unknown>(opts: BindingOptions<T>): this;
    atomList<T>(src: ReadonlyAtom<T[]>, opts: ListOptions<T>): this;
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    atomUnmount(): this;
    atomUnbind(): this;
  }
}

export type { ComputedAtom, ComputedOptions, EffectObject, ReadonlyAtom, WritableAtom };
