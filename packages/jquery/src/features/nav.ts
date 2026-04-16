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

// ============================================================================
// Internal Types & Utilities
// ============================================================================

/** Internal navigation trigger types */
type NavigationType = 'init' | 'push' | 'replace' | 'pop';

/** Internal state representation for current navigation */
interface NavState {
  /** The full URL (including search and hash) */
  url: string;
  /** Method used to reach this state */
  type: NavigationType;
}

/**
 * Configuration for metadata synchronization.
 * Defines how to locate and extract common SEO tags.
 */
const META_CONFIG = {
  description: { selector: 'meta[name="description"]', attr: 'content' },
  keywords: { selector: 'meta[name="keywords"]', attr: 'content' },
  canonical: { selector: 'link[rel="canonical"]', attr: 'href' },
} as const;

/** Extracted content state from a remote response */
interface ContentState {
  /** The HTML content to be injected */
  html: string;
  /** Extracted page title */
  title: string | null;
  /** Attributes of the target element in the new response */
  attributes?: Record<string, string> | undefined;
  /** Server-side redirect URL if provided via X-PJAX-URL */
  redirectUrl?: string | null | undefined;
  /** Meta tag values extracted from the new response */
  meta?: Record<string, string> | undefined;
}

/**
 * Optimized URL and DOM manipulation helpers for navigation.
 */
