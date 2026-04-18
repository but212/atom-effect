import $ from 'jquery';
import { SHARED_PARSER } from '@/core/dom';
import type { AtomNav, AtomNavOptions, ReadonlyAtom } from '@/types';
import { sanitizeHtml } from '@/utils/sanitize';

type NavigationType = 'init' | 'push' | 'replace' | 'pop';

interface NavState {
  url: string;
  type: NavigationType;
}

interface ContentState {
  html: string;
  title: string | null;
  attributes?: Record<string, string>;
  redirectUrl?: string | null | undefined;
  meta?: Record<string, string>;
}

// ============================================================================
// Utilities: URL & Content Parsing
// ============================================================================

function getAbsoluteUrl(url: string, base: string): URL {
  try {
    return new URL(url, base);
  } catch {
    return new URL(url, 'http://localhost');
  }
}

function getCurrentFullUrl(win: Window): string {
  const { pathname, search, hash } = win.location;
  return (pathname || '/') + (search || '') + (hash || '');
}

function getPathAndSearch(urlObj: URL): string {
  return urlObj.pathname + urlObj.search;
}

function extractContent(html: string, selector?: string, xhr?: JQuery.jqXHR): ContentState {
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
}

// ============================================================================
// Internal Side Effects: DOM, Metadata, Scroll
// ============================================================================

function syncMetaData(win: Window, meta?: Record<string, string>): void {
  const doc = win.document;
  const head = doc.head;

  const sync = (selector: string, value: string | undefined, name: string, isLink = false) => {
    const el = head.querySelector(selector);
    if (!value) {
      el?.remove();
      return;
    }
    const target = (el as HTMLElement) || doc.createElement(isLink ? 'link' : 'meta');
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

function updateAttributes(el: HTMLElement, next: Record<string, string>): void {
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

function performScroll(win: Window, hash?: string, fallbackToTop = false): void {
  if (hash) {
    const el = win.document.getElementById(decodeURIComponent(hash));
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'start' });
      return;
    }
    if (!fallbackToTop) return;
  }
  win.scrollTo(0, 0);
}

// ============================================================================
// atomNav Implementation
// ============================================================================

