import $ from 'jquery';
import type { AtomNav, AtomNavOptions, ReadonlyAtom } from '@/types';
import { sanitizeHtml } from '@/utils/sanitize';

/** Internal type for tracking the origin of a navigation request. @internal */
type NavigationType = 'init' | 'push' | 'replace' | 'pop';

/** Internal state for the current location. @internal */
interface NavState {
  url: string;
  type: NavigationType;
}

/** Represents extracted content from a fetched page. @internal */
interface ContentState {
  html: string;
  title: string | null;
  attributes?: Record<string, string>;
  redirectUrl?: string | null | undefined;
  meta?: Record<string, string>;
}

/**
 * Resolves an absolute URL given a relative path and a base.
 * @internal
 */
function getAbsoluteUrl(url: string, base: string): URL {
  try {
    return new URL(url, base);
  } catch {
    return new URL(url, 'http://localhost');
  }
}

/**
 * Retrieves the current location path including search and hash.
 * @internal
 */
function getCurrentFullUrl(win: Window): string {
  const { pathname, search, hash } = win.location;
  return (pathname ?? '/') + (search ?? '') + (hash ?? '');
}

/**
 * Extracts the path and search parameters from a URL object.
 * @internal
 */
function getPathAndSearch(urlObj: URL): string {
  return urlObj.pathname + urlObj.search;
}

/**
 * Extracts specific content fragments and metadata from a raw HTML string.
 *
 * Optimization: DOM Extraction
 * Uses isolated `DOMParser` instances to extract fragments without the
 * performance overhead of invisible iframes or global parser state.
 *
 * @param html - The raw HTML string of the fetched page.
 * @param selector - Optional CSS selector to extract a specific part of the page.
 * @param xhr - The original jqXHR object to check for redirect headers.
 * @returns The extracted content and metadata state.
 * @internal
 */
