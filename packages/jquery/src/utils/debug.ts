import { SYSTEM_DEBUG } from '@/constants';
import { getSelector } from '@/utils';

/** The CSS class applied to elements during a visual debug highlight. @internal */
const HIGHLIGHT_CLASS = 'atom-debug-highlight';

/** The data attribute used to identify and style elements under debug observation. @internal */
const ATTR_MARKER = 'data-atom-debug';

/** Flag indicating if the current environment is a browser. @internal */
const IS_BROWSER = typeof window !== 'undefined';

/**
 * Logic: Memory-Safe DOM Tracking
 * Uses `WeakMap` to associate temporal debug state with DOM elements.
 * This prevents diagnostic metadata from creating memory leaks, as references
 * do not block the garbage collector from reclaiming detached elements.
 *
 * @internal
 */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const rafs = new WeakMap<Element, number>();

/** Internal flag to prevent redundant style injections. @internal */
let styleInjected = false;

/**
 * Injects CSS utility classes for visual debugging into the document head.
 *
 * Optimization: Lazy Style Injection
 * Styles are injected only once per session and only upon the first
 * debug request. The highlight duration is synchronized with `DEBUG_DEFAULTS`
 * to maintain configuration consistency.
 *
 * @internal
 */
function injectStyle(): void {
  if (styleInjected || !IS_BROWSER) return;
  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = `
    [${ATTR_MARKER}] { transition: outline ${SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s ease-out; }
    .${HIGHLIGHT_CLASS} { outline: 2px solid rgba(255, 68, 68, 0.8); outline-offset: 1px; }
  `.replace(/\s+/g, ' ');
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * Determines the initial debug state based on environment variables and global flags.
 *
 * Logic: Priority Resolution
 * Precedence is established as: Manual Flag (`__ATOM_DEBUG__`) > Node Environment (`NODE_ENV`).
 *
 * @internal
 */
function resolveInitialState(): boolean {
  const g = globalThis as typeof globalThis & {
    __ATOM_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (g.__ATOM_DEBUG__ !== undefined) {
    return !!g.__ATOM_DEBUG__;
  }
  return g.process?.env?.NODE_ENV !== 'production' && g.process?.env?.NODE_ENV !== undefined;
}

const IS_DEV = resolveInitialState();

/**
 * Provides visual instrumentation and diagnostic logging for the reactive system.
 *
 * When to use:
 * - To debug reactive updates and DOM mutations in real-time.
 * - To inspect error causes and stack traces within binding hooks.
 *
 * Logic: Runtime Control
 * The `debug.enabled` flag can be toggled at runtime (e.g., via the browser console)
 * to activate or deactivate visual instrumentation without requiring a page reload.
 *
 * @example
 * ```typescript
 * // Enable visual highlights for DOM updates
 * $.debug.enabled = true;
 * ```
 */
export const debug = {
  /** Global toggle for the debug system. */
  enabled: IS_DEV,

  /** Logs a warning message with the standardized library prefix. */
  warn: (prefix: string, message: string, ...rest: unknown[]) =>
    console.warn(`${prefix} ${message}`, ...rest),

  /** Logs an error with the standardized library prefix and the associated cause. */
  error: (prefix: string, message: string, cause: unknown) =>
    console.error(`${prefix} ${message}`, cause),

  /**
   * Logs a DOM mutation and triggers a visual highlight on the target element.
   *
   * Logic: Mutation Tracking
   * When enabled, this method logs the property change and its new value to
   * the console, followed by a "flash" effect on the element to assist in
   * identifying the source of the mutation.
   *
   * @param prefix - The logging prefix.
   * @param target - The DOM element or JQuery collection that was updated.
   * @param type - The type of mutation (e.g., 'text', 'html', 'attr').
   * @param value - The new value applied to the target.
   */
  domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown) {
    if (!this.enabled) return;
    const el = 'jquery' in target ? target[0] : target;

    // Safety: Instrumentation is skipped for elements not currently connected to the document.
    if (el && el.nodeType === 1 && (el as Element).isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el as Element)}.${type} =`, value);
      triggerVisualHighlight(el as Element);
    }
  },
};

/**
 * Manages the lifecycle of a visual highlight "flash" on a DOM element.
 *
 * Logic: Highlight Orchestration
 * Visual feedback is synchronized with the browser's paint cycle using
 * `requestAnimationFrame`. An idempotent debouncing strategy is implemented
 * using per-element `WeakMap` trackers to handle high-frequency updates
 * by canceling stale timers and animations before restarting the sequence.
 *
 * @param el - The element to highlight.
 * @internal
 */
function triggerVisualHighlight(el: Element): void {
  const g = globalThis;
  if (!IS_BROWSER || typeof g.requestAnimationFrame !== 'function') return;
  injectStyle();

  const existingRaf = rafs.get(el);
  const existingTimer = timers.get(el);
  if (existingRaf !== undefined) {
    g.cancelAnimationFrame(existingRaf);
  }
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
  }

  if (!el.hasAttribute(ATTR_MARKER)) {
    el.setAttribute(ATTR_MARKER, '');
  }

  rafs.set(
    el,
    g.requestAnimationFrame(() => {
      rafs.delete(el);
      if (!el.isConnected) return;
      el.classList.add(HIGHLIGHT_CLASS);
      timers.set(
        el,
        setTimeout(() => {
          el.classList.remove(HIGHLIGHT_CLASS);
          timers.delete(el);
        }, SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS)
      );
    })
  );
}
