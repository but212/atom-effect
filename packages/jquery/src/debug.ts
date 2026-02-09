/**
 * Debug Mode
 *
 * When $.atom.debug = true is enabled:
 * 1. Logs state changes to the console.
 * 2. Visually highlights DOM updates (red border flash).
 *
 * Debug mode can be enabled in two ways:
 * 1. Build-time: import.meta.env.DEV
 * 2. Runtime: $.atom.debug = true or window.__ATOM_DEBUG__ = true
 */

import { getSelector } from './utils';

/**
 * Determines the initial debug state based on environment.
 * Priority: window.__ATOM_DEBUG__ > import.meta.env.DEV
 */
function getInitialDebugState(): boolean {
  if (typeof window !== 'undefined') {
    const flag = (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__;
    if (typeof flag === 'boolean') return flag;
  }

  if (import.meta.env?.DEV && import.meta.env.MODE !== 'test') return true;

  return false;
}

let debugEnabled = getInitialDebugState();

export const debug = {
  get enabled() {
    return debugEnabled;
  },
  set enabled(value: boolean) {
    debugEnabled = value;
  },

  log<T>(type: string, ...args: T[]) {
    if (debugEnabled) {
      console.log(`[atom-effect-jquery] ${type}:`, ...args);
    }
  },

  atomChanged<T>(name: string | undefined, oldVal: T, newVal: T) {
    if (debugEnabled) {
      console.log(
        `[atom-effect-jquery] Atom "${name ?? 'anonymous'}" changed:`,
        oldVal,
        '→',
        newVal
      );
    }
  },

  /**
   * Logs DOM updates and triggers visual highlight.
   */
  domUpdated<T>($el: JQuery | Element, type: string, value: T) {
    if (!debugEnabled) return;
    console.log(`[atom-effect-jquery] DOM updated: ${getSelector($el)}.${type} =`, value);
    highlightElement($el);
  },

  cleanup(selector: string) {
    if (debugEnabled) {
      console.log(`[atom-effect-jquery] Cleanup: ${selector}`);
    }
  },

  warn<T>(...args: T[]) {
    if (debugEnabled) {
      console.warn('[atom-effect-jquery]', ...args);
    }
  },
};

/**
 * Visual highlight - flashes a red border via CSS class toggle.
 */
const HIGHLIGHT_CLASS = 'atom-debug-highlight';
let styleInjected = false;

function injectHighlightStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `.${HIGHLIGHT_CLASS}{outline:2px solid rgba(255,68,68,0.8);outline-offset:1px;transition:outline 0.5s ease-out}`;
  document.head.appendChild(style);
}

const highlightTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

function highlightElement($el: JQuery | Element): void {
  const el = ('jquery' in $el ? $el[0] : $el) as HTMLElement | undefined;
  if (!el || !el.isConnected) return;

  injectHighlightStyle();

  // Clear existing timer if re-highlighted
  const existing = highlightTimers.get(el);
  if (existing) clearTimeout(existing);

  el.classList.add(HIGHLIGHT_CLASS);

  highlightTimers.set(
    el,
    setTimeout(() => {
      el.classList.remove(HIGHLIGHT_CLASS);
      highlightTimers.delete(el);
    }, 600)
  );
}
