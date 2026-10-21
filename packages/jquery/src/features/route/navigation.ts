/**
 * @module AEJNavigation
 *
 * Responsibility:
 * Provides low-level navigation utilities, metadata synchronization,
 * and click interception logic for SPA routing.
 */

/**
 * Logic: Path Normalization
 * Ensures consistent path matching by stripping redundant slashes.
 * @internal
 */
export const normalizePath = (path: string): string => path.replace(/^\/+|\/+$/g, '');

/**
 * Logic: Path & Query Separation
 * Splits a raw URL into its route pattern and optional query string.
 * @internal
 */
export const splitPath = (path: string): { route: string; query: string | null } => {
  const questionMarkIndex = path.indexOf('?');
  return questionMarkIndex === -1
    ? { route: normalizePath(path), query: null }
    : {
        route: normalizePath(path.slice(0, questionMarkIndex)),
        query: path.slice(questionMarkIndex + 1),
      };
};

/** @internal */
export const parseQuery = (raw: string): Record<string, string> =>
  Object.fromEntries(new URLSearchParams(raw));

/**
 * SEO Metadata Schema
 * Defines the mapping between internal state keys and physical HTML tags.
 */
const META_SCHEMA = [
  {
    selector: 'meta[name="description"]',
    tag: 'meta',
    attr: 'content',
    key: 'description',
    staticAttrs: { name: 'description' },
  },
  {
    selector: 'meta[name="keywords"]',
    tag: 'meta',
    attr: 'content',
    key: 'keywords',
    staticAttrs: { name: 'keywords' },
  },
  {
    selector: 'link[rel="canonical"]',
    tag: 'link',
    attr: 'href',
    key: 'canonical',
    staticAttrs: { rel: 'canonical' },
  },
] as const;

/**
 * Logic: SEO Metadata Synchronization
 * Synchronizes document head metadata with the provided state.
 *
 * When to use:
 * - Ensures SEO-critical tags stay in sync during SPA transitions
 *   without a full page reload.
 */
export function syncMetaData(window: Window, meta?: Record<string, string>): void {
  const document = window.document;
  const head = document.head;
  for (const metaSchema of META_SCHEMA) {
    const value = meta ? meta[metaSchema.key] : undefined;
    const metaElement = head.querySelector(metaSchema.selector) as HTMLElement | null;

    if (value === undefined) {
      if (metaElement) metaElement.remove();
      continue;
    }

    const target = metaElement || head.appendChild(document.createElement(metaSchema.tag));
    if (!metaElement) {
      for (const [attributeName, attributeValue] of Object.entries(metaSchema.staticAttrs)) {
        target.setAttribute(attributeName, attributeValue);
      }
    }
    if (target.getAttribute(metaSchema.attr) !== value) {
      target.setAttribute(metaSchema.attr, value);
    }
  }
}

/**
 * Logic: Viewport Scroll Orchestration
 * Manages viewport scrolling after a navigation event.
 * Priority: Hash element > Window top (if fallback enabled).
 */
export function performScroll(window: Window, hash?: string, fallbackToTop = false): void {
  let id = hash || '';
  try {
    id = decodeURIComponent(id);
  } catch {
    // Preserve malformed anchors as literal IDs instead of breaking navigation.
  }
  const hashElement = id ? window.document.getElementById(id) : null;
  if (hashElement) {
    hashElement.scrollIntoView({ behavior: 'auto', block: 'start' });
  } else if (!hash || fallbackToTop) {
    window.scrollTo(0, 0);
  }
}

/** @internal */
interface NavEventLike {
  defaultPrevented?: boolean;
  isDefaultPrevented?: () => boolean;
  originalEvent?: NavEventLike;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  button?: number;
}

/**
 * Logic: Click Interception Filter
 * Filters click events to determine if they should trigger client-side navigation.
 *
 * Why: Ignores modified clicks (Ctrl+Click) or right-clicks to preserve native
 * browser features like "Open in new tab".
 */
