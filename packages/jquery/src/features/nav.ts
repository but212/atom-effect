import $ from 'jquery';
import { SHARED_PARSER } from '@/core/dom';
import type {
  AtomNav,
  AtomNavOptions,
  ComputedAtom,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';
import { sanitizeHtml } from '@/utils/sanitize';

type NavigationType = 'init' | 'push' | 'replace' | 'pop';

interface NavState {
  url: string;

  type: NavigationType;
}

interface ContentState {
  html: string;
  title: string | null;
  attributes?: Record<string, string> | undefined;
  redirectUrl?: string | null | undefined;
  meta?: Record<string, string> | undefined;
}

const NavHelpers = {
  getAbsoluteUrl(url: string, base: string): URL {
    try {
      return new URL(url, base);
    } catch {
      return new URL(url, 'http://localhost');
    }
  },

  getCurrentFull(win: Window): string {
    const { pathname, search, hash } = win.location;
    return (pathname || '/') + (search || '') + (hash || '');
  },

  getPathAndSearch(urlObj: URL): string {
    return urlObj.pathname + urlObj.search;
  },

  extractContent(html: string, selector?: string, xhr?: JQuery.jqXHR): ContentState {
    const doc = SHARED_PARSER.parseFromString(html, 'text/html');
    const title = doc.querySelector('title')?.textContent?.trim() || null;

    const contentNode = selector ? doc.querySelector(selector) : null;
    const rawHtml = contentNode ? contentNode.innerHTML : doc.body?.innerHTML || html;

    const attributes: Record<string, string> = {};
    if (contentNode) {
      for (const { name, value } of Array.from(contentNode.attributes)) {
        if (name !== 'id') attributes[name] = value;
      }
    }

    const meta: Record<string, string> = {};
    const getMeta = (sel: string) => doc.querySelector(sel)?.getAttribute('content');
    const desc = getMeta('meta[name="description"]');
    const keys = getMeta('meta[name="keywords"]');
    const can = doc.querySelector('link[rel="canonical"]')?.getAttribute('href');

    if (desc) meta.description = desc;
    if (keys) meta.keywords = keys;
    if (can) meta.canonical = can;

    return {
      html: sanitizeHtml(rawHtml).trim(),
      title,
      attributes,
      redirectUrl: xhr?.getResponseHeader?.('X-PJAX-URL') || undefined,
      meta,
    };
  },

  scrollTo(win: Window, hash?: string, fallbackToTop = false): void {
    if (hash) {
      const el = win.document.getElementById(decodeURIComponent(hash));
      if (el) {
        el.scrollIntoView({ behavior: 'auto', block: 'start' });
        return;
      }
      if (!fallbackToTop) return;
    }
    win.scrollTo(0, 0);
  },

  shouldIntercept(el: HTMLAnchorElement, win: Window): boolean {
    const targetHref = el.getAttribute('href');

    if (
      !targetHref ||
      targetHref.startsWith('#') ||
      el.target === '_blank' ||
      el.hasAttribute('download') ||
      el.getAttribute('rel') === 'external' ||
      el.dataset.nav === 'false' ||
      (el.protocol !== 'http:' && el.protocol !== 'https:')
    ) {
      return false;
    }

    try {
      const targetOrigin =
        el.origin ??
        new URL(el.href, el.ownerDocument.location?.href ?? win.location.origin).origin;
      return targetOrigin === win.location.origin;
    } catch {
      return false;
    }
  },
};

class AtomNavigator implements AtomNav {
  public readonly currentUrl: ReadonlyAtom<string>;

  public readonly isPending: ReadonlyAtom<boolean>;

  public readonly hasError: ReadonlyAtom<boolean>;

  private readonly _navState: WritableAtom<NavState>;
  private readonly _pendingHookCount: WritableAtom<number>;
  private readonly _renderedState: WritableAtom<{ url: string; path: string }>;

  private readonly _lifecycleController = new AbortController();

  private _navController: AbortController | null = null;

  private readonly _normalizedState: ComputedAtom<{
    url: string;
    pathAndSearch: string;
    hash: string;
    type: NavigationType;
  }>;

  private readonly _content: ComputedAtom<ContentState> & { dispose(): void };

  private readonly _navEffect: EffectObject;

  private readonly _$target: JQuery;

  private readonly _win: Window & typeof globalThis;

  constructor(private readonly options: AtomNavOptions) {
    const { target, selector = 'a[data-nav]', headers = {} } = options;

    this._win = options.window ?? (window as Window & typeof globalThis);
    this._$target = $(target as string);

    this._$target.attr('data-atom-nav-target', 'true');

    const initialUrl = NavHelpers.getCurrentFull(this._win);
    const initialUrlObj = NavHelpers.getAbsoluteUrl(initialUrl, this._win.location.href);
    const initialPath = NavHelpers.getPathAndSearch(initialUrlObj);

    this._navState = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:state' });
    this._pendingHookCount = $.atom(0, { name: 'nav:hook-pending-count' });
    this._renderedState = $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' });

    const targetSelector =
      typeof target === 'string'
        ? target
        : this._$target.attr('id')
          ? `#${$.escapeSelector(this._$target.attr('id')!)}`
          : undefined;

    this._normalizedState = $.computed(
      () => {
        const { url, type } = this._navState.value;
        const urlObj = NavHelpers.getAbsoluteUrl(url, this._win.location.href);
        return {
          url,
          pathAndSearch: NavHelpers.getPathAndSearch(urlObj),
          hash: urlObj.hash.slice(1),
          type,
        };
      },
      { name: 'nav:normalized' }
    );

    this._content = $.atomFetch<ContentState>(() => this._normalizedState.value.pathAndSearch, {
      name: 'nav:content',
      defaultValue: { html: '', title: null },
      headers: { 'X-PJAX': 'true', ...headers },
      eager: false,
      transform: (raw, xhr) => NavHelpers.extractContent(String(raw), targetSelector, xhr),
    });

    this._navEffect = $.effect(() => this._syncUI(), { name: 'nav:sync-effect' });
    this._setupListeners(selector);

    this.currentUrl = $.computed(() => this._navState.value.url, { name: 'nav:public-url' });
    this.isPending = $.computed(() => this._content.isPending || this._pendingHookCount.value > 0, {
      name: 'nav:isPending',
    });
    this.hasError = $.computed(() => this._content.hasError, { name: 'nav:hasError' });
  }

  private _syncUI(): undefined {
    const { url, pathAndSearch, hash, type } = this._normalizedState.value;
    const rendered = this._renderedState.value;

    if (type === 'init' && pathAndSearch === rendered.path) {
      this._handleInitialLoad(url, hash);
      return;
    }

    if (this._content.hasError) {
      this._handleError(url);
      return;
    }

    const state = this._content.value;
    if (!this._content.isResolved || this._content.isPending) return;

    const isNewPath = pathAndSearch !== rendered.path;
    const isRedirect = state.redirectUrl && state.redirectUrl !== url;

    if (isRedirect) {
      this._handleRedirect(state.redirectUrl!);
    }

    $.batch(() => {
      if (isNewPath || isRedirect) {
        this._reconcileDOM(state, url);
      }

      this._syncScroll(hash, isNewPath, type === 'pop');
      this._renderedState.value = { url, path: isRedirect ? rendered.path : pathAndSearch };
    });

    return undefined;
  }

  private _handleInitialLoad(url: string, hash: string): void {
    if (hash) NavHelpers.scrollTo(this._win, hash);
    this.options.onMount?.(this._$target, url);
  }

  private _handleRedirect(redirectUrl: string): void {
    const redirectObj = NavHelpers.getAbsoluteUrl(redirectUrl, this._win.location.href);
    const redirectPath = NavHelpers.getPathAndSearch(redirectObj);

    $.batch(() => {
      this._win.history.replaceState(null, '', redirectUrl);
      this._renderedState.value = { url: redirectUrl, path: redirectPath };
      this._navState.value = { url: redirectUrl, type: 'replace' };
    });
  }

  private _handleError(url: string): void {
    const error = this._content.lastError;

    if (error instanceof Error && error.name === 'AbortError') return;

    if (this.options.onError?.(error, url) !== false) {
      this._win.location.assign(url);
    }
  }

  private _reconcileDOM(state: ContentState, url: string): void {
    $.untracked(() => {
      const { syncTitle = true, onUnmount, onMount } = this.options;
      const doc = this._win.document;

      if (syncTitle && state.title !== null && doc.title !== state.title) {
        doc.title = state.title;
      }

      this._syncMetaData(state.meta);

      onUnmount?.(this._$target, this._renderedState.value.url);

      this._$target.children().atomUnbind();

      const el = this._$target[0] as HTMLElement | undefined;
      if (el && state.attributes) {
        this._updateAttributes(el, state.attributes);
      }

      this._$target.html(state.html);

      onMount?.(this._$target, url);
    });
  }

  private _updateAttributes(el: HTMLElement, next: Record<string, string>): void {
    for (const attr of Array.from(el.attributes)) {
      const { name } = attr;

      if (name !== 'id' && name !== 'data-atom-nav-target' && !(name in next)) {
        el.removeAttribute(name);
      }
    }

    for (const [name, value] of Object.entries(next)) {
      if (el.getAttribute(name) !== value) {
        el.setAttribute(name, value);
      }
    }
  }

  private _syncMetaData(meta?: Record<string, string>): void {
    const doc = this._win.document;
    const head = doc.head;

    const sync = (selector: string, value: string | undefined, name: string, isLink = false) => {
      const el = head.querySelector(selector);
      if (!value) {
        el?.remove();
        return;
      }
      const target = el || doc.createElement(isLink ? 'link' : 'meta');
      if (!el) {
        if (isLink) target.setAttribute('rel', 'canonical');
        else target.setAttribute('name', name);
        head.appendChild(target);
      }
      const attr = isLink ? 'href' : 'content';
      if (target.getAttribute(attr) !== value) target.setAttribute(attr, value);
    };

    sync('meta[name="description"]', meta?.description, 'description');
    sync('meta[name="keywords"]', meta?.keywords, 'keywords');
    sync('link[rel="canonical"]', meta?.canonical, 'canonical', true);
  }

  private _syncScroll(hash: string, isNewPath: boolean, isPop: boolean): void {
    const { scrollToTop = true } = this.options;
    const prevUrlObj = NavHelpers.getAbsoluteUrl(
      this._renderedState.value.url,
      this._win.location.href
    );
    const isHashRemoval = !hash && prevUrlObj.hash !== '';

    const shouldScroll = !!hash || (!isPop && (isHashRemoval || (isNewPath && scrollToTop)));

    if (shouldScroll) {
      NavHelpers.scrollTo(this._win, hash, !isPop && isNewPath && scrollToTop);
    }
  }

  private _setupListeners(selector: string): void {
    const doc = this._win.document;

    doc.addEventListener(
      'click',
      (e) => {
        const el = (e.target as Element).closest<HTMLAnchorElement>(selector);
        if (!el) return;

        const targetAttr = el.dataset.target;
        const myId = this._$target.attr('id');
        const isExplicitTarget = targetAttr && myId && targetAttr === `#${myId}`;

        if (targetAttr && !isExplicitTarget) return;

        const closestNavTarget = $(el).closest('[data-atom-nav-target="true"]')[0];
        const isInsideOtherNav = closestNavTarget && closestNavTarget !== this._$target[0];
        if (!isExplicitTarget && isInsideOtherNav) return;

        const isPrevented =
          e.defaultPrevented ||
          (e as unknown as JQuery.Event).isDefaultPrevented?.() ||
          (e as unknown as { originalEvent?: { defaultPrevented?: boolean } }).originalEvent
            ?.defaultPrevented;

        const mouse = e as MouseEvent;
        if (isPrevented || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.button > 0) {
          return;
        }

        if (NavHelpers.shouldIntercept(el, this._win)) {
          e.preventDefault();
          this.navigate(el.href);
        }
      },
      { signal: this._lifecycleController.signal }
    );

    this._win.addEventListener('popstate', this.handlePopState, {
      signal: this._lifecycleController.signal,
    });
  }

  private handlePopState = (): void => {
    this._renewAbortSignal();
    const currentUrl = NavHelpers.getCurrentFull(this._win);
    this._navState.value = { url: currentUrl, type: 'pop' };
  };

  private _renewAbortSignal(): AbortController {
    this._navController?.abort();
    (this._content as unknown as { abort?: () => void }).abort?.();

    const controller = new AbortController();
    this._navController = controller;
    return controller;
  }

  public async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
    const { signal } = this._renewAbortSignal();

    if (this.options.onBeforeLoad) {
      this._pendingHookCount.value++;
      try {
        const ok = await (
          this.options.onBeforeLoad as (
            url: string,
            signal: AbortSignal
          ) => Promise<boolean> | boolean
        )(url, signal);

        if (signal.aborted || ok === false) return;
      } finally {
        this._pendingHookCount.value = Math.max(0, this._pendingHookCount.value - 1);
      }
    }

    const base = this._win.document.baseURI ?? this._win.location.href;
    const targetObj = NavHelpers.getAbsoluteUrl(url, base);
    const currentObj = NavHelpers.getAbsoluteUrl(this._win.location.href, base);

    if (targetObj.origin !== this._win.location.origin) {
      this._win.location.assign(url);
      return;
    }

    const targetPath = NavHelpers.getPathAndSearch(targetObj);
    const currentPath = NavHelpers.getPathAndSearch(currentObj);
    const finalUrl = targetPath + targetObj.hash;

    const isSameLoc =
      targetPath === currentPath && targetObj.hash === (this._win.location.hash || '');

    if (!isSameLoc || navOptions.replace) {
      $.batch(() => {
        const method = navOptions.replace ? 'replaceState' : 'pushState';
        this._win.history[method](null, '', finalUrl);
        this._navState.value = { url: finalUrl, type: navOptions.replace ? 'replace' : 'push' };
      });
    } else if (url.includes('#') || targetObj.hash) {
      NavHelpers.scrollTo(this._win, targetObj.hash.slice(1), true);
    }
  }

  public destroy(): void {
    this._lifecycleController.abort();
    this._navController?.abort();
    this._navEffect.dispose();
    this._content.dispose();
    this._$target.removeAttr('data-atom-nav-target');

    const dispose = (a: ReadonlyAtom) => a.dispose?.();
    [
      this._navState,
      this._pendingHookCount,
      this._renderedState,
      this._normalizedState,
      this.currentUrl,
      this.isPending,
      this.hasError,
    ].forEach(dispose);
  }
}

export function atomNav(options: AtomNavOptions): AtomNav {
  return new AtomNavigator(options);
}

$.extend({ atomNav });
