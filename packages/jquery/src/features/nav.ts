import { Option, Result } from '@but212/atom-effect-utils';
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
 */
function getAbsoluteUrl(url: string, base: string): Result<URL, Error> {
  return Result.tryCatch(() => new URL(url, base));
}

/**
 * Extracts specific content fragments and metadata from a raw HTML string.
 *
 * Logic:
 * 1. Parses the full HTML to extract `<title>` and `<meta>` tags.
 * 2. Isolates the target content using the provided selector.
 * 3. Sanitizes the HTML to prevent XSS before it enters the DOM.
 */
function extractContent(html: string, selector?: string, xhr?: JQuery.jqXHR): ContentState {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const title = Option.unwrapOr(
    Option.map(
      Option.fromNullable(doc.querySelector('title')),
      (el) => el.textContent?.trim() ?? null
    ),
    null
  );

  const contentNodeOpt = Option.fromNullable(selector ? doc.querySelector(selector) : null);
  const rawHtml = Option.unwrapOrElse(
    Option.map(contentNodeOpt, (node) => node.innerHTML),
    () => doc.body?.innerHTML ?? html
  );

  const attributes = Option.unwrapOr(
    Option.map(contentNodeOpt, (node) =>
      Object.fromEntries(
        Array.from(node.attributes)
          .filter((a) => a.name !== 'id')
          .map((a) => [a.name, a.value])
      )
    ),
    {}
  );

  const getMeta = (sel: string) =>
    Option.map(Option.fromNullable(doc.querySelector(sel)), (el) => el.getAttribute('content'));
  const meta: Record<string, string> = {};

  Option.map(getMeta('meta[name="description"]'), (v) => {
    if (v) meta.description = v;
  });
  Option.map(getMeta('meta[name="keywords"]'), (v) => {
    if (v) meta.keywords = v;
  });
  Option.map(Option.fromNullable(doc.querySelector('link[rel="canonical"]')), (el) => {
    Option.map(Option.fromNullable(el.getAttribute('href')), (v) => {
      meta.canonical = v;
    });
  });

  return {
    html: sanitizeHtml(rawHtml).trim(),
    title,
    attributes,
    // Reason: X-PJAX-URL header is used by some servers to indicate the final URL after redirects.
    redirectUrl: Option.unwrapOr(
      Option.map(Option.fromNullable(xhr), (x) => x.getResponseHeader?.('X-PJAX-URL')),
      undefined
    ),
    meta,
  };
}

/** Metadata tag definitions for SEO and document integrity. @internal */
const META_SCHEMA = [
  {
    selector: 'meta[name="description"]',
    name: 'description',
    key: 'description',
    isLink: false,
  },
  { selector: 'meta[name="keywords"]', name: 'keywords', key: 'keywords', isLink: false },
  { selector: 'link[rel="canonical"]', name: 'canonical', key: 'canonical', isLink: true },
] as const;

/**
 * Synchronizes document metadata to maintain SEO and social sharing integrity.
 *
 * Caution: This modifies the global `<head>` section. Existing tags matching
 * the schema are updated, while missing ones are created or removed.
 */
function syncMetaData(win: Window, meta?: Record<string, string>): void {
  const doc = win.document;
  const head = doc.head;

  for (const { selector, name, key, isLink } of META_SCHEMA) {
    const valueOpt = Option.fromNullable(meta?.[key]);
    const elOpt = Option.fromNullable(head.querySelector(selector));

    Option.match(valueOpt, {
      some: (value) => {
        const target = Option.unwrapOrElse(elOpt, () => {
          const newEl = doc.createElement(isLink ? 'link' : 'meta');
          if (isLink) newEl.setAttribute('rel', 'canonical');
          else newEl.setAttribute('name', name);
          head.appendChild(newEl);
          return newEl;
        }) as HTMLElement;

        const attr = isLink ? 'href' : 'content';
        if (target.getAttribute(attr) !== value) {
          target.setAttribute(attr, value);
        }
      },
      none: () => {
        Option.map(elOpt, (el) => el.remove());
      },
    });
  }
}

/**
 * Updates element attributes while preserving internal tracking IDs.
 *
 * Constraint: `id` and `data-atom-nav-target` are never touched to prevent
 * breaking the reactive binding system.
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
 */
function performScroll(win: Window, hash?: string, fallbackToTop = false): void {
  const hashOpt = Option.fromNullable(hash);
  Option.match(hashOpt, {
    some: (h) => {
      const elOpt = Option.fromNullable(win.document.getElementById(decodeURIComponent(h)));
      Option.match(elOpt, {
        some: (el) => el.scrollIntoView({ behavior: 'auto', block: 'start' }),
        none: () => {
          if (fallbackToTop) win.scrollTo(0, 0);
        },
      });
    },
    none: () => win.scrollTo(0, 0),
  });
}

