import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

const HIGHLIGHT_CLASS = 'atom-debug-highlight';
const ATTR_MARKER = 'data-atom-debug';
const IS_BROWSER = typeof window !== 'undefined';

/**
 * Logic: Memory-Safe DOM Tracking
 * Uses `WeakMap` to associate temporal debug state with DOM elements.
 * This ensures that diagnostic metadata does not prevent the browser's
 * garbage collector from reclaiming memory once an element is removed
 * from the document.
 *
 * @internal
 */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const rafs = new WeakMap<Element, number>();

let styleInjected = false;

/**
 * Optimization: Style Injection
 * Injects utility styles once per session to maintain a minimal footprint.
 * Transition duration is linked to `DEBUG_DEFAULTS` to ensure configuration
 * consistency throughout the library.
 *
 * @internal
 */
function injectStyle(): void {
  if (styleInjected || !IS_BROWSER) return;
  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = `
    [${ATTR_MARKER}] { transition: outline ${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s ease-out; }
    .${HIGHLIGHT_CLASS} { outline: 2px solid rgba(255, 68, 68, 0.8); outline-offset: 1px; }
  `.replace(/\s+/g, ' ');
  document.head.appendChild(style);
  styleInjected = true;
}

/**
 * Logic: Environment Resolution
 * Determines the initial debug state based on the following priority:
 * 1. Manual global flag (`__ATOM_DEBUG__`)
 * 2. Node environment check (`NODE_ENV !== 'production'`)
 * 3. Default off.
 *
 * @internal
 */
function resolveInitialState(): boolean {
  const g = globalThis as typeof globalThis & {
    __ATOM_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (g.__ATOM_DEBUG__ !== undefined) return !!g.__ATOM_DEBUG__;
  return g.process?.env?.NODE_ENV !== 'production' && g.process?.env?.NODE_ENV !== undefined;
}

const IS_DEV = resolveInitialState();

/**
 * When to use:
 * - Debugging reactive updates and DOM mutations in real-time.
 * - Inspecting error causes in binding hooks.
 *
 * Logic: Runtime Control
 * Toggle `debug.enabled` at runtime (e.g., via browser console) to
 * activate or deactivate visual instrumentation without a page reload.
 *
 * @example
 * ```typescript
 * $.debug.enabled = true; // Enable visual highlights
 * ```
 *
 * @public
 */
export const debug = {
  enabled: IS_DEV,

  warn: (prefix: string, message: string, ...rest: unknown[]) =>
    console.warn(`${prefix} ${message}`, ...rest),

  error: (prefix: string, message: string, cause: unknown) =>
    console.error(`${prefix} ${message}`, cause),

  /**
   * Logic: DOM Mutation Tracking
   * Logs the specific property update to the console and triggers a visual
   * "flash" effect to help locate the mutation on complex, dynamic pages.
   */
  domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown) {
    if (!this.enabled) return;
    const el = 'jquery' in target ? target[0] : target;
    // Safety: Only instrument elements that are currently live in the document.
    if (el && el.nodeType === 1 && el.isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el as Element)}.${type} =`, value);
      triggerVisualHighlight(el as Element);
    }
  },
};

/**
 * Logic: Highlight Orchestration
 * Synchronizes visual feedback with the browser paint cycle using rAF.
 * Implements an idempotent debouncing strategy to handle high-frequency
 * updates by canceling stale timers and animations before restarting
 * the flash sequence.
 *
 * @internal
 */
function triggerVisualHighlight(el: Element): void {
  const g = globalThis;
  if (!IS_BROWSER || typeof g.requestAnimationFrame !== 'function') return;
  injectStyle();

  const existingRaf = rafs.get(el);
  const existingTimer = timers.get(el);
  if (existingRaf !== undefined) g.cancelAnimationFrame(existingRaf);
  if (existingTimer !== undefined) clearTimeout(existingTimer);

  if (!el.hasAttribute(ATTR_MARKER)) el.setAttribute(ATTR_MARKER, '');

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
        }, DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS)
      );
    })
  );
}
