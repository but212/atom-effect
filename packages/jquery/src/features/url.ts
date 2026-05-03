import { atom, batch, computed } from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import type { AtomUrl, NavigationType, ReadonlyAtom, WritableAtom } from '@/types';
import { shallowEqual } from '@/utils';

// --- Constants & Types ---

const IS_BROWSER = typeof window !== 'undefined';
const FALLBACK_URL = 'http://localhost/';
const PROTOCOL_REGEX = /^[a-z][a-z0-9.+-]*:/i;
const NAV_PRIORITY: Record<'push' | 'replace', number> = { push: 2, replace: 1 };

interface UrlSnapshot {
  url: string;
  state: unknown;
  type: NavigationType;
}

interface PendingNav {
  url: URL;
  state: unknown;
  method: 'push' | 'replace';
}

/**
 * Context provided to URL part getters/setters to keep them decoupled
 * from the main class instance.
 */
interface PartContext {
  resolve: (url: string) => string;
  patch: (update: (u: URL) => void, state?: unknown, method?: 'push' | 'replace') => void;
  snapshot: () => UrlSnapshot;
  base: () => string;
}

const NAV_STRATEGIES = {
  push: {
    history: (h: History, s: unknown, u: string) => h.pushState(s, '', u),
    location: (l: Location, u: string) => (l.href = u),
  },
  replace: {
    history: (h: History, s: unknown, u: string) => h.replaceState(s, '', u),
    location: (l: Location, u: string) => l.replace(u),
  },
} as const;

/**
 * Schema defining how each URL part maps to the underlying URL object.
 * Logic: Centralized serialization/deserialization for all URL atoms.
 */
const URL_PARTS_CONFIG = {
  path: {
    get: (u: URL, ctx: PartContext) => {
      const p = u.pathname;
      const b = ctx.base();
      if (!b || b === '/') return p;
      return p === b ? '/' : p.startsWith(`${b}/`) ? p.substring(b.length) : p;
    },
    set: (v: string, ctx: PartContext) => ctx.patch((u) => (u.pathname = ctx.resolve(v))),
  },
  search: {
    get: (u: URL) => u.search,
    set: (v: string, ctx: PartContext) => ctx.patch((u) => (u.search = v)),
  },
  hash: {
    get: (u: URL) => u.hash,
    set: (v: string, ctx: PartContext) => ctx.patch((u) => (u.hash = v)),
  },
  query: {
    get: (u: URL) => Object.fromEntries(u.searchParams) as Record<string, string>,
    set: (v: Record<string, string>, ctx: PartContext) =>
      ctx.patch((u) => {
        const p = new URLSearchParams();
        Object.entries(v).forEach(([k, val]) => {
          if (val != null) p.set(k, String(val));
        });
        u.search = p.toString();
      }),
    equal: shallowEqual,
  },
  state: {
    get: (_: URL, ctx: PartContext) => ctx.snapshot().state,
    set: (v: unknown, ctx: PartContext) => ctx.patch(() => {}, v, 'replace'),
    equal: shallowEqual,
  },
} as const;

// --- Logic Helpers ---

const isExternal = (url: string) => PROTOCOL_REGEX.test(url) || url.startsWith('//');

const resolveUrl = (url: string, base: string, current: string): string => {
  if (!IS_BROWSER || isExternal(url)) return url;

  if (url.startsWith('/')) {
    if (!base || base === '/') return url;
    return url.startsWith(`${base}/`) || url === base ? url : `${base}${url}`;
  }

  // Reason: Native URL resolution for relative paths.
  return Result.unwrapOrElse(
    Result.tryCatch(() => {
      const resolved = new URL(url, current);
      return resolved.pathname + resolved.search + resolved.hash;
    }),
    () => url
  );
};

// --- Implementation ---

/**
 * Reactive URL state manager.
 * Orchestrates the relationship between browser location and atom-effect.
 */
