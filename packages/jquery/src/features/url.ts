import { atom, batch, computed } from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import type { AtomUrl, NavigationType, ReadonlyAtom, WritableAtom } from '@/types';
import { shallowEqual } from '@/utils';

/** Internal state of the reactive URL manager. */
interface UrlSnapshot {
  url: string;
  state: unknown;
  type: NavigationType;
}

const IS_BROWSER = typeof window !== 'undefined';
const FALLBACK_URL = 'http://localhost/';
const PROTOCOL_REGEX = /^[a-z][a-z0-9.+-]*:/i;

/**
 * Navigation method priorities for batching: push overrides replace.
 * If a batch contains both, the final operation must be 'push' to preserve history.
 */
const NAV_PRIORITY: Record<'push' | 'replace', number> = { push: 2, replace: 1 };

/**
 * Path resolution logic driven by pattern-action pairs.
 * Note: External and protocol-relative URLs are returned as-is to avoid mangling.
 */
const RESOLVE_RULES: Array<{
  test: (url: string) => boolean;
  exec: (url: string, base: string, current: string) => string;
}> = [
  {
    test: (u) => !IS_BROWSER || PROTOCOL_REGEX.test(u) || u.startsWith('//'),
    exec: (u) => u,
  },
  {
    test: (u) => u.startsWith('/'),
    exec: (u, base) => {
      if (!base || base === '/') return u;
      // Constraint: Absolute paths are resolved relative to the configured basePath.
      return u === base || u.startsWith(`${base}/`) ? u : base + u;
    },
  },
  {
    test: () => true,
    exec: (u, _, current) =>
      Result.unwrapOr(
        Result.tryCatch(() => {
          const resolved = new URL(u, current);
          return resolved.pathname + resolved.search + resolved.hash;
        }),
        u
      ),
  },
];

/**
 * Declarative schema for URL parts extraction and injection.
 * Defines how to read from/write to a native URL object.
 */
const PART_SCHEMA = {
  path: {
    get: (u: URL, base: string) => {
      const p = u.pathname;
      return !base || base === '/'
        ? p
        : p === base
          ? '/'
          : p.startsWith(`${base}/`)
            ? p.substring(base.length)
            : p;
    },
    set: (u: URL, v: string, res: (s: string) => string) => {
      u.pathname = res(v);
    },
  },
  search: {
    // URL spec: search setter normalises the leading '?' automatically.
    get: (u: URL) => u.search,
    set: (u: URL, v: string) => {
      u.search = v;
    },
  },
  hash: {
    // URL spec: hash setter normalises the leading '#' automatically.
    get: (u: URL) => u.hash,
    set: (u: URL, v: string) => {
      u.hash = v;
    },
  },
  params: {
    get: (u: URL) => Object.fromEntries(u.searchParams),
    set: (u: URL, v: Record<string, unknown>) => {
      const p = new URLSearchParams();
      Object.entries(v).forEach(([k, val]) => {
        if (val != null) p.set(k, String(val));
      });
      u.search = p.toString();
    },
  },
} as const;

/** Browser event and history method mappings for synchronization. */
const BINDINGS: Array<
  | { event: string; type: NavigationType }
  | { patch: 'pushState' | 'replaceState'; type: NavigationType }
> = [
  { event: 'popstate', type: 'pop' },
  { event: 'hashchange', type: 'hash' },
  { patch: 'pushState', type: 'push' },
  { patch: 'replaceState', type: 'replace' },
];

/**
 * Reactive URL state manager implementation.
 * Orchestrates browser history API with atom-effect reactive primitives.
 */
class AtomUrlImpl implements AtomUrl {
  private readonly _snapshot = atom<UrlSnapshot>(
    {
      url: IS_BROWSER ? window.location.href : FALLBACK_URL,
      type: 'init',
      state: IS_BROWSER ? window.history.state : null,
    },
    { name: 'url:snapshot' }
  );

  private readonly _basePath = atom('', { name: 'url:base-path' });
  private readonly _computeds: { dispose(): void }[] = [];
  private readonly _navDrivers = {
    push: this.push.bind(this),
    replace: this.replace.bind(this),
  } as const;

  /** Flag to prevent navigation-to-state recursive loops. */
  private _ignoreSync = false;
  private _navPending = false;
  private _pending: Option<{
    url: URL;
    state: unknown;
    method: 'push' | 'replace';
  }> = Option.none;
  private _cleanup: Option<() => void> = Option.none;

  private readonly _urlObj = this._makeResilient(() =>
    computed(
      () => {
        const snap = this._snapshot.value;
        return Result.unwrapOrElse(
          Result.tryCatch(() => new URL(snap.url)),
          () => {
            return new URL(IS_BROWSER ? window.location.href : FALLBACK_URL);
          }
        );
      },
      { name: 'url:obj' }
    )
  );

