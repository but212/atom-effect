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
import type { AtomNav, AtomNavOptions, ReadonlyAtom } from '@/types';
import { sanitizeHtml } from '@/utils/sanitize';

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
function reconcileDOM(params: {
  $target: JQuery;
  state: ContentState;
  url: string;
  previousUrl: string;
  win: Window;
  syncTitle: boolean;
  onMount?: ((el: JQuery, url: string) => void) | undefined;
  onUnmount?: ((el: JQuery, url: string) => void) | undefined;
}): void {
  const { $target, state, url, previousUrl, win, syncTitle, onMount, onUnmount } = params;

  $.untracked(() => {
    onUnmount?.($target, previousUrl);

    // Constraint: Clean up internal atom bindings within the target before replacing HTML
    $target.children().atomUnbind();

    if (syncTitle && state.title !== null && win.document.title !== state.title) {
      win.document.title = state.title;
    }
    if (state.meta) {
      syncMetaData(win, state.meta);
    }
    const el = $target[0] as HTMLElement | undefined;
    if (el && state.attributes) {
      updateAttributes(el, state.attributes);
    }
    $target.html(state.html);

    onMount?.($target, url);
  });
}

/** @internal */
function initNavAtoms(win: Window) {
  const initialUrlObj = new URL(win.location.href);
  const initialUrl = initialUrlObj.pathname + initialUrlObj.search + initialUrlObj.hash;
  const initialPath = initialUrlObj.pathname + initialUrlObj.search;

  return {
    intent: $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:intent' }),
    rendered: $.atom({ url: initialUrl, path: initialPath }, { name: 'nav:rendered' }),
    fetchVersion: $.atom(0, { name: 'nav:version' }),
    pendingHooks: $.atom(0, { name: 'nav:hook-pending' }),
  };
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
  const { target, selector = 'a[data-nav]', headers = {}, syncTitle = true } = options;
  const win = options.window ?? (window as Window & typeof globalThis);
  const $target =
    typeof target === 'string'
      ? $(target)
      : target instanceof HTMLElement
        ? $(target)
        : (target as JQuery<HTMLElement>);

  $target.attr('data-atom-nav-target', 'true');

  const state = initNavAtoms(win);
  const targetSelector = resolveTargetSelector(target, $target);

  const normalized = $.computed(
    () => {
      const { url, type } = state.intent.value;
      const { pathAndSearch, hash } = getUrlParts(url, win.location.href);
      return { url, pathAndSearch, hash, type };
    },
    { name: 'nav:normalized' }
  );

  /**
   * Logic: Fragment Fetch Pipeline
   * Automates the AJAX request, fragment extraction, and security sanitization.
   */
  const content = $.atomFetch<ContentState>(
    () => {
      state.fetchVersion.value;
      return normalized.value.pathAndSearch;
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
        /**
         * Security: Content Sanitization
         * Ensures that the fetched fragment is sanitized before injection to
         * prevent XSS from untrusted or compromised server responses.
         */
        return { ...result, html: sanitizeHtml(result.html).trim() };
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
      const { url, pathAndSearch, hash, type } = normalized.value;
      const rendered = $.untracked(() => state.rendered.value);

      /**
       * Optimization: Hash-only Transition
       * Skips the full fetch-reconcile cycle if the navigation only involves
       * changing the URL hash within the same resource path.
       */
      if (pathAndSearch === rendered.path) {
        $.untracked(() => {
          if (hash) performScroll(win, hash);

          if (type === 'init') {
            options.onMount?.($target, url);
            state.intent.value = { ...state.intent.peek(), type: 'push' };
          } else if (url !== rendered.url) {
            state.rendered.value = { ...rendered, url };
          }
        });
        return undefined;
      }

      const pjaxState = content.value;

      if (content.hasError) {
        const error = content.lastError;
        if (error instanceof Error && error.name === 'AbortError') return undefined;
        // Logic: Error Recovery
        // If the PJAX fetch fails, fallback to a full page reload unless overridden.
        if ((options.onError?.(error, url) ?? true) !== false) {
          win.location.assign(url);
        }
        return undefined;
      }

      if (!content.isResolved || content.isPending) return undefined;

      const isRedirect = !!(pjaxState.redirectUrl && pjaxState.redirectUrl !== url);
      const previousUrl = rendered.url;

      let finalUrl = isRedirect ? (pjaxState.redirectUrl as string) : url;
      if (isRedirect && hash && !finalUrl.includes('#')) {
        finalUrl += `#${hash}`;
      }

      const { pathAndSearch: finalPath } = getUrlParts(finalUrl, win.location.href);
      const isNewTarget = finalPath !== rendered.path;

      $.batch(() => {
        if (isRedirect) {
          win.history.replaceState(null, '', finalUrl);
          state.intent.value = { url: finalUrl, type: 'push' };
        }

        if (isNewTarget || isRedirect) {
          reconcileDOM({
            $target,
            state: pjaxState,
            url: finalUrl,
            previousUrl,
            win,
            syncTitle,
            onMount: options.onMount,
            onUnmount: options.onUnmount,
          });
        }

        const prevUrlObj = Result.unwrap(getAbsoluteUrl(rendered.url, win.location.href));
        const { shouldScroll, resetScroll } = getScrollDecision({
          hash,
          type,
          isNewTarget,
          prevHash: prevUrlObj.hash.slice(1),
          scrollToTop: options.scrollToTop ?? true,
        });

        if (shouldScroll) performScroll(win, hash, resetScroll);
        state.rendered.value = { url: finalUrl, path: finalPath };
      });

      return undefined;
    },
    { name: 'nav:sync-effect' }
  );

  const handlePopState = (): void => {
    renewAbortSignal();
    const loc = win.location;
    state.intent.value = { url: loc.pathname + loc.search + loc.hash, type: 'pop' };
  };

  win.addEventListener('popstate', handlePopState, { signal: _lifecycleController.signal });

  // Logic: Click Interception
  win.document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented) return;
      const el = (e.target as Element).closest<HTMLAnchorElement>(selector);
      if (!el) return;

      const myId = $target.attr('id');
      const targetAttr = el.dataset.target;
      const isExplicitTarget = !!(targetAttr && myId && targetAttr === `#${myId}`);

      if (targetAttr && !isExplicitTarget) return;
      if (!isExplicitTarget) {
        const closestNavTarget = $(el).closest('[data-atom-nav-target="true"]')[0];
        if (closestNavTarget && closestNavTarget !== $target[0]) return;
      }

      if (isNavigationClick(e) && isInterceptee(el, win)) {
        e.preventDefault();
        navigator.navigate(el.href);
      }
    },
    { signal: _lifecycleController.signal }
  );

  const isPending = $.computed(() => content.isPending || state.pendingHooks.value > 0, {
    name: 'nav:isPending',
  });
  const hasError = $.computed(() => content.hasError, { name: 'nav:hasError' });

  // Logic: Public API Implementation
  const navigator: AtomNav = {
    currentUrl: $.computed(() => state.rendered.value.url, { name: 'nav:public-url' }),
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

      // 1. Origin check
      if (target.origin !== current.origin) {
        win.location.assign(url);
        return;
      }

      // 2. Same-path / hash transition optimization
      if (isSamePath && target.hash === current.hash && type === 'push') {
        if (hasError.peek()) {
          state.fetchVersion.value++;
        } else if (url.includes('#')) {
          performScroll(win, target.hash.slice(1), true);
        }
        return;
      }

      // 3. onBeforeLoad hook check
      if (!isSamePath && options.onBeforeLoad) {
        state.pendingHooks.value++;
        try {
          const ok = await options.onBeforeLoad(url, signal);
          if (signal.aborted || ok === false) return;
        } finally {
          state.pendingHooks.value = Math.max(0, state.pendingHooks.value - 1);
        }
      }

      // 4. Leave guard check
      const container = $target[0];
      if (container && !navCoordinator.canLeaveWithin(container)) {
        return;
      }

      // 5. Commit history and update intent
      $.batch(() => {
        const historyMethod = type === 'replace' ? 'replaceState' : 'pushState';
        win.history[historyMethod](null, '', path + target.hash);
        state.intent.value = { url: path + target.hash, type };
      });
    },

    /**
     * Cleanup: Resource Disposal
     * Unbinds all event listeners, stops pending fetches, and removes target markers.
     */
    destroy() {
      _lifecycleController.abort();
      _navController?.abort();
      mainEffect.dispose();
      content.dispose();
      $target.removeAttr('data-atom-nav-target');

      const atoms = [
        state.intent,
        state.fetchVersion,
        state.pendingHooks,
        state.rendered,
        normalized,
        navigator.currentUrl,
        isPending,
        hasError,
      ];
      atoms.forEach((a) => (a as ReadonlyAtom).dispose?.());
    },
  };

  // Logic: Automatic Lifecycle Coordination
  if ($target[0]) {
    navCoordinator.register($target[0], 'nav');
    registry.onCleanup($target[0], () => navigator.destroy());
  }

  return navigator;
}

$.extend({ atomNav });