export function atomNav(options: AtomNavOptions): AtomNav {
  const { target, selector = 'a[data-nav]', headers = {}, syncTitle = true } = options;
  const win = options.window ?? (window as Window & typeof globalThis);
  const $target = $(target as string);

  $target.attr('data-atom-nav-target', 'true');

  const initialUrl = getCurrentFullUrl(win);
  const initialUrlObj = getAbsoluteUrl(initialUrl, win.location.href);
  const initialPath = getPathAndSearch(initialUrlObj);

  // --- State atoms ---
  const _navState = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:state' });
  const _pendingHookCount = $.atom(0, { name: 'nav:hook-pending-count' });
  const _renderedState = $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' });

  // --- Computed lifecycle ---
  const _normalizedState = $.computed(
    () => {
      const { url, type } = _navState.value;
      const urlObj = getAbsoluteUrl(url, win.location.href);
      return {
        url,
        pathAndSearch: getPathAndSearch(urlObj),
        hash: urlObj.hash.slice(1),
        type,
      };
    },
    { name: 'nav:normalized' }
  );

  const targetSelector =
    typeof target === 'string'
      ? target
      : $target.attr('id')
        ? `#${$.escapeSelector($target.attr('id')!)}`
        : undefined;

  const _content = $.atomFetch<ContentState>(() => _normalizedState.value.pathAndSearch, {
    name: 'nav:content',
    defaultValue: { html: '', title: null },
    headers: { 'X-PJAX': 'true', ...headers },
    eager: false,
    transform: (raw, xhr) => extractContent(String(raw), targetSelector, xhr),
  });

  const _lifecycleController = new AbortController();
  let _navController: AbortController | null = null;

  function _renewAbortSignal(): AbortController {
    _navController?.abort();
    (_content as unknown as { abort?: () => void }).abort?.();

    const controller = new AbortController();
    _navController = controller;
    return controller;
  }

  // --- Core Side Effects (Orchestration) ---

  function reconcileDOM(state: ContentState, url: string, previousUrl: string): void {
    $.untracked(() => {
      const doc = win.document;
      if (syncTitle && state.title !== null && doc.title !== state.title) {
        doc.title = state.title;
      }

      syncMetaData(win, state.meta);
      options.onUnmount?.($target, previousUrl);

      $target.children().atomUnbind();

      const el = $target[0] as HTMLElement | undefined;
      if (el && state.attributes) {
        updateAttributes(el, state.attributes);
      }

      $target.html(state.html);
      options.onMount?.($target, url);
    });
  }

  function syncUI(): undefined {
    const { url, pathAndSearch, hash, type } = _normalizedState.value;
    const rendered = _renderedState.value;

    if (type === 'init' && pathAndSearch === rendered.path) {
      if (hash) performScroll(win, hash);
      options.onMount?.($target, url);
      return;
    }

    if (_content.hasError) {
      const error = _content.lastError;
      if (error instanceof Error && error.name === 'AbortError') return;
      if (options.onError?.(error, url) !== false) {
        win.location.assign(url);
      }
      return;
    }

    const state = _content.value;
    if (!_content.isResolved || _content.isPending) return;

    const isRedirect = state.redirectUrl && state.redirectUrl !== url;
    const previousUrl = rendered.url;

    const finalUrl = isRedirect ? state.redirectUrl! : url;
    const redirectObj = isRedirect ? getAbsoluteUrl(finalUrl, win.location.href) : null;
    const finalPath = redirectObj ? getPathAndSearch(redirectObj) : pathAndSearch;
    const isNewTarget = finalPath !== rendered.path;

    $.batch(() => {
      if (isRedirect) {
        win.history.replaceState(null, '', finalUrl);
      }

      if (isNewTarget || isRedirect) {
        reconcileDOM(state, finalUrl, previousUrl);
      }

      const { scrollToTop = true } = options;
      const prevUrlObj = getAbsoluteUrl(_renderedState.value.url, win.location.href);
      const isHashRemoval = !hash && prevUrlObj.hash !== '';
      const isPop = type === 'pop';
      const shouldScroll = !!hash || (!isPop && (isHashRemoval || (isNewTarget && scrollToTop)));

      if (shouldScroll) {
        performScroll(win, hash, !isPop && isNewTarget && scrollToTop);
      }

      _renderedState.value = { url: finalUrl, path: finalPath };
    });

    return undefined;
  }

  const _navEffect = $.effect(() => syncUI(), { name: 'nav:sync-effect' });

  // --- Listeners Setup ---

  const handlePopState = (): void => {
    _renewAbortSignal();
    const currentUrl = getCurrentFullUrl(win);
    _navState.value = { url: currentUrl, type: 'pop' };
  };

  const doc = win.document;
  doc.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest<HTMLAnchorElement>(selector);
      if (!el) return;

      const targetAttr = el.dataset.target;
      const myId = $target.attr('id');
      const isExplicitTarget = targetAttr && myId && targetAttr === `#${myId}`;

      if (targetAttr && !isExplicitTarget) return;

      const closestNavTarget = $(el).closest('[data-atom-nav-target="true"]')[0];
      const isInsideOtherNav = closestNavTarget && closestNavTarget !== $target[0];
      if (!isExplicitTarget && isInsideOtherNav) return;

      const mouse = e as MouseEvent;
      const isPrevented =
        e.defaultPrevented ||
        (e as unknown as JQuery.Event).isDefaultPrevented?.() ||
        (e as unknown as { originalEvent?: { defaultPrevented?: boolean } }).originalEvent
          ?.defaultPrevented;

      if (isPrevented || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.button > 0)
        return;

      const targetHref = el.getAttribute('href');
      const isInterceptee =
        targetHref &&
        !targetHref.startsWith('#') &&
        el.target !== '_blank' &&
        !el.hasAttribute('download') &&
        el.getAttribute('rel') !== 'external' &&
        el.dataset.nav !== 'false' &&
        (el.protocol === 'http:' || el.protocol === 'https:');

      if (isInterceptee) {
        try {
          const targetOrigin =
            el.origin ??
            new URL(el.href, el.ownerDocument.location?.href ?? win.location.origin).origin;
          if (targetOrigin === win.location.origin) {
            e.preventDefault();
            navigator.navigate(el.href);
          }
        } catch {
          /* ignore invalid URLs */
        }
      }
    },
    { signal: _lifecycleController.signal }
  );

  win.addEventListener('popstate', handlePopState, { signal: _lifecycleController.signal });

  // --- Public API ---

  const navigator: AtomNav = {
    currentUrl: $.computed(() => _renderedState.value.url, { name: 'nav:public-url' }),
    isPending: $.computed(() => _content.isPending || _pendingHookCount.value > 0, {
      name: 'nav:isPending',
    }),
    hasError: $.computed(() => _content.hasError, { name: 'nav:hasError' }),

    async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
      const { signal } = _renewAbortSignal();

      if (options.onBeforeLoad) {
        _pendingHookCount.value++;
        try {
          const ok = await (
            options.onBeforeLoad as (url: string, signal: AbortSignal) => Promise<boolean> | boolean
          )(url, signal);
          if (signal.aborted || ok === false) return;
        } finally {
          _pendingHookCount.value = Math.max(0, _pendingHookCount.value - 1);
        }
      }

      const base = win.document.baseURI ?? win.location.href;
      const targetObj = getAbsoluteUrl(url, base);

      if (targetObj.origin !== win.location.origin) {
        win.location.assign(url);
        return;
      }

      const targetPath = getPathAndSearch(targetObj);
      const currentUrlObj = getAbsoluteUrl(win.location.href, base);
      const currentPath = getPathAndSearch(currentUrlObj);
      const finalUrl = targetPath + targetObj.hash;

      const isSameLoc = targetPath === currentPath && targetObj.hash === (win.location.hash || '');

      if (!isSameLoc || navOptions.replace) {
        $.batch(() => {
          const method = navOptions.replace ? 'replaceState' : 'pushState';
          win.history[method](null, '', finalUrl);
          _navState.value = { url: finalUrl, type: navOptions.replace ? 'replace' : 'push' };
        });
      } else if (url.includes('#') || targetObj.hash) {
        performScroll(win, targetObj.hash.slice(1), true);
      }
    },

    destroy() {
      _lifecycleController.abort();
      _navController?.abort();
      _navEffect.dispose();
      _content.dispose();
      $target.removeAttr('data-atom-nav-target');

      const atoms = [
        _navState,
        _pendingHookCount,
        _renderedState,
        _normalizedState,
        navigator.currentUrl,
        navigator.isPending,
        navigator.hasError,
      ];
      atoms.forEach((a) => (a as ReadonlyAtom).dispose?.());
    },
  };

  return navigator;
}

$.extend({ atomNav });
