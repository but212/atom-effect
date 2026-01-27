/**
 * Debug Mode
 *
 * When $.atom.debug = true is enabled:
 * 1. Logs state changes to the console.
 * 2. Visually highlights DOM updates (red border flash).
 *
 * Debug mode can be enabled in two ways:
 * 1. Environment variable (build-time): NODE_ENV=development
 * 2. Runtime: $.atom.debug = true or window.__ATOM_DEBUG__ = true
 */

import { getSelector } from './utils';

/**
 * Determines the initial debug state based on environment.
 * Priority: window.__ATOM_DEBUG__ > NODE_ENV === 'development'
 */
function getInitialDebugState(): boolean {
  if (typeof window !== 'undefined') {
    const flag = (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__;
    if (typeof flag === 'boolean') return flag;
  }

  if (import.meta.env?.DEV && import.meta.env.MODE !== 'test') return true;

  try {
    // @ts-expect-error
    if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'development') return true;
  } catch {
    // ignore
  }

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
 * Visual highlight - flashes a red border.
 * Optimized with WeakMap and direct style access to minimize GC and reflows in debug mode.
 */
interface HighlightState {
  timer?: ReturnType<typeof setTimeout>;
  cleanupTimer?: ReturnType<typeof setTimeout>;
  orgStyle?: {
    outline: string;
    outlineOffset: string;
    transition: string;
  };
}

const highlightStateMap = new WeakMap<HTMLElement, HighlightState>();

function highlightElement($el: JQuery | Element): void {
  const el = ('jquery' in $el ? $el[0] : $el) as HTMLElement | undefined;
  if (!el || !el.isConnected) return; // O(1) check instead of O(N) document.contains

  let state = highlightStateMap.get(el);
  if (!state) {
    state = {};
    highlightStateMap.set(el, state);
  }

  // 1. Clear existing timers
  if (state.timer) clearTimeout(state.timer);
  if (state.cleanupTimer) clearTimeout(state.cleanupTimer);

  // 2. Save original style (inline only for performance & correctness)
  if (!state.orgStyle) {
    const style = el.style;
    state.orgStyle = {
      outline: style.outline,
      outlineOffset: style.outlineOffset,
      transition: style.transition,
    };
  }

  // 3. Apply highlight style via direct DOM properties
  const style = el.style;
  style.outline = '2px solid rgba(255, 68, 68, 0.8)';
  style.outlineOffset = '1px';
  style.transition = 'none';

  // 4. Set timer to restore
  state.timer = setTimeout(() => {
    if (!el.isConnected) return;

    // We add a transition for the fade out
    style.transition = 'outline 0.5s ease-out';

    // Defer the actual style restoration to allow transition to take effect
    requestAnimationFrame(() => {
      if (!el.isConnected) return;

      const org = state?.orgStyle;
      if (org) {
        style.outline = org.outline;
        style.outlineOffset = org.outlineOffset;
      }

      // 5. Cleanup data after fade out
      state!.cleanupTimer = setTimeout(() => {
        if (el.isConnected && state?.orgStyle) {
          style.transition = state.orgStyle.transition;
        }
        highlightStateMap.delete(el);
      }, 500);
    });
  }, 100);
}
