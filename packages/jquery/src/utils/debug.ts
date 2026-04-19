import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

const HIGHLIGHT_CLASS = 'atom-debug-highlight';
const ATTR_MARKER = 'data-atom-debug';
const IS_BROWSER = typeof window !== 'undefined';

/**
 * Memory Safety: Uses WeakMaps to associate temporal debug state with DOM
 * elements without preventing garbage collection of the elements themselves.
 */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const rafs = new WeakMap<Element, number>();

let styleInjected = false;

/**
 * Minimal Footprint: Injects utility styles once per session.
 * Transition duration is linked to DEBUG_DEFAULTS for configuration consistency.
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
 * Feature Detection: Determines the initial debug state.
 * Priority: 1. Manual global flag -> 2. NODE_ENV check -> 3. Default off.
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
 * Global diagnostic logger.
 * Toggle `debug.enabled` at runtime to activate/deactivate instrumentation.
 */
export const debug = {
  enabled: IS_DEV,

  warn: (prefix: string, message: string, ...rest: unknown[]) =>
    console.warn(`${prefix} ${message}`, ...rest),

  error: (prefix: string, message: string, cause: unknown) =>
    console.error(`${prefix} ${message}`, cause),

  /**
   * Tracks a reactive DOM mutation.
   * Logic: Logs the specific property update and triggers a visual "flash"
   * to help developers locate the change on potentially complex pages.
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
 * Orchestrates a temporary visual highlight on the targeted element.
 *
 * Logic:
 * 1. Debouncing: Cancels pending animations/timers for the same element.
 * 2. RAF: Ensures class addition occurs in the next available paint cycle.
 * 3. GC: Automatically cleans up WeakMap entries after the timeout.
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
