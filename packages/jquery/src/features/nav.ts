import $ from 'jquery';
import type { AtomNav, AtomNavOptions, EffectResult } from '@/types';

/**
 * $.atomNav
 *
 * A state-driven lightweight navigation module (PJAX) for jQuery.
 *
 * Features:
 * - Single Source of Truth: Driven by a reactive currentUrl atom.
 * - Memory Safety: Automatically calls .atomUnbind() before replacing content.
 * - Race Condition Protection: Uses $.atomFetch with AbortController internally.
 * - Lifecycle Hooks: onBeforeLoad, onMount, and onUnmount for fine-grained control.
 */
$.atomNav = (options: AtomNavOptions): AtomNav => {
  const {
    target,
    selector = 'a[data-nav]',
    headers = {},
    onBeforeLoad,
    onMount,
    onUnmount,
    scrollToTop = true,
    syncTitle = true,
  } = options;

  // Internal reactive state
  const currentUrl = $.atom(window.location.pathname + window.location.search);
  const previousUrl = $.atom(currentUrl.value);
  const $target = $(target as string & JQuery & HTMLElement);

  // Unique namespace for global event listeners to prevent leaks
  const eventNamespace = `.atomNav_${Math.random().toString(36).slice(2, 11)}`;

  /**
   * Helper: Extract title and clean HTML
   */
  const processHtml = (html: string) => {
    let title: string | null = null;
    let cleanHtml = html;

    const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
    if (titleMatch?.[1]) {
      title = titleMatch[1].trim();
      cleanHtml = html.replace(/<title>([\s\S]*?)<\/title>/gi, '');
    }

    return { html: cleanHtml, title };
  };

  /**
   * Performs navigation to a new URL.
   * Updates history state and reactive atoms.
   */
  const navigate = async (url: string) => {
    if (onBeforeLoad) {
      const result = await onBeforeLoad(url);
      if (result === false) return;
    }

    if (window.location.pathname + window.location.search !== url) {
      window.history.pushState(null, '', url);
      previousUrl.value = currentUrl.value;
      currentUrl.value = url;
    }
  };

  // 1. Link Interception
  $(document).on(`click${eventNamespace}`, selector!, (e) => {
    const $link = $(e.currentTarget as HTMLElement);
    const url = $link.attr('href');

    // Skip if no URL, external link, or modified click (Ctrl/Meta/Shift)
    if (
      !url ||
      url.startsWith('#') ||
      url.includes('://') ||
      e.ctrlKey ||
      e.metaKey ||
      e.shiftKey ||
      e.which === 2
    ) {
      return;
    }

    e.preventDefault();
    navigate(url);
  });

  // 2. History Synchronization
  const handlePopState = () => {
    const newUrl = window.location.pathname + window.location.search;
    previousUrl.value = currentUrl.value;
    currentUrl.value = newUrl;
  };

  window.addEventListener('popstate', handlePopState);

  // 3. Reactive Content Fetching (with transform optimization)
  const content = $.atomFetch(() => currentUrl.value, {
    defaultValue: { html: '', title: null as string | null },
    headers: { 'X-PJAX': 'true', ...headers },
    eager: false,
    transform: (raw) => processHtml(String(raw)),
  });

  // 4. Reactive DOM Reconciliation
  const navEffect = $.effect((): EffectResult => {
    const { html, title } = content.value;

    // Only proceed if resolved and content exists
    if (content.isResolved && !content.hasError && html) {
      const url = currentUrl.value;
      const oldUrl = previousUrl.value;

      // Sync Title
      if (syncTitle && title) {
        document.title = title;
      }

      // Lifecycle: Before removal
      onUnmount?.($target, oldUrl);

      // DOM Update
      $target.atomUnbind().html(html);

      // Scroll Management
      if (scrollToTop) {
        window.scrollTo(0, 0);
      }

      // Lifecycle: After injection
      onMount?.($target, url);
    }
    return undefined;
  });

  /**
   * Destroys the navigation module
   */
  const destroy = () => {
    $(document).off(eventNamespace);
    window.removeEventListener('popstate', handlePopState);
    navEffect.dispose();

    if ('dispose' in content && typeof content.dispose === 'function') {
      (content as unknown as { dispose: () => void }).dispose();
    } else {
      content.abort();
    }
  };

  return {
    currentUrl: $.computed(() => currentUrl.value),
    isPending: $.computed(() => content.isPending),
    hasError: $.computed(() => content.hasError),
    navigate,
    destroy,
  };
};

export default $.atomNav;