const NavHelpers = {
  /**
   * Safe URL constructor with fallback for invalid strings.
   */
  getAbsoluteUrl(url: string, base: string): URL {
    try {
      return new URL(url, base);
    } catch {
      return new URL(url, 'http://localhost');
    }
  },

  /**
   * Extracts the full relative path including search and hash from Window.
   */
  getCurrentFull(win: Window): string {
    const { pathname, search, hash } = win.location;
    return (pathname || '/') + (search || '') + (hash || '');
  },

  /**
   * Normalizes a URL object to its path + search string.
   */
  getPathAndSearch(urlObj: URL): string {
    return urlObj.pathname + urlObj.search;
  },

  /**
   * Parses raw HTML response into a structured ContentState.
   * Handles title extraction, fragment resolution, and attribute syncing.
   *
   * @param html - Raw HTML source
   * @param selector - Optional CSS selector to extract a fragment
   * @param xhr - Original JQuery XHR for header inspection
   */
  extractContent(html: string, selector?: string, xhr?: JQuery.jqXHR): ContentState {
    const doc = SHARED_PARSER.parseFromString(html, 'text/html');
    const title = doc.querySelector('title')?.textContent?.trim() || null;

    // Resolve fragment: if selector is provided, use its innerHTML, else body
    const contentNode = selector ? doc.querySelector(selector) : null;
    const rawHtml = contentNode ? contentNode.innerHTML : doc.body?.innerHTML || html;

    // Extract attributes for differential update (classes, data-attrs, etc)
    const attributes: Record<string, string> = {};
    if (contentNode) {
      for (const attr of contentNode.attributes) {
        // Skip 'id' to prevent fragmentation conflicts
        if (attr.name !== 'id') attributes[attr.name] = attr.value;
      }
    }

    // Extract Meta Data based on META_CONFIG
    const meta: Record<string, string> = {};
    for (const [key, config] of Object.entries(META_CONFIG)) {
      const el = doc.querySelector(config.selector);
      const val = el?.getAttribute(config.attr);
      if (val) meta[key] = val;
    }

    return {
      html: sanitizeHtml(rawHtml).trim(),
      title,
      attributes,
      // Check for X-PJAX-URL header to handle server-side redirects
      redirectUrl: xhr?.getResponseHeader?.('X-PJAX-URL') || undefined,
      meta,
    };
  },

  /**
   * Manages scroll position based on hash or fallback.
   */
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

  /**
   * Heuristic to determine if a link click should be intercepted by atomNav.
   */
  shouldIntercept(el: HTMLAnchorElement, win: Window): boolean {
    const targetHref = el.getAttribute('href');

    // 1. Basic exclusions (hash-only, external, target=_blank, etc)
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

    // 2. Origin check: only intercept same-origin navigation
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

// ============================================================================
// AtomNavigator Class
// ============================================================================

/**
 * Implementation of AtomNav.
 * Manages the full lifecycle of reactive navigation including AJAX fetching,
 * DOM reconciliation, and history state synchronization.
 */
class AtomNavigator implements AtomNav {
  /** Reactive atom for the current full URL */
  public readonly currentUrl: ReadonlyAtom<string>;
  /** Reactive atom indicating if a navigation or hook is in progress */
  public readonly isPending: ReadonlyAtom<boolean>;
  /** Reactive atom indicating if the last navigation failed */
  public readonly hasError: ReadonlyAtom<boolean>;

  private readonly _navState: WritableAtom<NavState>;
  private readonly _isHookPending: WritableAtom<boolean>;

  private _lastSyncPath = '';
  private _previousUrl = '';
  private _activeHookCount = 0;

  /** Controller for global listeners and timers */
  private readonly _lifecycleController = new AbortController();
  /** Controller for the current active fetch/hook cycle */
  private _navController: AbortController | null = null;

  /** Optimized internal state for tracking changes during sync effect */
  private readonly _normalizedState: ComputedAtom<{
    url: string;
    pathAndSearch: string;
    hash: string;
    type: NavigationType;
  }>;

  /** Reactive fetch atom for remote content */
  private readonly _content: ComputedAtom<ContentState> & { dispose(): void };
  /** The main effect that drives DOM updates */
  private readonly _navEffect: EffectObject;
  /** jQuery wrapper for the target container */
  private readonly _$target: JQuery;
  /** Reference to the window object */
  private readonly _win: Window & typeof globalThis;

  constructor(private readonly options: AtomNavOptions) {
    const { target, selector = 'a[data-nav]', headers = {} } = options;

    this._win = options.window ?? (window as Window & typeof globalThis);
    this._$target = $(target as string);
    // Mark target for scoped interception
    this._$target.attr('data-atom-nav-target', 'true');

    // 1. Initialize State with Debug Names
    const initialUrl = NavHelpers.getCurrentFull(this._win);
    this._navState = $.atom<NavState>({ url: initialUrl, type: 'init' }, { name: 'nav:state' });
    this._isHookPending = $.atom(false, { name: 'nav:hook-pending' });
    this._previousUrl = initialUrl;

    // 2. Fragment Selector Config (used to extract specific part of the response)
    const targetSelector =
      typeof target === 'string'
        ? target
        : this._$target.attr('id')
          ? `#${$.escapeSelector(this._$target.attr('id')!)}`
          : undefined;

    // 3. Normalized State: Derives computed properties to minimize redundant fetches
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

    this._lastSyncPath = this._normalizedState.value.pathAndSearch;

    // 4. Resource Loader: Fetches remote HTML when URL path/search changes
    this._content = $.atomFetch<ContentState>(() => this._normalizedState.value.pathAndSearch, {
      name: 'nav:content',
      defaultValue: { html: '', title: null },
      headers: { 'X-PJAX': 'true', ...headers },
      eager: false,
      transform: (raw, xhr) => NavHelpers.extractContent(String(raw), targetSelector, xhr),
    });

    // 5. Effect & Listeners: Connects reactive state to real DOM
    this._navEffect = $.effect(() => this._syncUI(), { name: 'nav:sync-effect' });
    this._setupListeners(selector);

    // Public API exposures
    this.currentUrl = $.computed(() => this._navState.value.url, { name: 'nav:public-url' });
    this.isPending = $.computed(() => this._content.isPending || this._isHookPending.value, {
      name: 'nav:isPending',
    });
    this.hasError = $.computed(() => this._content.hasError, { name: 'nav:hasError' });
  }

  /**
   * Main synchronization loop. triggered whenever normalized state or content changes.
   * Orchestrates redirects, initial loads, and DOM reconciliation.
   */
  private _syncUI(): undefined {
    const { url, pathAndSearch, hash, type } = this._normalizedState.value;

    // 1. Handle initial setup (bypass fetch if already on current path)
    if (type === 'init' && pathAndSearch === this._lastSyncPath) {
      this._handleInitialLoad(url, hash);
      return;
    }

    // 2. Error handling: let handler decide whether to fallback to full reload
    if (this._content.hasError) {
      this._handleError(url);
      return;
    }

    // 3. Early exit if content is not ready
    const state = this._content.value;
    if (!this._content.isResolved || this._content.isPending) return;

    const isNewPath = pathAndSearch !== this._lastSyncPath;
    const isRedirect = state.redirectUrl && state.redirectUrl !== url;

    // 4. Handle redirects: update history state and trigger new flow
    if (isRedirect) {
      this._handleRedirect(state.redirectUrl!);
    }

    // 5. Performance: Batch DOM updates and scroll management
    $.batch(() => {
      if (isNewPath || isRedirect) {
        this._reconcileDOM(state, url);
        if (!isRedirect) this._lastSyncPath = pathAndSearch;
      }

      this._syncScroll(hash, isNewPath, type === 'pop');
      this._previousUrl = url;
    });

    return undefined;
  }

  /**
   * Handles scroll and lifecycle for the very first page load.
   */
  private _handleInitialLoad(url: string, hash: string): void {
    if (hash) NavHelpers.scrollTo(this._win, hash);
    this.options.onMount?.(this._$target, url);
    this._previousUrl = url;
  }

  /**
   * Handles server-side redirects by updating history state.
   */
  private _handleRedirect(redirectUrl: string): void {
    const redirectObj = NavHelpers.getAbsoluteUrl(redirectUrl, this._win.location.href);
    const redirectPath = NavHelpers.getPathAndSearch(redirectObj);

    $.batch(() => {
      this._win.history.replaceState(null, '', redirectUrl);
      this._lastSyncPath = redirectPath;
      this._navState.value = { url: redirectUrl, type: 'replace' };
    });
  }

  /**
   * Handles navigation errors. Defaults to full page reload unless overridden.
   */
  private _handleError(url: string): void {
    const error = this._content.lastError;
    // Ignore manual aborts
    if (error instanceof Error && error.name === 'AbortError') return;

    if (this.options.onError?.(error, url) !== false) {
      this._win.location.assign(url);
    }
  }

  /**
   * Performs the actual DOM updates and lifecycle hook firing.
   */
  private _reconcileDOM(state: ContentState, url: string): void {
    $.untracked(() => {
      const { syncTitle = true, onUnmount, onMount } = this.options;
      const doc = this._win.document;

      // 1. Sync Title
      if (syncTitle && state.title !== null && doc.title !== state.title) {
        doc.title = state.title;
      }

      // 2. Sync Meta tags (Description, Keywords, etc)
      this._syncMetaData(state.meta);

      // 3. Fire Unmount hook for existing content
      onUnmount?.(this._$target, this._previousUrl);

      // 4. Cleanup reactive bindings within the stale content
      this._$target.children().atomUnbind();

      // 5. Sync Target Attributes (classes, data-attrs, etc)
      const el = this._$target[0] as HTMLElement | undefined;
      if (el && state.attributes) {
        this._updateAttributes(el, state.attributes);
      }

      // 6. Swap Content
      this._$target.html(state.html);

      // 7. Fire Mount hook for new content
      onMount?.(this._$target, url);
    });
  }

  /**
   * Performs differential attribute update for the target element.
   * Ensures stale attributes are removed while keeping internal markers.
   */
  private _updateAttributes(el: HTMLElement, next: Record<string, string>): void {
    const current = el.attributes;
    // 1. Remove stale attributes (backward loop for safety)
    for (let i = current.length - 1; i >= 0; i--) {
      const attr = current[i];
      if (!attr) continue;
      const { name } = attr;

      // Protection: Do not remove ID or internal atomNav markers
      if (name !== 'id' && name !== 'data-atom-nav-target' && !(name in next)) {
        el.removeAttribute(name);
      }
    }
    // 2. Sync values: only set if changed
    for (const [name, value] of Object.entries(next)) {
      if (el.getAttribute(name) !== value) {
        el.setAttribute(name, value);
      }
    }
  }

  /**
   * Synchronizes metadata tags (SEO) in the head.
   */
  private _syncMetaData(meta?: Record<string, string>): void {
    const { head, createElement } = this._win.document;

    for (const [key, config] of Object.entries(META_CONFIG)) {
      const value = meta?.[key];
      const el = head.querySelector(config.selector);

      // If meta value is missing in new response, remove the tag if it exists
      if (!value) {
        if (el) el.remove();
        continue;
      }

      // Create tag if it doesn't exist
      let targetEl = el;
      if (!targetEl) {
        targetEl = createElement(key === 'canonical' ? 'link' : 'meta');
        if (key === 'canonical') targetEl.setAttribute('rel', 'canonical');
        else targetEl.setAttribute('name', key);
        head.appendChild(targetEl);
      }

      // Update value if changed
      if (targetEl.getAttribute(config.attr) !== value) {
        targetEl.setAttribute(config.attr, value);
      }
    }
  }

  /**
   * Manages scrolling behavior after navigation.
   */
  private _syncScroll(hash: string, isNewPath: boolean, isPop: boolean): void {
    const { scrollToTop = true } = this.options;
    const prevUrlObj = NavHelpers.getAbsoluteUrl(this._previousUrl, this._win.location.href);
    const isHashRemoval = !hash && prevUrlObj.hash !== '';

    // Scroll if:
    // 1. Explicit hash is present
    // 2. Not a 'pop' navigation (Back button) AND (hash was removed OR new path + scrollToTop enabled)
    const shouldScroll = !!hash || (!isPop && (isHashRemoval || (isNewPath && scrollToTop)));

    if (shouldScroll) {
      NavHelpers.scrollTo(this._win, hash, !isPop && isNewPath && scrollToTop);
    }
  }

  /**
   * Sets up global event listeners for clicks and history state.
   */
  private _setupListeners(selector: string): void {
    const doc = this._win.document;

    // Use event delegation for performance and to handle dynamic links
    doc.addEventListener(
      'click',
      (e) => {
        const el = (e.target as Element).closest<HTMLAnchorElement>(selector);
        if (!el) return;

        // Scoped target check: links can have data-target to specify which nav instance should handle it
        const targetAttr = el.dataset.target;
        const myId = this._$target.attr('id');
        const isExplicitTarget = targetAttr && myId && targetAttr === `#${myId}`;

        if (targetAttr && !isExplicitTarget) return;

        // Nested nav check: ignore if link is inside another nav target unless explicitly targeted
        const closestNavTarget = $(el).closest('[data-atom-nav-target="true"]')[0];
        const isInsideOtherNav = closestNavTarget && closestNavTarget !== this._$target[0];
        if (!isExplicitTarget && isInsideOtherNav) return;

        // Browser standard check: shift/ctrl/meta clicks or right clicks should trigger default behavior
        const isPrevented =
          e.defaultPrevented ||
          (e as unknown as JQuery.Event).isDefaultPrevented?.() ||
          (e as unknown as { originalEvent?: { defaultPrevented?: boolean } }).originalEvent
            ?.defaultPrevented;

        const mouse = e as MouseEvent;
        if (isPrevented || mouse.ctrlKey || mouse.metaKey || mouse.shiftKey || mouse.button > 0) {
          return;
        }

        // Intercept if valid same-origin link
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

  /**
   * Handler for history 'popstate' events (back/forward buttons).
   */
  private handlePopState = (): void => {
    this._renewAbortSignal();
    const currentUrl = NavHelpers.getCurrentFull(this._win);
    this._navState.value = { url: currentUrl, type: 'pop' };
  };

  /**
   * Aborts current operations and returns a fresh signal for a new navigation cycle.
   */
  private _renewAbortSignal(): AbortController {
    this._navController?.abort();
    // Manual cast/access for internal Fetch atom abort call
    (this._content as unknown as { abort?: () => void }).abort?.();

    const controller = new AbortController();
    this._navController = controller;
    return controller;
  }

  /**
   * Programmatically navigate to a new URL.
   *
   * @param url - Destination URL
   * @param navOptions - Navigation behavior (replace state)
   */
  public async navigate(url: string, navOptions: { replace?: boolean } = {}): Promise<void> {
    const { signal } = this._renewAbortSignal();

    // 1. Run global lifecycle hook (onBeforeLoad)
    if (this.options.onBeforeLoad) {
      this._activeHookCount++;
      this._isHookPending.value = true;
      try {
        const ok = await (
          this.options.onBeforeLoad as (
            url: string,
            signal: AbortSignal
          ) => Promise<boolean> | boolean
        )(url, signal);

        // Cancel if hook returned false or navigation was superseded
        if (signal.aborted || ok === false) return;
      } finally {
        this._activeHookCount--;
        this._isHookPending.value = this._activeHookCount > 0;
      }
    }

    const base = this._win.document.baseURI ?? this._win.location.href;
    const targetObj = NavHelpers.getAbsoluteUrl(url, base);
    const currentObj = NavHelpers.getAbsoluteUrl(this._win.location.href, base);

    // 2. Cross-origin check
    if (targetObj.origin !== this._win.location.origin) {
      this._win.location.assign(url);
      return;
    }

    const targetPath = NavHelpers.getPathAndSearch(targetObj);
    const currentPath = NavHelpers.getPathAndSearch(currentObj);
    const finalUrl = targetPath + targetObj.hash;

    const isSameLoc =
      targetPath === currentPath && targetObj.hash === (this._win.location.hash || '');

    // 3. Update state and history
    if (!isSameLoc || navOptions.replace) {
      $.batch(() => {
        const method = navOptions.replace ? 'replaceState' : 'pushState';
        this._win.history[method](null, '', finalUrl);
        this._navState.value = { url: finalUrl, type: navOptions.replace ? 'replace' : 'push' };
      });
    } else if (url.includes('#') || targetObj.hash) {
      // Internal anchor jump if path is identical
      NavHelpers.scrollTo(this._win, targetObj.hash.slice(1), true);
    }
  }

  /**
   * Cleanly destroys the navigator, removing all listeners and disposing atoms.
   */
  public destroy(): void {
    this._lifecycleController.abort();
    this._navController?.abort();
    this._navEffect.dispose();
    this._content.dispose();
    this._$target.removeAttr('data-atom-nav-target');

    // Dispose all internal reactive state
    const dispose = (a: ReadonlyAtom) => a.dispose?.();
    [
      this._navState,
      this._isHookPending,
      this._normalizedState,
      this.currentUrl,
      this.isPending,
      this.hasError,
    ].forEach(dispose);
  }
}

/**
 * Creates a reactive navigation manager for a specific DOM target.
 *
 * @param options - Navigation configuration and hooks
 * @returns An AtomNav instance
 */
export function atomNav(options: AtomNavOptions): AtomNav {
  return new AtomNavigator(options);
}

$.extend({ atomNav });