/**
 * Initializes a navigation manager that implements AJAX-based partial page updates.
 *
 * Usage Example:
 * ```typescript
 * const nav = $.atomNav({
 *   target: '#main-content',
 *   onMount: ($el, url) => console.log(`Loaded ${url}`)
 * });
 *
 * nav.navigate('/profile');
 * ```
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  const { target, selector = 'a[data-nav]', headers = {}, syncTitle = true } = options;
  const win = options.window ?? (window as Window & typeof globalThis);
  const $target = $(target as string);

  $target.attr('data-atom-nav-target', 'true');

  const initialUrlObj = new URL(win.location.href);
  const initialUrl = initialUrlObj.pathname + initialUrlObj.search + initialUrlObj.hash;
  const initialPath = initialUrlObj.pathname + initialUrlObj.search;

  // Reactive state management for navigation lifecycle
  const _navState = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:state' });
  const _pendingHookCount = $.atom(0, { name: 'nav:hook-pending-count' });
  const _renderedState = $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' });

  const _normalizedState = $.computed(
    () => {
      const { url } = _navState.value;
      const urlObj = Result.unwrap(getAbsoluteUrl(url, win.location.href));
      return {
        url,
        pathAndSearch: urlObj.pathname + urlObj.search,
        hash: urlObj.hash.slice(1),
        type: _navState.value.type,
      };
    },
    { name: 'nav:normalized' }
  );

  const targetSelector = Option.unwrapOr(
    Option.map(
      Option.fromNullable(typeof target === 'string' ? target : $target.attr('id')),
      (id) => (id.startsWith('#') ? id : `#${$.escapeSelector(id)}`)
    ),
    undefined
  );

  // Automatic data fetching triggered by URL changes
  const _content = $.atomFetch<ContentState>(() => _normalizedState.value.pathAndSearch, {
    name: 'nav:content',
    defaultValue: { html: '', title: null },
    headers: { 'X-PJAX': 'true', ...headers },
    eager: false,
    transform: (raw, xhr) => extractContent(String(raw), targetSelector, xhr),
  });

  const _lifecycleController = new AbortController();
  let _navController: AbortController | null = null;

  /**
   * Cancels in-flight requests and returns a new signal for the current task.
   */
  function _renewAbortSignal(): AbortController {
    Option.map(Option.fromNullable(_navController), (c) => c.abort());
    (_content as unknown as { abort?: () => void }).abort?.();

    const controller = new AbortController();
    _navController = controller;
    return controller;
  }

  /**
   * Applies the fetched HTML and metadata to the physical DOM.
   */
  function reconcileDOM(state: ContentState, url: string, previousUrl: string): void {
    $.untracked(() => {
      const doc = win.document;
      if (syncTitle && state.title !== null && doc.title !== state.title) {
        doc.title = state.title;
      }

      syncMetaData(win, state.meta);
      Option.map(Option.fromNullable(options.onUnmount), (hook) => hook($target, previousUrl));

      // Clean up internal atom bindings within the target before replacing HTML
      $target.children().atomUnbind();

      Option.map(Option.fromNullable($target[0] as HTMLElement | undefined), (el) => {
        Option.map(Option.fromNullable(state.attributes), (attrs) => updateAttributes(el, attrs));
      });

      $target.html(state.html);
      Option.map(Option.fromNullable(options.onMount), (hook) => hook($target, url));
    });
  }

  /**
   * Reactive effect body that synchronizes state to the UI.
   */
  function syncUI(): undefined {
    const { url, pathAndSearch, hash, type } = _normalizedState.value;
    const rendered = _renderedState.value;

    // Fast-path: Handle hash navigation on the current page without re-fetching
    if (type === 'init' && pathAndSearch === rendered.path) {
      if (hash) performScroll(win, hash);
      Option.map(Option.fromNullable(options.onMount), (hook) => hook($target, url));
      return;
    }

    if (_content.hasError) {
      const error = _content.lastError;
      if (error instanceof Error && error.name === 'AbortError') return;

      const shouldDefault = Option.unwrapOr(
        Option.map(Option.fromNullable(options.onError), (hook) => hook(error, url)),
        true
      );
      // Fallback: Perform full page reload if AJAX fails or onError suggests it
      if (shouldDefault !== false) win.location.assign(url);
      return;
    }

    const state = _content.value;
    if (!_content.isResolved || _content.isPending) return;

    const isRedirect = state.redirectUrl && state.redirectUrl !== url;
    const previousUrl = rendered.url;

    const finalUrl = isRedirect ? (state.redirectUrl ?? url) : url;
    const redirectResOpt = isRedirect
      ? Option.some(getAbsoluteUrl(finalUrl, win.location.href))
      : Option.none;

    const finalPath = Option.match(redirectResOpt, {
      some: (res) =>
        Result.unwrapOr(
          Result.map(res, (obj) => obj.pathname + obj.search),
          pathAndSearch
        ),
      none: () => pathAndSearch,
    });
    const isNewTarget = finalPath !== rendered.path;

    $.batch(() => {
      if (isRedirect) win.history.replaceState(null, '', finalUrl);
      if (isNewTarget || isRedirect) reconcileDOM(state, finalUrl, previousUrl);

      const { scrollToTop = true } = options;
      const prevUrlObj = Result.unwrap(getAbsoluteUrl(_renderedState.value.url, win.location.href));
      const isHashRemoval = !hash && prevUrlObj.hash !== '';
      const isPop = type === 'pop';

      // Determine if we should scroll based on hash presence or navigation type
      const shouldScroll = !!hash || (!isPop && (isHashRemoval || (isNewTarget && scrollToTop)));

      if (shouldScroll) performScroll(win, hash, !isPop && isNewTarget && scrollToTop);
      _renderedState.value = { url: finalUrl, path: finalPath };
    });

    return undefined;
  }

  const _navEffect = $.effect(() => syncUI(), { name: 'nav:sync-effect' });

  const handlePopState = (): void => {
    _renewAbortSignal();
    const loc = win.location;
    _navState.value = { url: loc.pathname + loc.search + loc.hash, type: 'pop' };
  };

  const doc = win.document;

  /**
   * Event Interception Logic:
   * Only intercepts links that are:
   * - Same origin
   * - Not a direct hash link (`#...`)
   * - Not opening in a new tab/window
   * - Not a download or external link
   */
  doc.addEventListener(
    'click',
    (e) => {
      const elOpt = Option.fromNullable((e.target as Element).closest<HTMLAnchorElement>(selector));
      Option.map(elOpt, (el) => {
        const targetAttr = el.dataset.target;
        const myId = $target.attr('id');
        const isExplicitTarget = targetAttr && myId && targetAttr === `#${myId}`;

        if (targetAttr && !isExplicitTarget) return;

        const closestNavTarget = $(el).closest('[data-atom-nav-target="true"]')[0];
        const isInsideOtherNav = closestNavTarget && closestNavTarget !== $target[0];
        if (!isExplicitTarget && isInsideOtherNav) return;

        const mouse = e as MouseEvent;
        // Why: Respect manual preventDefault or specific key combos (Ctrl/Cmd) for new tabs
        const isPrevented =
          e.defaultPrevented ||
          (e as unknown as JQuery.Event).isDefaultPrevented?.() ||
          (e as unknown as { originalEvent?: { defaultPrevented?: boolean } }).originalEvent
            ?.defaultPrevented;

        if (isPrevented || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.button > 0)
          return;

        const isInterceptee =
          el.href &&
          !el.hash.startsWith('#') &&
          el.target !== '_blank' &&
          !el.hasAttribute('download') &&
          el.getAttribute('rel') !== 'external' &&
          el.dataset.nav !== 'false' &&
          (el.protocol === 'http:' || el.protocol === 'https:');

        if (isInterceptee && el.origin === win.location.origin) {
          e.preventDefault();
          navigator.navigate(el.href);
        }
      });
    },
    { signal: _lifecycleController.signal }
  );

  win.addEventListener('popstate', handlePopState, { signal: _lifecycleController.signal });

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
     * Programmatically navigates to a new URL using PJAX.
     */
    async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
      const { signal } = _renewAbortSignal();
      const type: NavigationType = navOptions.replace ? 'replace' : 'push';

      const base = win.document.baseURI ?? win.location.href;
      const targetRes = getAbsoluteUrl(url, base);
      const target = Result.unwrap(targetRes);
      const current = new URL(win.location.href, base);

      if (target.origin !== current.origin) {
        return win.location.assign(url);
      }

      const path = target.pathname + target.search;
      const isSamePath = path === current.pathname + current.search;
      const isSameLoc = isSamePath && target.hash === (current.hash ?? '');

      if (isSameLoc && type === 'push') {
        if (url.includes('#')) performScroll(win, target.hash.slice(1), true);
        return;
      }

      // Hook: Run async check before loading new content
      if (!isSamePath && options.onBeforeLoad) {
        _pendingHookCount.value++;
        try {
          const ok = await (options.onBeforeLoad as Function)(url, signal);
          if (signal.aborted || ok === false) return;
        } finally {
          _pendingHookCount.value = Math.max(0, _pendingHookCount.value - 1);
        }
      }

      commitNavigation(path + target.hash, type);
    },

    /**
     * Disposes of the navigation manager, removing all listeners and effects.
     */
    destroy() {
      _lifecycleController.abort();
      Option.map(Option.fromNullable(_navController), (c) => c.abort());
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