function extractContent(html: string, selector?: string, xhr?: JQuery.jqXHR): ContentState {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const title = doc.querySelector('title')?.textContent?.trim() ?? null;

  const contentNode = selector ? doc.querySelector(selector) : null;
  const rawHtml = contentNode ? contentNode.innerHTML : (doc.body?.innerHTML ?? html);

  const attributes: Record<string, string> = {};
  if (contentNode) {
    for (const { name, value } of Array.from(contentNode.attributes)) {
      if (name !== 'id') {
        attributes[name] = value;
      }
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
    redirectUrl: xhr?.getResponseHeader?.('X-PJAX-URL') ?? undefined,
    meta,
  };
}

/**
 * Synchronizes document metadata to maintain SEO and social sharing integrity.
 *
 * Logic: SEO Continuity
 * Updates standard meta tags and canonical links during partial AJAX transitions
 * to ensure that the document state remains consistent for social crawlers and
 * browser history previews.
 *
 * @param win - The target Window object.
 * @param meta - The metadata mapping to apply.
 * @internal
 */
function syncMetaData(win: Window, meta?: Record<string, string>): void {
  const doc = win.document;
  const head = doc.head;

  const sync = (selector: string, value: string | undefined, name: string, isLink = false) => {
    const el = head.querySelector(selector);
    if (!value) {
      el?.remove();
      return;
    }
    const target = (el as HTMLElement) ?? doc.createElement(isLink ? 'link' : 'meta');
    if (!el) {
      if (isLink) {
        target.setAttribute('rel', 'canonical');
      } else {
        target.setAttribute('name', name);
      }
      head.appendChild(target);
    }
    const attr = isLink ? 'href' : 'content';
    if (target.getAttribute(attr) !== value) {
      target.setAttribute(attr, value);
    }
  };

  sync('meta[name="description"]', meta?.description, 'description');
  sync('meta[name="keywords"]', meta?.keywords, 'keywords');
  sync('link[rel="canonical"]', meta?.canonical, 'canonical', true);
}

/**
 * Updates element attributes while preserving internal tracking IDs.
 * @internal
 */
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

/**
 * Handles viewport scrolling for hash navigation or page transitions.
 * @internal
 */
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

/**
 * Initializes a navigation manager that implements AJAX-based partial page updates.
 *
 * Logic: Progressive Enhancement
 * This manager hijacks standard link interactions and performs asynchronous
 * DOM replacements while maintaining browser history via the `pushState` API.
 * It coordinates metadata synchronization, scroll restoration, and automated
 * reactive resource cleanup.
 *
 * When to use:
 * - To build single-page application (SPA) experiences within a traditional
 *   jQuery/multi-page environment.
 * - To implement SEO-friendly AJAX navigation with partial container updates.
 *
 * @param options - Configuration including target containers, link selectors, and lifecycle hooks.
 * @returns A navigator interface for programmatic control and state monitoring.
 *
 * @example
 * ```typescript
 * const nav = $.atomNav({
 *   target: '#app-main',
 *   selector: 'a.ajax-link',
 *   onMount: ($target, url) => {
 *     console.log(`Navigated to: ${url}`);
 *   }
 * });
 *
 * // Programmatic navigation
 * nav.navigate('/profile');
 * ```
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  const { target, selector = 'a[data-nav]', headers = {}, syncTitle = true } = options;
  const win = options.window ?? (window as Window & typeof globalThis);
  const $target = $(target as string);

  $target.attr('data-atom-nav-target', 'true');

  const initialUrl = getCurrentFullUrl(win);
  const initialUrlObj = getAbsoluteUrl(initialUrl, win.location.href);
  const initialPath = getPathAndSearch(initialUrlObj);

  const _navState = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:state' });
  const _pendingHookCount = $.atom(0, { name: 'nav:hook-pending-count' });
  const _renderedState = $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' });

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
        ? `#${$.escapeSelector($target.attr('id') ?? '')}`
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

  /**
   * Performs DOM reconciliation by replacing target content and updating metadata.
   *
   * Logic: Reconciliation Lifecycle
   * 1. SEO: Synchronizes document title and meta tags.
   * 2. Cleanup: Triggers `onUnmount` and performs deep `atomUnbind` on the target
   *    subtree to prevent memory leaks from stale reactive fragments.
   * 3. Update: Replaces HTML and applies target container attribute changes.
   * 4. Activation: Executes the `onMount` hook for the new content.
   */
  function reconcileDOM(state: ContentState, url: string, previousUrl: string): void {
    $.untracked(() => {
      const doc = win.document;
      if (syncTitle && state.title !== null && doc.title !== state.title) {
        doc.title = state.title;
      }

      syncMetaData(win, state.meta);
      options.onUnmount?.($target, previousUrl);

      // Logic: Cleanup of reactive elements before subtree replacement.
      // This ensures all event listeners and effects are disposed synchronously.
      $target.children().atomUnbind();

      const el = $target[0] as HTMLElement | undefined;
      if (el && state.attributes) {
        updateAttributes(el, state.attributes);
      }

      $target.html(state.html);
      options.onMount?.($target, url);
    });
  }

  /**
   * Synchronizes the UI state with the current navigation atom values.
   *
   * Optimization: Skips re-fetching if the target path is identical to the
   * currently rendered path, handling only hash-based scrolling.
   */
  function syncUI(): undefined {
    const { url, pathAndSearch, hash, type } = _normalizedState.value;
    const rendered = _renderedState.value;

    if (type === 'init' && pathAndSearch === rendered.path) {
      if (hash) {
        performScroll(win, hash);
      }
      options.onMount?.($target, url);
      return;
    }

    if (_content.hasError) {
      const error = _content.lastError;
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }
      // Logic: If AJAX navigation fails, fall back to a full browser refresh
      // unless suppressed by the onError hook.
      if (options.onError?.(error, url) !== false) {
        win.location.assign(url);
      }
      return;
    }

    const state = _content.value;
    if (!_content.isResolved || _content.isPending) {
      return;
    }

    const isRedirect = state.redirectUrl && state.redirectUrl !== url;
    const previousUrl = rendered.url;

    const finalUrl = isRedirect ? (state.redirectUrl ?? url) : url;
    const redirectObj = isRedirect ? getAbsoluteUrl(finalUrl, win.location.href) : null;
    const finalPath = redirectObj ? getPathAndSearch(redirectObj) : pathAndSearch;
    const isNewTarget = finalPath !== rendered.path;

    $.batch(() => {
      if (isRedirect) {
        // Logic: Correct browser history if the server indicates a redirect via headers.
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

  const handlePopState = (): void => {
    _renewAbortSignal();
    const currentUrl = getCurrentFullUrl(win);
    _navState.value = { url: currentUrl, type: 'pop' };
  };

  const doc = win.document;

  /** Global click listener to hijack navigation links matching the selector. */
  doc.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element).closest<HTMLAnchorElement>(selector);
      if (!el) return;

      const targetAttr = el.dataset.target;
      const myId = $target.attr('id');
      const isExplicitTarget = targetAttr && myId && targetAttr === `#${myId}`;

      // Logic: Ensure the link explicitly targets this navigator instance if a target is specified.
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

      // Logic: Preserve native browser behavior for modified clicks (e.g., Ctrl+Click).
      if (isPrevented || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.button > 0) {
        return;
      }

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
        } catch {}
      }
    },
    { signal: _lifecycleController.signal }
  );

  win.addEventListener('popstate', handlePopState, { signal: _lifecycleController.signal });

  /** Updates history and triggers the reactive navigation state. @internal */
  const commitNavigation = (url: string, type: NavigationType): void => {
    $.batch(() => {
      const method = type === 'replace' ? 'replaceState' : 'pushState';
      win.history[method](null, '', url);
      _navState.value = { url, type };
    });
  };

  const navigator: AtomNav = {
    currentUrl: $.computed(() => _renderedState.value.url, { name: 'nav:public-url' }),
    isPending: $.computed(() => _content.isPending || _pendingHookCount.value > 0, {
      name: 'nav:isPending',
    }),
    hasError: $.computed(() => _content.hasError, { name: 'nav:hasError' }),

    /**
     * Programmatically triggers navigation to a new URL.
     *
     * Logic: Navigation Flow
     * 1. Handoff: Determines if the URL is external and assigns directly if so.
     * 2. Hook Execution: Executes the `onBeforeLoad` async hook (allows cancellation).
     * 3. History: Updates the browser history stack.
     * 4. Trigger: Updates the reactive state to initiate the content fetch.
     *
     * @param url - The target URL (absolute or relative).
     * @param navOptions - Options to control history behavior (e.g., replacement).
     */
    async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
      // Reason: Aborting previous tasks at the entry point prevents state
      // corruption during concurrent navigation attempts.
      const { signal } = _renewAbortSignal();
      const type: NavigationType = navOptions.replace ? 'replace' : 'push';

      const base = win.document.baseURI ?? win.location.href;
      const target = getAbsoluteUrl(url, base);
      const current = getAbsoluteUrl(win.location.href, base);

      if (target.origin !== current.origin) {
        return win.location.assign(url);
      }

      const path = getPathAndSearch(target);
      const isSamePath = path === getPathAndSearch(current);
      const isSameLoc = isSamePath && target.hash === (current.hash ?? '');

      // Logic: If navigation is to the exact same location, only handle scrolling.
      if (isSameLoc && type === 'push') {
        if (url.includes('#') || target.hash) {
          performScroll(win, target.hash.slice(1), true);
        }
        return;
      }

      if (!isSamePath && options.onBeforeLoad) {
        _pendingHookCount.value++;
        try {
          const ok = await (options.onBeforeLoad as Function)(url, signal);
          if (signal.aborted || ok === false) {
            return;
          }
        } finally {
          _pendingHookCount.value = Math.max(0, _pendingHookCount.value - 1);
        }
      }

      commitNavigation(path + target.hash, type);
    },

    /**
     * Constraint: Resource Teardown
     * Disposes of all internal reactive effects, network requests, and
     * global event listeners to prevent memory leaks.
     */
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
