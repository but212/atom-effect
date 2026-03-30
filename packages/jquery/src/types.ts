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

/** Helper to convert numeric string to number for array indexing. */
type StringKeyToNumber<S extends string> = S extends `${infer N extends number}` ? N : S;
/** Max recursion depth for dot-paths. */
type MaxDepth = 8;

/** Dot-separated paths for type T. */
export type Paths<T, D extends unknown[] = []> = D['length'] extends MaxDepth
  ? never
  : T extends object
    ? {
        [K in keyof T & (string | number)]-?:
          | `${K}`
          | (T[K] extends object ? `${K}.${Paths<T[K], [...D, 1]>}` : never);
      }[keyof T & (string | number)]
    : never;

/** Value type at path P in T. */
export type PathValue<T, P extends string> = P extends `${infer K}.${infer Rest}`
  ? StringKeyToNumber<K> extends keyof T
    ? PathValue<T[StringKeyToNumber<K> & keyof T], Rest>
    : never
  : StringKeyToNumber<P> extends keyof T
    ? T[StringKeyToNumber<P> & keyof T]
    : never;

export type EffectCleanup = () => void;
export type EffectResult = undefined | EffectCleanup;
export type EqualFn<T> = (a: T, b: T) => boolean;

export interface AtomOptions extends BaseAtomOptions {
  name?: string;
}

export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);
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
  text?: AsyncReactiveValue<unknown>;
  html?: AsyncReactiveValue<string>;
  class?: Record<string, AsyncReactiveValue<boolean>>;
  css?: CssBindings;
  attr?: Record<string, AsyncReactiveValue<PrimitiveValue>>;
  prop?: Record<string, AsyncReactiveValue<unknown>>;
  show?: AsyncReactiveValue<boolean>;
  hide?: AsyncReactiveValue<boolean>;
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>];
  checked?: WritableAtom<boolean>;
  form?: WritableAtom<T extends object ? T : unknown>;
  on?: Record<string, (e: JQuery.Event) => void>;
}

export interface DisposableWritableAtom<T> extends WritableAtom<T>, Disposable {
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

export interface ValOptions<T> {
  debounce?: number;
  event?: string;
  parse?: (v: string) => T;
  format?: (v: T) => string;
  equal?: EqualFn<T>;
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
    atomProp<T>(map: Record<string, AsyncReactiveValue<T>>): this;
    atomShow(cond: AsyncReactiveValue<boolean>): this;
    atomHide(cond: AsyncReactiveValue<boolean>): this;
    atomVal<T>(atom: WritableAtom<T>, opts?: ValOptions<T>): this;
    atomChecked(atom: WritableAtom<boolean>): this;
    atomForm<T extends object>(atom: WritableAtom<T>, opts?: ValOptions<unknown>): this;
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;
    atomBind<T = unknown>(opts: BindingOptions<T>): this;
    atomList<T>(src: ReadonlyAtom<T[]>, opts: ListOptions<T>): this;
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    atomUnmount(): this;
    atomUnbind(): this;
  }
}

export type { ComputedAtom, ComputedOptions, EffectObject, ReadonlyAtom, WritableAtom };
