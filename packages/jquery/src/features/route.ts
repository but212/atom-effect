import type { ReadonlyAtom } from '@but212/atom-effect';
import { computed, atom as createAtom, effect, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES, ROUTE_DEFAULTS } from '@/constants';
import { registry } from '@/core/registry';
import type { RouteConfig, Router, WritableAtom } from '@/types';
import { debug } from '@/utils/debug';

// --- Helper: Safe History API Wrappers ---
function safePushState(data: unknown, url: string | URL | null): void {
  try {
    history.pushState(data, '', url);
  } catch (e) {
    debug.warn(
      LOG_PREFIXES.ROUTE,
      'PushState failed (likely file:// protocol or security restriction). UI will update, but URL will not.',
      e
    );
  }
}

class RouterImpl implements Router {
  public currentRoute: ReadonlyAtom<string>;
  public queryParams: ReadonlyAtom<Record<string, string>>;

  private config: RouteConfig &
    Required<Pick<RouteConfig, 'mode' | 'basePath' | 'autoBindLinks' | 'activeClass'>>;
  private readonly isHistoryMode: boolean;
  private readonly basePath: string;
  private readonly activeClass: string;

  private isDestroyed = false;
  private previousRoute = '';
  private previousUrl: string;
  private cleanups: Array<() => void> = [];
  private $target: JQuery;
  private currentRouteAtom: WritableAtom<string>;
  private queryParamsAtom: WritableAtom<Record<string, string>>;
  private templateCache = new Map<string, HTMLTemplateElement>();
  private routeCleanups: Array<() => void> = [];
  private lastRawQuery = '';
  private cachedParams: Record<string, string> = {};

  constructor(config: RouteConfig) {
    this.config = {
      mode: ROUTE_DEFAULTS.mode,
      basePath: ROUTE_DEFAULTS.basePath,
      autoBindLinks: ROUTE_DEFAULTS.autoBindLinks,
      activeClass: ROUTE_DEFAULTS.activeClass,
      ...config,
    } as typeof this.config;

    this.isHistoryMode = this.config.mode === 'history';
    this.basePath = this.config.basePath.replace(/\/$/, '');
    this.activeClass = this.config.activeClass;

    this.$target = $(this.config.target);
    this.previousUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;
    this.currentRouteAtom = createAtom(this.getRouteName());
    this.currentRoute = this.currentRouteAtom;
    this.queryParamsAtom = createAtom(this.getQueryParams());
    this.queryParams = computed(() => this.queryParamsAtom.value);
    this.init();
  }

  private init() {
    const event = this.isHistoryMode ? 'popstate' : 'hashchange';
    const handler = this.handleUrlChange.bind(this);
    window.addEventListener(event, handler);
    this.cleanups.push(() => window.removeEventListener(event, handler));

    const renderEffect = effect(() => {
      const routeName = this.currentRouteAtom.value;
      untracked(() => {
        for (const fn of this.routeCleanups)
          try {
            fn();
          } catch {}
        this.routeCleanups.length = 0;
      });
      this.renderRoute(routeName);
    });
    this.cleanups.push(() => renderEffect.dispose());
    this.setupAutoBindLinks();
    if (this.$target[0]) registry.trackCleanup(this.$target[0], () => this.destroy());
  }

