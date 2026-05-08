import { Option, Result } from '@but212/atom-effect-utils';
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

/** @internal */
export const normalizePath = (path: string): string => {
  const len = path.length;
  if (len === 0) return path;
  let start = 0;
  while (start < len && path[start] === '/') start++;
  let end = len;
  while (end > start && path[end - 1] === '/') end--;
  return start === 0 && end === len ? path : path.slice(start, end);
};

/** @internal */
export const splitPath = (path: string): { route: string; query: Option<string> } => {
  const idx = path.indexOf('?');
  if (idx === -1) {
    return { route: normalizePath(path), query: Option.none };
  }
  return {
    route: normalizePath(path.substring(0, idx)),
    query: Option.some(path.substring(idx + 1)),
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
export const META_SCHEMA = [
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
 * Synchronizes document head metadata with the provided state.
 *
 * Why: Ensures SEO-critical tags stay in sync during SPA transitions
 * without a full page reload.
 *
 * Side Effect: Creates missing tags in `<head>` if defined in `meta` record.
 */
export function syncMetaData(win: Window, meta?: Record<string, string>): void {
  const doc = win.document;
  const head = doc.head;
  for (let i = 0; i < META_SCHEMA.length; i++) {
    const s = META_SCHEMA[i];
    if (!s) continue;
    const value = meta ? meta[s.key] : undefined;
    const el = head.querySelector(s.selector) as HTMLElement | null;

    if (value === undefined) {
      if (el) el.remove();
      continue;
    }

    const target = el || head.appendChild(doc.createElement(s.tag));
    if (!el) {
      const sAttrs = s.staticAttrs as Record<string, string>;
      for (const k in sAttrs) {
        const val = sAttrs[k];
        if (val !== undefined) target.setAttribute(k, val);
      }
    }
    if (target.getAttribute(s.attr) !== value) {
      target.setAttribute(s.attr, value);
    }
  }
}

/**
 * Updates element attributes while preserving internal tracking IDs.
 *
 * Constraint: Attributes in `ATTR_PRESERVE` (like `id`) are never removed,
 * even if missing from the next state, to prevent breaking DOM references.
 */
export function updateAttributes(el: HTMLElement, next: Record<string, string>): void {
  const attrs = el.attributes;
  for (let i = attrs.length - 1; i >= 0; i--) {
    const attr = attrs[i];
    if (!attr) continue;
    const name = attr.name;
    if (!ATTR_PRESERVE.has(name) && !(name in next)) {
      el.removeAttribute(name);
    }
  }

  for (const name in next) {
    const value = next[name];
    if (value !== undefined && el.getAttribute(name) !== value) {
      el.setAttribute(name, value);
    }
  }
}

/**
 * Manages viewport scrolling after a navigation event.
 * Priority: Hash element > Window top (if fallback enabled).
 */
export function performScroll(win: Window, hash?: string, fallbackToTop = false): void {
  const id = decodeURIComponent(hash || '');
  const el = id ? win.document.getElementById(id) : null;
  if (el) {
    el.scrollIntoView({ behavior: 'auto', block: 'start' });
  } else if (!hash || fallbackToTop) {
    win.scrollTo(0, 0);
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
 * Filters click events to determine if they should trigger client-side navigation.
 *
 * Why: Ignores modified clicks (Ctrl+Click) or right-clicks to preserve native
 * browser features (e.g., "Open in new tab").
 */
export function isNavigationClick(e: MouseEvent | JQuery.TriggeredEvent): boolean {
  const ne = e as NavEventLike;
  const me = ne.originalEvent || ne;

  if (ne.defaultPrevented || ne.isDefaultPrevented?.() || me.defaultPrevented) {
    return false;
  }
  // Reason: Modified clicks imply native browser intent (new tab, bookmark, etc).
  if (me.ctrlKey || me.metaKey || me.altKey || me.shiftKey) {
    return false;
  }
  return me.button === 0 || me.button === undefined;
}

/** @internal Priority-ordered rules for link interception. */
const INTERCEPT_RULES: Array<{
  match: (el: Element, win: Window) => boolean;
  result: boolean;
}> = [
  { match: (el) => el.getAttribute('data-nav') === 'false', result: false },
  { match: (el) => ['data-ignore', 'download'].some((a) => el.hasAttribute(a)), result: false },
  {
    match: (el) =>
      el.getAttribute('rel') === 'external' || (el as HTMLAnchorElement).rel === 'external',
    result: false,
  },
  { match: (el) => ['data-route', 'data-path'].some((a) => el.hasAttribute(a)), result: true },
  {
    match: (el) => !!el.getAttribute('target') && el.getAttribute('target') !== '_self',
    result: false,
  },
  { match: (el) => el.tagName.toUpperCase() !== 'A', result: false },
  {
    match: (el, win) => {
      // Logic: If origins differ or protocol isn't web-standard, let the browser handle it.
      const a = el as HTMLAnchorElement;
      const hrefAttr = a.getAttribute('href');
      if (!hrefAttr || hrefAttr[0] === '#') return true;

      const loc = win.location;
      if (a.origin !== loc.origin || !/^https?:/.test(a.protocol)) return true;

      // Note: Pure hash changes within the same path should NOT be intercepted
      // by the router to allow native hashchange behavior.
      return a.pathname === loc.pathname && a.search === loc.search && a.hash.startsWith('#');
    },
    result: false,
  },
];

/**
 * Determines if a link click should be intercepted by the SPA router.
 *
 * Example:
 * ```ts
 * $(document).on('click', 'a', (e) => {
 *   if (isInterceptee(e.currentTarget)) {
 *     e.preventDefault();
 *     navigate(e.currentTarget.href);
 *   }
 * });
 * ```
 */
export function isInterceptee(el: Element, win: Window = window): boolean {
  for (const rule of INTERCEPT_RULES) {
    if (rule.match(el, win)) return rule.result;
  }
  return true;
}

/** @internal */
export function getUrlParts(url: string, base: string): { pathAndSearch: string; hash: string } {
  const res = getAbsoluteUrl(url, base);
  if (Result.isErr(res)) return { pathAndSearch: url, hash: '' };
  const obj = Result.unwrap(res);
  return {
    pathAndSearch: obj.pathname + obj.search,
    hash: obj.hash.slice(1),
  };
}

/**
 * Calculates whether the viewport should scroll after a navigation transition.
 *
 * Why: Prevents jarring scroll jumps during 'Pop' (Back/Forward) events while
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
export function extractMetaData(doc: Document | Element): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const schema of META_SCHEMA) {
    if (!schema) continue;
    const el = doc.querySelector(schema.selector);
    const value = el?.getAttribute(schema.attr);
    if (value) meta[schema.key] = value;
  }
  return meta;
}

/** @internal Extracts path relative to a base for routing logic. */
export function resolveAnchorPath(el: Element, base?: string): string {
  const attr = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
  if (attr.startsWith('#')) return normalizePath(attr.substring(1));

  let p: string;
  let s: string;

  if (el instanceof HTMLAnchorElement && el.href) {
    p = el.pathname;
    s = el.search;
  } else {
    const baseUrl = location.href.startsWith('http') ? `${location.origin}/` : 'http://localhost/';
    const res = getAbsoluteUrl(attr, baseUrl);
    if (Result.isErr(res)) return '';
    const url = Result.unwrap(res);
    p = url.pathname;
    s = url.search;
  }

  if (!p.startsWith('/')) p = `/${p}`;
  if (base) {
    const b = base.endsWith('/') ? base : `${base}/`;
    const normalizedP = p.endsWith('/') ? p : `${p}/`;
    if (normalizedP.startsWith(b)) p = p.substring(base.length);
  }
  return normalizePath(p) + s;
}

/**
 * Parses raw HTML strings into a structured `ContentState`.
 *
 * Why: Allows the router to perform "Fragment Extraction" — extracting
 * only specific container content and page metadata from a full server response.
 */
export function extractContent(params: {
  html: string;
  selector?: string | undefined;
  redirectUrl?: string | null | undefined;
}): ContentState {
  const { html, selector, redirectUrl } = params;
  const doc = PARSER.parseFromString(html, 'text/html');

  const titleEl = doc.querySelector('title');
  const title = titleEl ? (titleEl.textContent?.trim() ?? null) : null;

  const meta = extractMetaData(doc);

  const contentNode = selector ? doc.querySelector(selector) : null;
  const rawHtml = contentNode ? contentNode.innerHTML : (doc.body?.innerHTML ?? html);

  const attributes: Record<string, string> = {};
  if (contentNode) {
    const attrs = contentNode.attributes;
    for (let i = 0, len = attrs.length; i < len; i++) {
      const attr = attrs[i];
      if (attr && !ATTR_EXTRACT_EXCLUDE.has(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    }
  }

  return {
    html: rawHtml.trim(),
    title,
    attributes,
    redirectUrl,
    meta,
  };
}

/** @internal */
export function updateActiveState(params: {
  el: Element;
  active: boolean;
  activeClass: string;
}): void {
  const { el, active, activeClass } = params;
  el.classList.toggle(activeClass, active);
  if (active) el.setAttribute('aria-current', 'page');
  else el.removeAttribute('aria-current');
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
 * Coordination layer to prevent feature collisions.
 *
 * Why: Prevents race conditions when both `atomNav` and `$.route` are applied
 * to the same DOM element. It also aggregates 'Leave' guards for the entire tree.
 *
 * @internal
 */
class NavigationCoordinator {
  private managers = new Map<Element, NavManager>();

  /**
   * Registers a navigation manager.
   * Warning: Throws a console warning if a target is double-managed by
   * different navigation features.
   */
  register(target: Element, type: NavFeatureType, canLeave?: () => boolean): void {
    const existing = this.managers.get(target);
    if (existing && existing.type !== type) {
      debug.warn(
        '[atom-navigation]',
        `Target collision detected! Element is already managed by ${existing.type}. ` +
          `Mixing atomNav and $.route on the same container leads to unpredictable state.`
      );
    }

    this.managers.set(target, { type, canLeave });

    registry.onCleanup(target, () => {
      this.managers.delete(target);
    });
  }

  /**
   * Checks if navigation is allowed by scanning all registered guards
   * within the container.
   */
  canLeaveWithin(container: Element): boolean {
    if (this.managers.size === 0) return true;
    for (const [el, manager] of this.managers) {
      if (manager.canLeave && container.contains(el)) {
        if (manager.canLeave() === false) return false;
      }
    }
    return true;
  }

  /** @internal */
  isNestedIn(el: Element, type: NavFeatureType): boolean {
    let curr: Element | null = el.parentElement;
    while (curr) {
      const manager = this.managers.get(curr);
      if (manager?.type === type) return true;
      curr = curr.parentElement;
    }
    return false;
  }

  /** @internal */
  getManagerType(target: Element): NavFeatureType | undefined {
    return this.managers.get(target)?.type;
  }
}

/** Global singleton for managing cross-component navigation lifecycle. */
export const navCoordinator = new NavigationCoordinator();
