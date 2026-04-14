import $ from 'jquery';
import type {
  AtomNav,
  AtomNavOptions,
  ComputedAtom,
  EffectObject,
  ReadonlyAtom,
  WritableAtom,
} from '@/types';

/**
 * Pre-compiled regular expressions hosted at the module level.
 * Hoisting prevents repeated object allocation during high-frequency operations.
 */
const TITLE_RE = /<title>([\s\S]*?)<\/title>/gi;
const ABSOLUTE_RE = /^(?:[a-z]+:)?\/\//i;
const SPECIAL_PROTO_RE = /^(?:mailto|tel|javascript):/i;

/**
 * AtomNavigator
 *
 * A state-driven PJAX (PushState & AJAX) navigation engine built for jQuery.
 * This class orchestrates reactive state management, asynchronous content loading,
 * and high-performance DOM reconciliation.
 *
 * Design Architecture:
 * - Single Source of Truth: Driven by the `_currentUrl` atom.
 * - Reactive Loading: Content is automatically fetched via `$.atomFetch` when the URL changes.
 * - Batch UI Updates: `$.effect` ensures DOM updates are synchronized with the resolved state.
 * - Performance: Utilizes V8 hidden classes and minimizes allocations during navigation events.
 */
class AtomNavigator implements AtomNav {
  /** A readonly reactive view of the current browser URL (including path, search, and hash). */
  public readonly currentUrl: ReadonlyAtom<string>;
  /** Indicates whether a network request for new content is currently in progress. */
  public readonly isPending: ReadonlyAtom<boolean>;
  /** Indicates whether the last navigation attempt resulted in a network or processing error. */
  public readonly hasError: ReadonlyAtom<boolean>;

  private readonly _currentUrl: WritableAtom<string>;
  private readonly _previousUrl: WritableAtom<string>;
  private readonly _content: ComputedAtom<{ html: string; title: string | null }> & {
    dispose(): void;
  };
  private readonly _navEffect: EffectObject;
  private readonly _eventNamespace: string;
  private readonly _$target: JQuery;

  /**
   * Constructs an AtomNavigator instance.
   *
   * @param options - Navigation settings including the target DOM element and lifecycle hooks.
   */
  constructor(private readonly options: AtomNavOptions) {
    const {
      target,
      selector = 'a[data-nav]',
      headers = {},
      syncTitle = true,
      scrollToTop = true,
      onUnmount,
      onMount,
    } = options;

    // Unique namespace for jQuery event delegation to prevent crosstalk and ensure clean cleanup.
    this._eventNamespace = `.atomNav_${Math.random().toString(36).slice(2, 11)}`;
    this._$target = $(target as string & JQuery & HTMLElement);

    // 1. Reactive State: Initialize atoms with the current window state.
    this._currentUrl = $.atom(this.getPath());
    this._previousUrl = $.atom(this._currentUrl.value);

    // 2. Resource Loader: Declarative fetch task that aborts stale requests automatically.
    const fetchHeaders = { 'X-PJAX': 'true', ...headers };
    this._content = $.atomFetch<{ html: string; title: string | null }>(
      () => this._currentUrl.value,
      {
        defaultValue: { html: '', title: null },
        headers: fetchHeaders,
        eager: false,
        transform: (raw) => this.processHtml(String(raw)),
      }
    );

    // 3. UI Synchronizer: The core reconciliation effect that updates the screen.
    this._navEffect = $.effect(() => {
      const state = this._content.value;

      // Guard Clause: Only reconcile if the request is resolved successfully with content.
      if (!this._content.isResolved || this._content.hasError || !state.html) return undefined;

      const { html, title } = state;
      const url = this._currentUrl.value;
      const oldUrl = this._previousUrl.value;

      // Synchronization: Update the browser tab title.
      if (syncTitle && title) document.title = title;

      // Lifecycle Hook: Pre-update cleanup call.
      onUnmount?.(this._$target, oldUrl);

      /**
       * DOM Reconciliation & Memory Safety:
       * .atomUnbind() recursively destroys all reactive bindings within the target container.
       * This prevents memory leaks and accidental state synchronization for unmounted elements.
       */
      this._$target.atomUnbind().html(html);

      // View Management: Apply specialized scrolling logic.
      if (scrollToTop) {
        this.scrollToPosition(url);
      }

      // Lifecycle Hook: Post-update initialization call.
      onMount?.(this._$target, url);
      return undefined;
    });

    // 4. Global Event Listeners: Hook into the browser's navigation infrastructure.
    this.setupListeners(selector);

    // 5. Public Interface: Expose derivative computed atoms for UI introspection.
    this.currentUrl = $.computed(() => this._currentUrl.value);
    this.isPending = $.computed(() => this._content.isPending);
    this.hasError = $.computed(() => this._content.hasError);
  }