class AtomUrlImpl implements AtomUrl {
  #snapshot = atom<UrlSnapshot>(
    {
      url: IS_BROWSER ? window.location.href : FALLBACK_URL,
      type: 'init',
      state: IS_BROWSER ? window.history.state : null,
    },
    { name: 'url:snapshot' }
  );

  #resources: { dispose(): void }[] = [];
  #ignoreSync = false;
  #navPending = false;
  #pending: Option<PendingNav> = Option.none;
  #cleanup: Option<() => void> = Option.none;

  public readonly base = atom('', { name: 'url:base' });

  public readonly url: ReadonlyAtom<string>;
  public readonly type: ReadonlyAtom<NavigationType>;
  public readonly path: WritableAtom<string>;
  public readonly search: WritableAtom<string>;
  public readonly hash: WritableAtom<string>;
  public readonly query: WritableAtom<Record<string, string>>;
  public readonly state: WritableAtom<unknown>;

  #urlObj: ReadonlyAtom<URL>;

  constructor() {
    this.#urlObj = this.#createResilient(() =>
      computed(
        () => {
          return Result.unwrapOrElse(
            Result.tryCatch(() => new URL(this.#snapshot.value.url)),
            () => new URL(IS_BROWSER ? window.location.href : FALLBACK_URL)
          );
        },
        { name: 'url:obj' }
      )
    );

    this.url = this.#createResilient(() =>
      computed(() => this.#snapshot.value.url, { name: 'url:full' })
    );
    this.type = this.#createResilient(() =>
      computed(() => this.#snapshot.value.type, { name: 'url:type' })
    );

    const ctx: PartContext = {
      resolve: (url) => this.#resolve(url),
      patch: (update, state, method) => this.#patch(update, state, method),
      snapshot: () => this.#snapshot.peek(),
      base: () => this.#getNormalizedBase(),
    };

    this.path = this.#createPart(URL_PARTS_CONFIG.path, ctx);
    this.search = this.#createPart(URL_PARTS_CONFIG.search, ctx);
    this.hash = this.#createPart(URL_PARTS_CONFIG.hash, ctx);
    this.query = this.#createPart(URL_PARTS_CONFIG.query, ctx);
    this.state = this.#createPart(URL_PARTS_CONFIG.state, ctx);

    this.#setupListeners();
  }

  // --- Internal Methods ---

  #createPart<T>(
    spec: {
      get: (u: URL, ctx: PartContext) => T;
      set: (v: T, ctx: PartContext) => void;
      equal?: (a: T, b: T) => boolean;
    },
    ctx: PartContext
  ): WritableAtom<T> {
    return this.#createUrlPart(
      () => spec.get(this.#urlObj.value, ctx),
      (v: T) => spec.set(v, ctx),
      spec.equal
    );
  }

  #getNormalizedBase(): string {
    let b = this.base.peek();
    if (!b) return '';
    if (!b.startsWith('/')) b = `/${b}`;
    return b.endsWith('/') ? b.slice(0, -1) : b;
  }

  #resolve(url: string): string {
    return resolveUrl(url, this.#getNormalizedBase(), this.#snapshot.peek().url);
  }

  /**
   * Batches multiple URL property updates into a single navigation event.
   * Logic: Defers navigation to a microtask and prioritizes 'push' over 'replace'.
   */
  #patch(update: (url: URL) => void, state?: unknown, method: 'push' | 'replace' = 'push') {
    const current = this.#snapshot.peek();
    if (Option.isNone(this.#pending)) {
      this.#pending = Option.some({ url: new URL(current.url), state: current.state, method });
    }

    Option.match(this.#pending, {
      some: (p: PendingNav) => {
        if (NAV_PRIORITY[method] > NAV_PRIORITY[p.method]) p.method = method;
        update(p.url);
        if (state !== undefined) p.state = state;
      },
      none: () => {},
    });

    if (!this.#navPending) {
      this.#navPending = true;
      Promise.resolve().then(() => {
        if (!this.#navPending) return;
        Option.match(this.#pending, {
          some: ({ url, state: s, method: m }: PendingNav) => {
            this.#navPending = false;
            this.#pending = Option.none;
            this.#navigate(url.href, s, m);
          },
          none: () => {
            this.#navPending = false;
          },
        });
      });
    }
  }

  #navigate(url: string, state: unknown, method: 'push' | 'replace') {
    if (!IS_BROWSER) return;
    // Reason: Prevents the resulting popstate/hashchange from triggering a loop.
    this.#ignoreSync = true;
    try {
      NAV_STRATEGIES[method].history(window.history, state, url);
      this.update(method);
    } finally {
      this.#ignoreSync = false;
    }
  }

  #setupListeners() {
    if (!IS_BROWSER) return;
    const sync = (t: NavigationType) => !this.#ignoreSync && this.update(t);
    const onPop = () => sync('pop');
    const onHash = () => sync('hash');

    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onHash);

    this.#cleanup = Option.some(() => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onHash);
    });
  }

  /**
   * Wraps an atom in a proxy that automatically recreates it if accessed after disposal.
   * Reason: Atoms may be disposed during component unmounts; this ensures the bridge
   * remains alive for long-lived shared state.
   */
  #createResilient<T>(creator: () => WritableAtom<T>): WritableAtom<T>;
  #createResilient<T>(creator: () => ReadonlyAtom<T>): ReadonlyAtom<T>;
  #createResilient<T>(
    creator: () => WritableAtom<T> | ReadonlyAtom<T>
  ): WritableAtom<T> | ReadonlyAtom<T> {
    let instance = creator() as WritableAtom<T>;

    const access = <R>(fn: (atom: WritableAtom<T>) => R): R => {
      try {
        return fn(instance);
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string } | null;
        if (err?.name === 'ComputedError' || err?.message?.includes('disposed')) {
          instance = creator() as WritableAtom<T>;
          return fn(instance);
        }
        throw e;
      }
    };

    const proxy = {
      get value() {
        return access((a) => a.value);
      },
      set value(v: T) {
        access((a) => {
          a.value = v;
        });
      },
      peek: () => access((a) => a.peek()),
      subscribe: (fn: (val?: T) => void) => access((a) => a.subscribe(fn)),
      dispose: () => instance.dispose(),
      subscriberCount: () => access((a) => a.subscriberCount()),
    } as WritableAtom<T>;

    this.#resources.push(proxy);
    return proxy;
  }

  #createUrlPart<T>(
    get: () => T,
    set: (v: T) => void,
    equal?: (a: T, b: T) => boolean
  ): WritableAtom<T> {
    return this.#createResilient(() => {
      const c = computed(get, equal ? { equal } : {});
      return {
        get value() {
          return c.value;
        },
        set value(v: T) {
          if (equal ? !equal(c.peek(), v) : c.peek() !== v) set(v);
        },
        peek: () => c.peek(),
        subscribe: (fn: (val?: T) => void) => c.subscribe(fn),
        dispose: () => c.dispose(),
        subscriberCount: () => c.subscriberCount(),
      } as WritableAtom<T>;
    }) as WritableAtom<T>;
  }

  // --- Public API ---

  /**
   * Explicit handshake between the Browser's Location and the Atom system.
   * Call manually if external scripts modify History without triggering events.
   */
  public update(type: NavigationType) {
    const url = IS_BROWSER ? window.location.href : FALLBACK_URL;
    const state = IS_BROWSER ? window.history.state : null;
    const current = this.#snapshot.peek();

    this.#navPending = false;
    this.#pending = Option.none;

    if (current.url === url && shallowEqual(current.state, state) && current.type === type) return;

    batch(() => {
      this.#snapshot.value = { url, state, type };
    });
  }

  /**
   * Adds a new entry to history and updates reactive state.
   * @example $.atomUrl.push('/search', { q: 'query' });
   */
  public push(url: string, state: unknown = null) {
    this.#doNavigate('push', url, state);
  }

  /**
   * Replaces the current history entry.
   * @example $.atomUrl.replace('/login');
   */
  public replace(url: string, state: unknown = null) {
    this.#doNavigate('replace', url, state);
  }

  #doNavigate(method: 'push' | 'replace', url: string, state: unknown) {
    const resolved = this.#resolve(url);
    if (isExternal(resolved)) {
      if (IS_BROWSER) NAV_STRATEGIES[method].location(window.location, resolved);
      return;
    }
    this.#navigate(resolved, state, method);
  }

  public back() {
    IS_BROWSER && window.history.back();
  }
  public forward() {
    IS_BROWSER && window.history.forward();
  }

  /**
   * Forces re-synchronization and ensures listeners are active.
   */
  public reset() {
    if (IS_BROWSER && Option.isNone(this.#cleanup)) this.#setupListeners();
    this.update('init');
  }

  public dispose() {
    Option.match(this.#cleanup, { some: (f: () => void) => f(), none: () => {} });
    this.#cleanup = Option.none;
    this.#navPending = false;
    this.#resources.forEach((r) => r.dispose());
    this.#resources.length = 0;
  }
}

export const atomUrl: AtomUrl = new AtomUrlImpl();
$.extend({ atomUrl });