export function isNavigationClick(event: MouseEvent | JQuery.TriggeredEvent): boolean {
  const navEvent = event as NavEventLike;
  const originalOrNavEvent = navEvent.originalEvent || navEvent;

  if (
    navEvent.defaultPrevented ||
    navEvent.isDefaultPrevented?.() ||
    originalOrNavEvent.defaultPrevented
  ) {
    return false;
  }
  // Reason: Modified clicks imply native browser intent (new tab, bookmark, etc).
  if (
    originalOrNavEvent.ctrlKey ||
    originalOrNavEvent.metaKey ||
    originalOrNavEvent.altKey ||
    originalOrNavEvent.shiftKey
  ) {
    return false;
  }
  return originalOrNavEvent.button === 0 || originalOrNavEvent.button === undefined;
}

/**
 * Logic: Router Interception Decision
 * Determines if a click should be hijacked by the SPA engine or left to
 * the browser's native navigation.
 *
 * Logic: Interception Heuristics
 * Rules prioritize developer intent (data-nav="false") and security
 * (cross-origin checks) over automatic PJAX tracking.
 */
export function isInterceptee(element: Element, win: Window = window): boolean {
  if (
    element.getAttribute('data-nav') === 'false' ||
    element.hasAttribute('data-ignore') ||
    element.hasAttribute('download') ||
    element.getAttribute('rel') === 'external' ||
    (element as HTMLAnchorElement).rel === 'external'
  ) {
    return false;
  }
  if (element.hasAttribute('data-route') || element.hasAttribute('data-path')) return true;

  const target = element.getAttribute('target');
  if (target && target !== '_self') return false;
  if (element.tagName.toUpperCase() !== 'A') return false;

  const anchorElement = element as HTMLAnchorElement;
  const hrefAttr = anchorElement.getAttribute('href');
  if (!hrefAttr || hrefAttr[0] === '#') return false;

  const location = win.location;
  if (anchorElement.origin !== location.origin || !/^https?:/.test(anchorElement.protocol))
    return false;

  return !(
    anchorElement.pathname === location.pathname &&
    anchorElement.search === location.search &&
    anchorElement.hash.startsWith('#')
  );
}

/**
 * Logic: Anchor Path Resolution
 * Extracts a router-compatible path relative to a base from an element.
 * @internal
 */
export function resolveAnchorPath(element: Element, base?: string): string {
  const attributeValue = element.getAttribute('href') || element.getAttribute('xlink:href') || '';
  if (attributeValue.startsWith('#')) return normalizePath(attributeValue.substring(1));

  let pathname: string;
  let searchQuery: string;

  if (element instanceof HTMLAnchorElement && element.href) {
    pathname = element.pathname;
    searchQuery = element.search;
  } else {
    const baseUrl = location.href.startsWith('http') ? `${location.origin}/` : 'http://localhost/';
    try {
      const url = new URL(attributeValue, baseUrl);
      pathname = url.pathname;
      searchQuery = url.search;
    } catch {
      return '';
    }
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (base) {
    const normalizedBase = base.endsWith('/') ? base : `${base}/`;
    const normalizedPathname = pathname.endsWith('/') ? pathname : `${pathname}/`;
    if (normalizedPathname.startsWith(normalizedBase)) pathname = pathname.substring(base.length);
  }
  return normalizePath(pathname) + searchQuery;
}

/** @internal */
export function updateActiveState(params: {
  element: Element;
  active: boolean;
  activeClass: string;
}): void {
  const { element, active, activeClass } = params;
  element.classList.toggle(activeClass, active);
  if (active) element.setAttribute('aria-current', 'page');
  else element.removeAttribute('aria-current');
}

/** @internal SPA Link Recognition Specification */
export const NAV_SPEC = {
  selectors: 'a, [data-route]',
  attributes: ['href', 'data-route', 'xlink:href'],
} as const;
