/**
 * @module AtomNavigation
 *
 * Responsibility:
 * Provides a reactive PJAX-style navigation manager (atomNav) that enables
 * seamless fragment updates without full page reloads.
 *
 * Design Intent:
 * Synchronizes the browser History API, reactive application state, and DOM
 * reconciliation to provide a single-page application experience within JQuery.
 */

import { Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import {
  type ContentState,
  extractContent,
  getAbsoluteUrl,
  getScrollDecision,
  getUrlParts,
  isInterceptee,
  isNavigationClick,
  type NavigationType,
  navCoordinator,
  performScroll,
  syncMetaData,
  updateAttributes,
} from '@/core/navigation';
import { registry } from '@/core/registry';
import type { AtomNav, AtomNavOptions, ReadonlyAtom, WritableAtom } from '@/types';
import { DEFAULT_POLICY, sanitizeHtml } from '@/utils/sanitize';

const NAV_POLICY = {
  ...DEFAULT_POLICY,
  urlAttributes: [...DEFAULT_POLICY.urlAttributes],
  blacklistedTags: DEFAULT_POLICY.blacklistedTags.filter((tag) => tag !== 'form'),
};

/** @internal */
interface NavState {
  url: string;
  type: NavigationType;
}

/**
 * Logic: DOM Reconciliation
 * Synchronizes the fetched content state with the physical DOM.
 *
 * Constraint: Cleanup
 * Must perform a deep cleanup of internal atom bindings within the target
 * before replacing HTML.
 *
 * Reason: Prevents memory leaks and 'ghost' reactive effects from elements
 * that are no longer in the document but still registered in the registry.
 */
function reconcileDOM(
  $target: JQuery,
  state: ContentState,
  url: string,
  previousUrl: string,
  win: Window,
  options: AtomNavOptions
): void {
  $.untracked(() => {
    options.onUnmount?.($target, previousUrl);

    // Constraint: Clean up internal atom bindings within the target before replacing HTML
    $target.children().atomUnbind();

    const syncTitle = options.syncTitle ?? true;
    if (syncTitle && state.title != null && win.document.title !== state.title) {
      win.document.title = state.title;
    }
    if (state.meta) {
      syncMetaData(win, state.meta);
    }
    const el = $target[0];
    if (el && state.attributes) {
      updateAttributes(el, state.attributes);
    }
    $target.html(state.html);

    options.onMount?.($target, url);
  });
}

/**
 * Logic: Navigation Transition Apply
 * Performs DOM updates and browser history synchronization within a single reactive batch.
 */
function applyNavigationState(
  win: Window,
  $target: JQuery,
  intent: WritableAtom<NavState>,
  rendered: WritableAtom<{ url: string; path: string }>,
  pjaxState: ContentState,
  url: string,
  hash: string,
  type: NavigationType,
  curRendered: { url: string; path: string },
  options: AtomNavOptions
): void {
  const isRedirect = !!(pjaxState.redirectUrl && pjaxState.redirectUrl !== url);
  const previousUrl = curRendered.url;

  let finalUrl = isRedirect ? (pjaxState.redirectUrl as string) : url;
  if (isRedirect && hash && !finalUrl.includes('#')) {
    finalUrl += `#${hash}`;
  }

  const { pathAndSearch: finalPath } = getUrlParts(finalUrl, win.location.href);
  const isNewTarget = finalPath !== curRendered.path;

  $.batch(() => {
    if (isRedirect) {
      win.history.replaceState(null, '', finalUrl);
      intent.value = { url: finalUrl, type: 'push' };
    }

    if (isNewTarget || isRedirect) {
      reconcileDOM($target, pjaxState, finalUrl, previousUrl, win, options);
    }

    const prevHash = getUrlParts(curRendered.url, win.location.href).hash;
    const { shouldScroll, resetScroll } = getScrollDecision({
      hash,
      type,
      isNewTarget,
      prevHash,
      scrollToTop: options.scrollToTop ?? true,
    });

    if (shouldScroll) performScroll(win, hash, resetScroll);
    rendered.value = { url: finalUrl, path: finalPath };
  });
}

/** @internal */
function resolveTargetSelector(target: unknown, $target: JQuery): string | undefined {
  const id = typeof target === 'string' ? target : $target.attr('id');
  if (!id) return undefined;
  return id.startsWith('#') ? id : `#${$.escapeSelector(id)}`;
}

/**
 * Logic: Reactive Navigation Orchestrator
 * Provides a PJAX-style manager that synchronizes the URL with server-fetched fragments.
 *
 * When to use:
 * - When building a "Single Page" experience within a JQuery environment.
 * - When specific DOM containers need to reflect the current URL state.
 *
 * Performance Characteristics:
 * - Implements hash-only transition optimization to avoid redundant network requests.
 * - Uses batched reactive updates to minimize layout thrashing during navigation.
 *
 * @example
 * ```typescript
 * const nav = $.atomNav({
 *   target: '#main-content',
 *   onMount: ($el) => console.log('Swapped!'),
 * });
 *
 * // Monitor navigation status
 * $.effect(() => {
 *   if (nav.isPending.value) showSpinner();
 *   else hideSpinner();
 * });
 *
 * // Programmatic navigation
 * $('#link').on('click', () => nav.navigate('/settings'));
 * ```
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  const { target, selector = 'a[data-nav]', headers = {} } = options;
  const win = options.window ?? (window as Window & typeof globalThis);
  const $target =
    typeof target === 'string'
      ? $(target)
      : target instanceof HTMLElement
        ? $(target)
        : (target as JQuery<HTMLElement>);

  $target.attr('data-atom-nav-target', 'true');

  const initialUrlObj = new URL(win.location.href);
  const initialUrl = initialUrlObj.pathname + initialUrlObj.search + initialUrlObj.hash;
  const initialPath = initialUrlObj.pathname + initialUrlObj.search;

  // Reactivity State
  const intent = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:intent' });
  const rendered = $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' });
  const fetchVersion = $.atom(0, { name: 'nav:version' });
  const pendingHooks = $.atom(0, { name: 'nav:hook-pending' });

  const targetSelector = resolveTargetSelector(target, $target);

  /**
   * Logic: Fragment Fetch Pipeline
   * Automates the AJAX request, fragment extraction, and security sanitization.
   */
  const content = $.atomFetch<ContentState>(
    () => {
      fetchVersion.value;
      const { pathAndSearch } = getUrlParts(intent.value.url, win.location.href);
      return pathAndSearch;
    },
    {
      name: 'nav:content',
      defaultValue: { html: '', title: null },
      headers: {
        'X-PJAX': 'true',
        ...(targetSelector ? { 'X-PJAX-Container': targetSelector } : {}),
        ...headers,
      },
      eager: false,
      transform: (raw, xhr) => {
        const result = extractContent({
          html: String(raw),
          selector: targetSelector,
          redirectUrl: xhr?.getResponseHeader?.('X-PJAX-URL') ?? undefined,
          title: xhr?.getResponseHeader?.('X-PJAX-Title') ?? undefined,
        });
        return { ...result, html: sanitizeHtml(result.html, NAV_POLICY).trim() };
      },
    }
  );

  // Logic: Lifecycle Orchestration
  let _navController: AbortController | null = null;
  const _lifecycleController = new AbortController();

  const renewAbortSignal = (): AbortController => {
    _navController?.abort();
    (content as { abort?: () => void }).abort?.();
    const controller = new AbortController();
    _navController = controller;
    return controller;
  };

  /**
   * Logic: Global Sync Effect
   * The core engine that reacts to 'intent' changes and coordinates
   * the fetch -> reconcile -> scroll flow.
   */
  const mainEffect = $.effect(
    (): undefined => {
      const { url, type } = intent.value;
      const { pathAndSearch, hash } = getUrlParts(url, win.location.href);
      const curRendered = $.untracked(() => rendered.value);

      if (pathAndSearch === curRendered.path) {
        $.untracked(() => {
          if (hash) performScroll(win, hash);

          if (type === 'init') {
            options.onMount?.($target, url);
            intent.value = { ...intent.peek(), type: 'push' };
          } else if (url !== curRendered.url) {
            rendered.value = { ...curRendered, url };
          }
        });
        return undefined;
      }

      const pjaxState = content.value;

      if (content.hasError) {
        const error = content.lastError;
        if (error instanceof Error && error.name === 'AbortError') return undefined;
        if ((options.onError?.(error, url) ?? true) !== false) {
          win.location.assign(url);
        }
        return undefined;
      }

      if (!content.isResolved || content.isPending) return undefined;

      applyNavigationState(
        win,
        $target,
        intent,
        rendered,
        pjaxState,
        url,
        hash,
        type,
        curRendered,
        options
      );

      return undefined;
    },
    { name: 'nav:sync-effect' }
  );

  const handlePopState = (): void => {
    renewAbortSignal();
    const loc = win.location;
    intent.value = { url: loc.pathname + loc.search + loc.hash, type: 'pop' };
  };

  const handleLinkClick = (e: MouseEvent): void => {
    if (e.defaultPrevented || !(e.target instanceof Element)) return;
    const el = e.target.closest<HTMLAnchorElement>(selector);
    if (!el) return;

    const targetAttr = el.dataset.target;
    const myId = $target.attr('id');
    const isExplicit = !!(targetAttr && myId && targetAttr === `#${myId}`);
    if (targetAttr) {
      if (!isExplicit) return;
    } else {
      const closest = $(el).closest('[data-atom-nav-target="true"]')[0];
      if (closest && closest !== $target[0]) return;
    }

    if (isNavigationClick(e) && isInterceptee(el, win)) {
      e.preventDefault();
      navigator.navigate(el.href);
    }
  };

  // Browser Event Subscriptions
  win.addEventListener('popstate', handlePopState, { signal: _lifecycleController.signal });
  win.document.addEventListener('click', handleLinkClick, {
    signal: _lifecycleController.signal,
  });

  const isPending = $.computed(() => content.isPending || pendingHooks.value > 0, {
    name: 'nav:isPending',
  });
  const hasError = $.computed(() => content.hasError, { name: 'nav:hasError' });

  // Logic: Public API Implementation
  const navigator: AtomNav = {
    currentUrl: $.computed(() => rendered.value.url, { name: 'nav:public-url' }),
    isPending,
    hasError,

    async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
      const { signal } = renewAbortSignal();
      const type: NavigationType = navOptions.replace ? 'replace' : 'push';

      const base = win.document.baseURI ?? win.location.href;
      const targetRes = getAbsoluteUrl(url, base);
      if (Result.isErr(targetRes)) return;

      const target = Result.unwrap(targetRes);
      const current = new URL(win.location.href);
      const path = target.pathname + target.search;
      const isSamePath = path === current.pathname + current.search;

      if (target.origin !== current.origin) {
        win.location.assign(url);
        return;
      }

      if (isSamePath && target.hash === current.hash && type === 'push') {
        if (hasError.peek()) {
          fetchVersion.value++;
        } else if (url.includes('#')) {
          performScroll(win, target.hash.slice(1), true);
        }
        return;
      }

      if (!isSamePath && options.onBeforeLoad) {
        pendingHooks.value++;
        try {
          const ok = await options.onBeforeLoad(url, signal);
          if (signal.aborted || ok === false) return;
        } finally {
          pendingHooks.value = Math.max(0, pendingHooks.value - 1);
        }
      }

      const container = $target[0];
      if (container && !navCoordinator.canLeaveWithin(container)) {
        return;
      }

      $.batch(() => {
        const historyMethod = type === 'replace' ? 'replaceState' : 'pushState';
        win.history[historyMethod](null, '', path + target.hash);
        intent.value = { url: path + target.hash, type };
      });
    },

    destroy() {
      _lifecycleController.abort();
      _navController?.abort();
      mainEffect.dispose();
      content.dispose();
      $target.removeAttr('data-atom-nav-target');

      const atoms = [
        intent,
        fetchVersion,
        pendingHooks,
        rendered,
        navigator.currentUrl,
        isPending,
        hasError,
      ];
      for (const a of atoms) {
        (a as ReadonlyAtom).dispose?.();
      }
    },
  };

  if ($target[0]) {
    navCoordinator.register($target[0], 'nav');
    registry.onCleanup($target[0], () => navigator.destroy());
  }

  return navigator;
}

$.extend({ atomNav });