  /** Returns current basePath with leading slash and no trailing slash. */
  private _getNormalizedBase(): string {
    let base = this._basePath.peek();
    if (!base) return '';
    if (!base.startsWith('/')) base = `/${base}`;
    return base.endsWith('/') ? base.slice(0, -1) : base;
  }

  public readonly url: ReadonlyAtom<string> = this._makeResilient(() =>
    computed(() => this._snapshot.value.url, { name: 'url:full' })
  );

  public readonly type: ReadonlyAtom<NavigationType> = this._makeResilient(() =>
    computed(() => this._snapshot.value.type, { name: 'url:type:read' })
  );

  public readonly path = this._createPart(
    () => PART_SCHEMA.path.get(this._urlObj.value, this._getNormalizedBase()),
    (val) => this._patch((u) => PART_SCHEMA.path.set(u, val, this._resolve.bind(this)))
  );

  public readonly search = this._createPart(
    () => PART_SCHEMA.search.get(this._urlObj.value),
    (val) => this._patch((u) => PART_SCHEMA.search.set(u, val))
  );

  public readonly hash = this._createPart(
    () => PART_SCHEMA.hash.get(this._urlObj.value),
    (val) => this._patch((u) => PART_SCHEMA.hash.set(u, val))
  );

  public readonly params = this._createPart(
    () => PART_SCHEMA.params.get(this._urlObj.value),
    (val) => this._patch((u) => PART_SCHEMA.params.set(u, val as Record<string, unknown>)),
    shallowEqual
  );

  public readonly state = this._createPart(
    () => this._snapshot.value.state,
    (val) => this._patch(() => {}, val, 'replace'),
    shallowEqual
  );

  public get basePath(): string {
    return this._basePath.value;
  }
  public set basePath(val: string) {
    this._basePath.value = val;
  }

  constructor() {
    this._setupListeners();
  }

  /**
   * Consolidates multiple URL property changes into a single history entry via a microtask.
   *
   * Reason: Changing multiple parts (e.g. path and params) synchronously should only
   * trigger one browser navigation call to avoid polluting the history stack.
   */
  private _patch(update: (url: URL) => void, state?: unknown, method: 'push' | 'replace' = 'push') {
    if (Option.isNone(this._pending)) {
      const current = this._snapshot.peek();
      this._pending = Option.some({
        url: new URL(current.url),
        state: current.state,
        method,
      });
    }

    Option.match(this._pending, {
      some: (pending) => {
        // Priority: Any 'push' in the batch upgrades the entire batch to 'push'.
        if (NAV_PRIORITY[method] > NAV_PRIORITY[pending.method]) {
          pending.method = method;
        }

        update(pending.url);
        if (state !== undefined) pending.state = state;
      },
      none: () => {},
    });

    if (!this._navPending) {
      this._navPending = true;
      Promise.resolve().then(() => {
        if (!this._navPending || Option.isNone(this._pending)) return;

        Option.match(this._pending, {
          some: ({ url, state: s, method: m }) => {
            this._navPending = false;
            this._pending = Option.none;

            this._navDrivers[m](url.href, s);
          },
          none: () => {},
        });
      });
    }
  }

  /** Resolves relative or absolute paths against the current basePath and location. */
  private _resolve(url: string): string {
    const base = this._getNormalizedBase();
    const current = this._snapshot.peek().url;
    return Option.match(Option.fromNullable(RESOLVE_RULES.find((r) => r.test(url))), {
      some: (rule) => rule.exec(url, base, current),
      none: () => url,
    });
  }

  /** Track reactive objects for centralized disposal. */
  private _track<T extends { dispose(): void }>(obj: T): T {
    this._computeds.push(obj);
    return obj;
  }

  /**
   * Wraps an atom or computed in a proxy that auto-revives if it was accidentally disposed.
   *
   * Why: This module exports a singleton `atomUrl`. If a user or test accidentally
   * calls `.dispose()` on a part (like `.path`), it would normally break the app permanently.
   * This resilience ensures singleton parts remain functional across app resets.
   */
  private _makeResilient<T>(creator: () => ReadonlyAtom<T>): ReadonlyAtom<T>;
  private _makeResilient<T>(creator: () => WritableAtom<T>): WritableAtom<T>;
  private _makeResilient<T>(
    creator: () => ReadonlyAtom<T> | WritableAtom<T>
  ): ReadonlyAtom<T> | WritableAtom<T> {
    let instance = creator() as WritableAtom<T>;

    const access = <R>(fn: (atom: WritableAtom<T>) => R): R => {
      try {
        return fn(instance);
      } catch (e: unknown) {
        const err = e as { name?: string; message?: string } | null;
        // Logic: Catch errors specifically related to accessing a disposed computed value.
        if (err?.name === 'ComputedError' || err?.message?.includes('disposed')) {
          instance = creator() as WritableAtom<T>;
          return fn(instance);
        }
        throw e;
      }
    };

    return this._track({
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
    } as WritableAtom<T>);
  }