  /**
   * Normalizes the current browser location into a standard PJAX-compatible path.
   * @returns The concatenated path, search, and hash strings.
   */
  private getPath(): string {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  /**
   * Extracts page metadata and cleans the HTML payload in a single pass.
   * @param html - The raw response string from the server.
   */
  private processHtml(html: string) {
    let title: string | null = null;
    const cleanHtml = html.replace(TITLE_RE, (_, captured) => {
      if (title === null) title = captured.trim();
      return '';
    });
    return { html: cleanHtml, title };
  }

  /**
   * Predicts whether a specific anchor click should be intercepted based on origin and protocols.
   * Prevents PJAX interception for external links, downloads, and special URIs (e.g. mailto).
   *
   * @param el - The clicked HTMLAnchorElement.
   * @param url - The extracted 'href' attribute.
   */
  private shouldIntercept(el: HTMLAnchorElement, url: string | null): url is string {
    // Immediate filters for common non-navigation links.
    if (!url || url[0] === '#' || el.target === '_blank' || el.hasAttribute('download'))
      return false;

    // Skip based on explicit external markers or non-HTTP protocols.
    if (el.getAttribute('rel') === 'external' || SPECIAL_PROTO_RE.test(url)) return false;

    // Cross-origin check: Only intercept if the target shares the same protocol and host.
    if (ABSOLUTE_RE.test(url)) {
      try {
        return new URL(url, window.location.href).origin === window.location.origin;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Intelligent scrolling logic that prioritizes hash fragments for deep-linking.
   * Falls back to (0, 0) if no specific target ID is found in the DOM.
   *
   * @param url - The destination URL string.
   */
  private scrollToPosition(url: string): void {
    const hash = url.split('#')[1];
    const $el = hash ? $(`#${$.escapeSelector(hash)}`) : [];

    if ($el.length) {
      $el[0]?.scrollIntoView();
    } else {
      window.scrollTo(0, 0);
    }
  }

  /**
   * Delegates click events and attaches browser history listeners.
   */
  private setupListeners(selector: string): void {
    $(document).on(`click${this._eventNamespace}`, selector, (e) => {
      // Respect standard browser UX: Ignore modified clicks or non-primary buttons.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.which === 2) return;

      const el = e.currentTarget as HTMLAnchorElement;
      const url = el.getAttribute('href');

      if (this.shouldIntercept(el, url)) {
        e.preventDefault();
        this.navigate(url);
      }
    });

    window.addEventListener('popstate', this.handlePopState);
  }

  /**
   * Synchronizes internal reactive state with browser history (Back/Forward actions).
   */
  private handlePopState = (): void => {
    const newUrl = this.getPath();
    this._previousUrl.value = this._currentUrl.value;
    this._currentUrl.value = newUrl;
  };

  /**
   * Programmatic navigation API.
   * Includes URL normalization to protect against redundant network requests.
   *
   * @param url - The destination URL path (absolute or relative).
   */
  public async navigate(url: string): Promise<void> {
    const { onBeforeLoad } = this.options;

    // Final check for navigation cancellation via hook.
    if (onBeforeLoad && (await onBeforeLoad(url)) === false) return;

    const current = new URL(window.location.href);
    const target = new URL(url, current.href);

    /**
     * URL Normalization: Prevents redundant fetches by comparing normalized path strings.
     * This avoids triggers for different string formats pointing to the same endpoint.
     */
    if (current.pathname + current.search !== target.pathname + target.search) {
      window.history.pushState(null, '', url);
      this._previousUrl.value = this._currentUrl.value;
      this._currentUrl.value = url;
    }
  }

  /**
   * Disposes of the navigator instance.
   * Unbinds global events and cleans up all associated reactive effects to prevent memory leaks.
   */
  public destroy(): void {
    $(document).off(this._eventNamespace);
    window.removeEventListener('popstate', this.handlePopState);
    this._navEffect.dispose();
    this._content.dispose();
  }
}

/**
 * $.atomNav
 *
 * Factory function to initialize a state-driven navigation module.
 *
 * @param options - Configuration settings for the PJAX module.
 * @returns An instance implementing the AtomNav interface.
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  return new AtomNavigator(options);
}

// Global jQuery utility extension.
$.extend({
  atomNav,
});
