/**
 * @module AEJNavigation
 *
 * Responsibility:
 * Provides low-level navigation utilities, metadata synchronization,
 * click interception logic, and cross-feature coordination for SPA routing.
 */

import { Result } from '@but212/atom-effect-utils';
import { debug } from '@/utils/debug';
import { registry } from './registry';

/** @internal */
export type NavigationType = 'init' | 'push' | 'replace' | 'pop';

/** @internal */
export interface ContentState {
  html: string;
  title: string | null;
  attributes?: Record<string, string>;
  redirectUrl?: string | null | undefined;
  meta?: Record<string, string>;
}

/** @internal Attributes that must persist during navigation to maintain SPA state/identity. */
const ATTR_PRESERVE = new Set(['id', 'data-atom-nav-target']);

const ATTR_EXTRACT_EXCLUDE = new Set(['id']);

const PARSER = new DOMParser();

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

/** @internal */
export const getAbsoluteUrl = (url: string, base: string): Result<URL, Error> =>
  Result.tryCatch(() => new URL(url, base));

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
 * Logic: Persistent Attribute Management
 * Updates element attributes while preserving internal tracking IDs.
 *
 * Constraint: Attribute Preservation
 * Attributes in `ATTR_PRESERVE` (like `id`) are never removed to
 * prevent breaking persistent DOM references.
 */
export function updateAttributes(element: HTMLElement, next: Record<string, string>): void {
  for (const attributeValue of [...element.attributes]) {
    if (!ATTR_PRESERVE.has(attributeValue.name) && !Object.hasOwn(next, attributeValue.name)) {
      element.removeAttribute(attributeValue.name);
    }
  }

  for (const [name, value] of Object.entries(next)) {
    if (value !== undefined && element.getAttribute(name) !== value) {
      element.setAttribute(name, value);
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
    // Preserve malformed fragments as-is so a bad URL cannot abort rendering.
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

/** @internal */
export function getUrlParts(url: string, base: string): { pathAndSearch: string; hash: string } {
  const urlResult = getAbsoluteUrl(url, base);
  if (Result.isErr(urlResult)) return { pathAndSearch: url, hash: '' };
  const urlObject = Result.unwrap(urlResult);
  return {
    pathAndSearch: urlObject.pathname + urlObject.search,
    hash: urlObject.hash.slice(1),
  };
}

/**
 * Logic: Scroll Transition Decision
 * Calculates whether the viewport should scroll after a navigation transition.
 *
 * Why: Prevents jarring jumps during 'Pop' (Back/Forward) events while
 * ensuring 'Push' events start at the top of the new content.
 */
export function getScrollDecision(params: {
  hash: string;
  type: NavigationType;
  isNewTarget: boolean;
  prevHash: string;
  scrollToTop: boolean;
}): { shouldScroll: boolean; resetScroll: boolean } {
  const { hash, type, isNewTarget, prevHash, scrollToTop } = params;
  const isPop = type === 'pop';
  const isHashRemoval = !hash && prevHash !== '';

  const shouldScroll = !!hash || (!isPop && (isHashRemoval || (isNewTarget && scrollToTop)));
  const resetScroll = !isPop && isNewTarget && scrollToTop;

  return { shouldScroll, resetScroll };
}

/** @internal */
function extractMetaData(document: Document | Element): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const schema of META_SCHEMA) {
    const metaElement = document.querySelector(schema.selector);
    const value = metaElement?.getAttribute(schema.attr);
    if (value) meta[schema.key] = value;
  }
  return meta;
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
    const urlResult = getAbsoluteUrl(attributeValue, baseUrl);
    if (Result.isErr(urlResult)) return '';
    const url = Result.unwrap(urlResult);
    pathname = url.pathname;
    searchQuery = url.search;
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
function getElementAttributes(element: Element): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const attributeValue of element.attributes) {
    if (!ATTR_EXTRACT_EXCLUDE.has(attributeValue.name)) {
      attributes[attributeValue.name] = attributeValue.value;
    }
  }
  return attributes;
}

/**
 * Logic: Fragment Extraction Engine
 * Parses raw HTML strings into a structured `ContentState`.
 *
 * Logic: Selective Extraction
 * Extracts specific container content and metadata from full server
 * responses, enabling seamless PJAX-style updates.
 *
 * Optimization:
 * For large responses, ensure the server honors the 'X-PJAX' header
 * to return only the required fragment, minimizing parsing overhead.
 */
export function extractContent(params: {
  html: string;
  selector?: string | undefined;
  redirectUrl?: string | null | undefined;
  title?: string | null | undefined;
}): ContentState {
  const { html, selector, redirectUrl, title: titleOverride } = params;
  const document = PARSER.parseFromString(html, 'text/html');

  // Logic: Header Priority
  // Header-provided titles take precedence to support minimal PJAX responses
  // that may omit the <title> tag for performance.
  const title = titleOverride || document.querySelector('title')?.textContent?.trim() || null;
  const contentNode = selector ? document.querySelector(selector) : null;

  return {
    html: (contentNode?.innerHTML ?? document.body?.innerHTML ?? html).trim(),
    title,
    attributes: contentNode ? getElementAttributes(contentNode) : {},
    redirectUrl,
    meta: extractMetaData(document),
  };
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

/** @internal */
export type NavFeatureType = 'nav' | 'router';

/** @internal */
interface NavManager {
  type: NavFeatureType;
  canLeave?: (() => boolean) | undefined;
}

/**
 * Logic: Navigation Feature Coordination
 * Prevents race conditions and feature collisions when multiple navigation
 * modules (e.g., atomNav and $.route) manage the same DOM tree.
 *
 * Logic: Guard Aggregation
 * Scans all registered components within a container to aggregate
 * 'Leave' guards before transition.
 *
 * @internal
 */
class NavigationCoordinator {
  #managers = new Map<Element, NavManager>();

  /**
   * Logic: Collision Prevention
   * Prevents unpredictable state by ensuring a single element is not
   * simultaneously managed by conflicting modules (e.g., atomNav and $.route).
   */
  register(target: Element, type: NavFeatureType, canLeave?: () => boolean): void {
    const existing = this.#managers.get(target);
    if (existing && existing.type !== type) {
      debug.warn(
        '[atom-navigation]',
        `Target collision detected! Element is already managed by ${existing.type}. ` +
          `Mixing atomNav and $.route on the same container leads to unpredictable state.`
      );
    }

    this.#managers.set(target, { type, canLeave });

    registry.onCleanup(target, () => {
      this.#managers.delete(target);
    });
  }

  /**
   * Checks if navigation is allowed by scanning all registered guards
   * within the container.
   */
  canLeaveWithin(container: Element): boolean {
    if (this.#managers.size === 0) return true;
    for (const [element, manager] of this.#managers) {
      if (manager.canLeave && container.contains(element)) {
        if (manager.canLeave() === false) return false;
      }
    }
    return true;
  }

  /** @internal */
  isNestedIn(element: Element, type: NavFeatureType): boolean {
    let currentElement: Element | null = element.parentElement;
    while (currentElement) {
      const manager = this.#managers.get(currentElement);
      if (manager?.type === type) return true;
      currentElement = currentElement.parentElement;
    }
    return false;
  }

  /** @internal */
  getManagerType(target: Element): NavFeatureType | undefined {
    return this.#managers.get(target)?.type;
  }
}

/** Global singleton for managing cross-component navigation lifecycle. */
export const navCoordinator = new NavigationCoordinator();