  /** Factory for creating resilient, writable URL part atoms. */
  private _createPart<T>(
    get: () => T,
    set: (val: T) => void,
    equal?: (a: T, b: T) => boolean
  ): WritableAtom<T> {
    return this._makeResilient<T>(() => {
      const c = computed(get, equal ? { equal } : {});
      return {
        get value() {
          return c.value;
        },
        set value(v: T) {
          if (equal ? equal(c.peek(), v) : c.peek() === v) return;
          set(v);
        },
        peek: () => c.peek(),
        subscribe: (fn: (val?: T) => void) => c.subscribe(fn),
        dispose: () => c.dispose(),
        subscriberCount: () => c.subscriberCount(),
      } as WritableAtom<T>;
    });
  }

  /** Patches history API and attaches event listeners for bidirectional sync. */
  private _setupListeners(): void {
    if (!IS_BROWSER) return;
    const sync = (type: NavigationType) => {
      if (this._ignoreSync) return;
      this.update(type);
    };

    const cleanups: (() => void)[] = [];

    BINDINGS.forEach((b) => {
      if ('event' in b) {
        const handler = () => sync(b.type);
        window.addEventListener(b.event, handler);
        cleanups.push(() => window.removeEventListener(b.event, handler));
      } else {
        // Reason: pushState/replaceState do not emit browser events.
        // We monkey-patch them to intercept programmatic navigation from other libraries.
        const original = window.history[b.patch];
        window.history[b.patch] = (...args: Parameters<typeof original>) => {
          original.apply(window.history, args);
          sync(b.type);
        };
        cleanups.push(() => {
          window.history[b.patch] = original;
        });
      }
    });

    this._cleanup = Option.some(() => cleanups.forEach((fn) => fn()));
  }

  /** Synchronizes internal snapshot with the current browser location. */
  private update(type: NavigationType): void {
    const url = IS_BROWSER ? window.location.href : FALLBACK_URL;
    const state = IS_BROWSER ? window.history.state : null;
    const current = this._snapshot.peek();

    const normalize = (u: string) =>
      Result.unwrapOrElse(
        Result.tryCatch(() => {
          const parsed = new URL(u);
          return parsed.origin + parsed.pathname + parsed.search + parsed.hash;
        }),
        () => u || '/'
      );

    // Equality check to prevent redundant atom updates and infinite loops.
    if (
      normalize(current.url) === normalize(url) &&
      shallowEqual(current.state, state) &&
      current.type === type
    ) {
      return;
    }

    this._navPending = false;
    this._pending = Option.none;

    batch(() => {
      this._snapshot.value = { url, state, type };
    });
  }

  /**
   * Navigates to a new URL and adds a entry to history.
   *
   * Example:
   * ```typescript
   * $.atomUrl.push('/search?q=query#results');
   * ```
   */
  public push(url: string, state: unknown = null): void {
    if (!IS_BROWSER) return;
    this._ignoreSync = true;
    try {
      window.history.pushState(state, '', this._resolve(url));
      this.update('push');
    } finally {
      this._ignoreSync = false;
    }
  }

  /**
   * Updates the current URL without adding a new entry to history.
   */
  public replace(url: string, state: unknown = null): void {
    if (!IS_BROWSER) return;
    this._ignoreSync = true;
    try {
      window.history.replaceState(state, '', this._resolve(url));
      this.update('replace');
    } finally {
      this._ignoreSync = false;
    }
  }

  public back(): void {
    if (IS_BROWSER) window.history.back();
  }
  public forward(): void {
    if (IS_BROWSER) window.history.forward();
  }

  /** Re-attaches listeners and forces a sync with the current URL. */
  public reset(): void {
    if (IS_BROWSER && Option.isNone(this._cleanup)) this._setupListeners();
    this.update('init');
  }

  /** Fully detaches from the browser and disposes of all reactive parts. */
  public dispose(): void {
    Option.match(this._cleanup, {
      some: (fn) => fn(),
      none: () => {},
    });
    this._cleanup = Option.none;
    this._pending = Option.none;
    this._navPending = false;
    this._computeds.forEach((c) => c.dispose());
    this._computeds.length = 0;
  }
}

/**
 * Singleton instance of the reactive URL manager.
 */
export const atomUrl: AtomUrl = new AtomUrlImpl();
$.extend({ atomUrl });
