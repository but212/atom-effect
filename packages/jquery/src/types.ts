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
export type EffectResult = undefined | EffectCleanup;
export type EqualFn<T> = (a: T, b: T) => boolean;

export interface AtomOptions extends BaseAtomOptions {
  name?: string;
  sync?: boolean;
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

export interface ValOptions<T> {
  debounce?: number;
  event?: string;
  parse?: (v: string) => T;
  format?: (v: T) => string;
  equal?: EqualFn<T>;
}

export interface FormOptions<T> extends ValOptions<T> {
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

export type ComponentFn<P = Record<string, unknown>> = ($el: JQuery, props: P) => EffectResult;

export interface RouteLifecycle {
  onEnter?: (
    params: Record<string, string>,
    router: Router
  ) => Record<string, string> | undefined | false;
  onLeave?: (router: Router) => boolean | undefined;
  title?: string;
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

export enum BindingFlags {
  None = 0,
  Focused = 1 << 0,
  Composing = 1 << 1,
  SyncingToAtom = 1 << 2,
  SyncingToDom = 1 << 3,
  Busy = Composing | SyncingToAtom | SyncingToDom,
}

declare global {
  interface JQueryStatic {
    atom<T>(v: T, opts?: AtomOptions): WritableAtom<T>;
    computed<T>(fn: () => T, opts?: ComputedOptions<T>): ComputedAtom<T>;
    computed<T>(
      fn: () => Promise<T>,
      opts: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    effect(
      fn: () => EffectResult,
      opts?: import('@but212/atom-effect').EffectOptions
    ): EffectObject;
    batch(fn: () => void): void;
    untracked<T>(fn: () => T): T;
    isAtom(v: unknown): boolean;
    isComputed(v: unknown): boolean;
    nextTick(): Promise<void>;

    debug: {
      enabled: boolean;
      warn(prefix: string, message: string, ...rest: unknown[]): void;
      error(prefix: string, message: string, cause: unknown): void;
      domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown): void;
    };

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
    ): ComputedAtom<T> & { abort: () => void; dispose(): void };
    atomNav(options: AtomNavOptions): AtomNav;
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
