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
 * Regex Hoisting: Pre-compiled to avoid repeated execution overhead.
 * Handles extracting the <title> content while enabling single-pass cleanup.
 */
const TITLE_RE = /<title>([\s\S]*?)<\/title>/gi;

/**
 * AtomNavigator
 *
 * Internal implementation of the state-driven navigation module (PJAX).
 * This class manages the lifecycle of page transitions, network requests,
 * and reactive DOM reconciliation.
 *
 * Refactored into a class structure to improve property access speed (V8 Hidden Classes)
 * and provide better organizational clarity for complex state interactions.
 */
class AtomNavigator implements AtomNav {
  /** Reactive atom containing the current URL path and query string. */
  public readonly currentUrl: ReadonlyAtom<string>;
  /** Reactive atom indicating whether a navigation operation is in progress. */
  public readonly isPending: ReadonlyAtom<boolean>;
  /** Reactive atom indicating whether the last navigation attempt resulted in an error. */
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
   * Initializes a new AtomNavigator instance.
   * Sets up reactive state, network resource loaders, and global event listeners.
   *
   * @param options - Configuration including target element, selectors, and lifecycle hooks.
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

    // Namespace for event delegation to ensure safe disposal without affecting other modules.
    this._eventNamespace = `.atomNav_${Math.random().toString(36).slice(2, 11)}`;
    this._$target = $(target as string & JQuery & HTMLElement);

    // 1. Reactive State Initialization
    // We derive current and previous URLs to manage lifecycle transitions effectively.
    this._currentUrl = $.atom(this.getPath());
    this._previousUrl = $.atom(this._currentUrl.value);

    /**
     * 2. Reactive Resource Loader
     * Utilizes $.atomFetch to automatically trigger network requests when currentUrl changes.
     * Includes X-PJAX headers to allow servers to minimize response payloads.
     */
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

    /**
     * 3. Reactive UI Synchronizer (Effect)
     * The heart of the navigation engine. Automatically reconciles the DOM whenever
     * fetch results or internal navigation state changes.
     */
    this._navEffect = $.effect(() => {
      const state = this._content.value;

      // Guard Clause: Only proceed if the state has successfully resolved with payload.
      if (!this._content.isResolved || this._content.hasError || !state.html) return undefined;

      const { html, title } = state;
      const url = this._currentUrl.value;
      const oldUrl = this._previousUrl.value;

      // Update Browser Tab Title
      if (syncTitle && title) {
        document.title = title;
      }

      /**
       * Lifecycle: Before content replacement.
       * Useful for manual unbinding or capturing state from the outgoing page.
       */
      onUnmount?.(this._$target, oldUrl);

      /**
       * DOM Update & Memory Safety:
       * .atomUnbind() is critical before replacing content. It destroys all
       * reactive bindings within the target to prevent memory leaks and ghost effects.
       */
      this._$target.atomUnbind().html(html);

      // Reset scroll position to top for a natural page-like transition.
      if (scrollToTop) {
        window.scrollTo(0, 0);
      }

      /**
       * Lifecycle: After content is mounted.
       * Primary hook for initializing plugins or custom reactivity on the new page.
       */
      onMount?.(this._$target, url);

      return undefined;
    });

    // 4. Setup Global Event Listeners (Link Interception & Browser History)
    this.setupListeners(selector);

    // 5. Expose Public Readonly View of internal states.
    this.currentUrl = $.computed(() => this._currentUrl.value);
    this.isPending = $.computed(() => this._content.isPending);
    this.hasError = $.computed(() => this._content.hasError);
  }

  /**
   * Internal URL Helper.
   * Normalizes current browser path and query string for PJAX comparisons.
   */
  private getPath(): string {
    return window.location.pathname + window.location.search;
  }

  /**
   * Extracts page title and returns cleaned HTML content.
   * Optimized with a single Regex pass to handle extraction and removal simultaneously.
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
   * Configures DOM event delegation and window history listeners.
   */
  private setupListeners(selector: string): void {
    // Intercept clicks on qualified navigation links.
    $(document).on(`click${this._eventNamespace}`, selector, (e) => {
      // Respect standard browser behavior: ignore clicks with modifiers or non-left buttons.
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.which === 2) return;

      const el = e.currentTarget as HTMLAnchorElement;
      const url = el.getAttribute('href');

      // Filter: Ignore external links, hash fragments, and empty elements.
      if (!url || url[0] === '#' || url.includes('://')) return;

      e.preventDefault();
      this.navigate(url);
    });

    // Synchronize reactive state with browser Back/Forward actions.
    this.handlePopState = this.handlePopState.bind(this);
    window.addEventListener('popstate', this.handlePopState);
  }

  /**
   * Responds to the browser popstate event.
   */
  private handlePopState(): void {
    const newUrl = this.getPath();
    this._previousUrl.value = this._currentUrl.value;
    this._currentUrl.value = newUrl;
  }

  /**
   * Programmatically navigates to a new URL.
   * Updates history state which in turn triggers the reactive fetch loader.
   *
   * @param url - The relative URL path to navigate to.
   */
  public async navigate(url: string): Promise<void> {
    const { onBeforeLoad } = this.options;

    // Allow cancellation of navigation via onBeforeLoad hook.
    if (onBeforeLoad && (await onBeforeLoad(url)) === false) return;

    // Prevent redundant navigation to the same endpoint.
    if (this.getPath() !== url) {
      window.history.pushState(null, '', url);
      this._previousUrl.value = this._currentUrl.value;
      this._currentUrl.value = url;
    }
  }

  /**
   * Tears down the navigator instance.
   * Cleans up global listeners, stops fetch operations, and disposes reactive effects.
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
 * Factory function for creating a state-driven PJAX navigation module.
 * Integrates with $.atomFetch and $.effect for seamless, memory-safe page transitions.
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  return new AtomNavigator(options);
}

// Register as a jQuery utility
$.extend({
  atomNav,
});