  private getRouteName(): string {
    const { default: defaultRoute } = this.config;
    if (this.isHistoryMode) {
      const base = this.basePath;
      let path = location.pathname;
      if (base && path.startsWith(base)) {
        path = path.substring(base.length);
      }
      return path.replace(/^\//, '') || defaultRoute!;
    }
    return location.hash.split('?')[0]!.substring(1) || defaultRoute!;
  }

  private getQueryParams(): Record<string, string> {
    const hash = location.hash;
    const queryIndex = hash.indexOf('?');
    const raw = this.isHistoryMode
      ? location.search.substring(1)
      : queryIndex !== -1
        ? hash.substring(queryIndex + 1)
        : '';

    if (raw === this.lastRawQuery) return this.cachedParams;
    this.lastRawQuery = raw;

    const res: Record<string, string> = {};
    let newLen = 0;
    if (raw) {
      new URLSearchParams(raw).forEach((v, k) => {
        res[k] = v;
        newLen++;
      });
    }

    let oldLen = 0;
    for (const _ in this.cachedParams) oldLen++;

    let changed = newLen !== oldLen;
    if (!changed) {
      for (const k in res) {
        if (res[k] !== this.cachedParams[k]) {
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      if (raw.indexOf('%') !== -1)
        try {
          decodeURIComponent(raw);
        } catch {
          debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.MALFORMED_URI(raw));
        }
      this.cachedParams = res;
    }
    return this.cachedParams;
  }

  private setUrl(name: string): void {
    const url = this.isHistoryMode ? `${this.basePath}/${name}` : `#${name}`;
    if (this.isHistoryMode) {
      safePushState(null, url);
    } else {
      location.hash = url;
    }
    this.previousUrl = this.isHistoryMode ? url : location.hash;
  }

  private restoreUrl(): void {
    if (this.isHistoryMode) {
      safePushState(null, this.previousUrl);
    } else {
      location.hash = this.previousUrl;
    }
  }

  private renderRoute(name: string): void {
    if (this.isDestroyed || !this.$target[0]) return;
    const { routes, notFound, beforeTransition, afterTransition } = this.config;
    const cfg = routes[name] ?? (notFound ? routes[notFound] : undefined);
    if (!cfg) {
      debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.NOT_FOUND(name));
      return;
    }

    const params = this.getQueryParams(),
      from = this.previousRoute;
    if (beforeTransition) untracked(() => beforeTransition(from, name));

    this.$target.empty();
    let routeParams = params;
    if (cfg.onEnter) {
      const res = untracked(() => cfg.onEnter!(params, this));
      if (res) routeParams = { ...params, ...res };
    }

    const onUnmount = (fn: () => void) => this.routeCleanups.push(fn);
    if (cfg.render) cfg.render(this.$target[0], name, routeParams, onUnmount, this);
    else if (cfg.template) {
      let tmpl = this.templateCache.get(cfg.template);
      if (!tmpl) {
        const el = document.querySelector(cfg.template);
        if (el instanceof HTMLTemplateElement) {
          tmpl = el;
          this.templateCache.set(cfg.template, tmpl);
        } else {
          debug.warn(LOG_PREFIXES.ROUTE, ERROR_MESSAGES.ROUTE.TEMPLATE_NOT_FOUND(cfg.template));
          return;
        }
      }
      this.$target.append(tmpl.content.cloneNode(true) as DocumentFragment);
      if (cfg.onMount) cfg.onMount(this.$target.children(), onUnmount, this);
    }

    if (afterTransition) untracked(() => afterTransition(from, name));
    this.previousRoute = name;
  }

  private handleUrlChange(): void {
    if (this.isDestroyed) return;

    const currentUrl = this.isHistoryMode ? location.pathname + location.search : location.hash;
    if (currentUrl === this.previousUrl) return;

    const nextRoute = this.getRouteName();
    const oldRoute = this.currentRouteAtom.peek();

    if (oldRoute !== nextRoute) {
      if (untracked(() => this.config.routes[oldRoute]?.onLeave?.(this)) === false) {
        this.restoreUrl();
        return;
      }
      this.currentRouteAtom.value = nextRoute;
    }
    this.queryParamsAtom.value = this.getQueryParams();
    this.previousUrl = currentUrl;
  }

  private setupAutoBindLinks(): void {
    if (!this.config.autoBindLinks) return;
    const onClick = (e: JQuery.TriggeredEvent) => {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).dataset.route;
      if (r != null) this.navigate(r);
    };
    $(document).on('click', '[data-route]', onClick);
    this.cleanups.push(() => $(document).off('click', '[data-route]', onClick));

    let previousActiveNodes: HTMLElement[] = [];
    const activeLinkEffect = effect(() => {
      const routeName = this.currentRouteAtom.value;
      const activeClass = this.activeClass;
      untracked(() => {
        const len = previousActiveNodes.length;
        for (let i = 0; i < len; i++) {
          const el = previousActiveNodes[i]!;
          el.classList.remove(activeClass);
          el.removeAttribute('aria-current');
        }

        try {
          const selector = `[data-route="${routeName.replace(/"/g, '\\"')}"]`;
          const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
          const nLen = nodes.length;
          for (let i = 0; i < nLen; i++) {
            const el = nodes[i]!;
            el.classList.add(activeClass);
            el.setAttribute('aria-current', 'page');
          }
          previousActiveNodes = nodes;
        } catch {
          previousActiveNodes = [];
        }
      });
    });
    this.cleanups.push(() => activeLinkEffect.dispose());
  }

  public navigate(name: string): void {
    if (this.isDestroyed) return;
    const old = this.currentRouteAtom.peek();
    if (this.config.routes[old]?.onLeave?.(this) === false) return;

    const resolved = name || this.config.default;
    if (!resolved) return;

    this.setUrl(resolved);
    this.queryParamsAtom.value = {};
    this.currentRouteAtom.value = resolved;
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    for (const fn of this.cleanups)
      try {
        fn();
      } catch {}
    this.templateCache.clear();
  }
}

/**
 * Creates an SPA router with reactive state management.
 */
export function route(config: RouteConfig): Router {
  return new RouterImpl(config);
}

$.extend({
  route,
});
