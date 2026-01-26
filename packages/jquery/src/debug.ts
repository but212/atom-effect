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
  domUpdated<T>($el: JQuery, type: string, value: T) {
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
 * Inspired by React DevTools "Highlight updates".
 *
 * Uses data attributes to manage state and prevent style pollution
 * when updates happen rapidly.
 */
function highlightElement($el: JQuery): void {
  const el = $el[0];
  if (!el || !document.contains(el)) return;

  const TIMER_KEY = 'atom_debug_timer';
  const CLEANUP_TIMER_KEY = 'atom_debug_cleanup_timer';
  const ORG_STYLE_KEY = 'atom_debug_org_style';

  // 1. Clear existing timers for both restoration and cleanup
  clearTimeout($el.data(TIMER_KEY));
  clearTimeout($el.data(CLEANUP_TIMER_KEY));

  // 2. Save original style only if not already actively highlighting
  // (meaning this is the start of a highlight sequence)
  if (!$el.data(ORG_STYLE_KEY)) {
    $el.data(ORG_STYLE_KEY, {
      outline: $el.css('outline'),
      outlineOffset: $el.css('outline-offset'),
      transition: $el.css('transition'),
    });
  }

  // 3. Apply highlight style
  $el.css({
    outline: '2px solid rgba(255, 68, 68, 0.8)',
    'outline-offset': '1px',
    transition: 'none', // Remove transition for instant feedback on update
  });

  // 4. Set timer to restore
  $el.data(
    TIMER_KEY,
    setTimeout(() => {
      // Restore original styles
      const originalStyles = $el.data(ORG_STYLE_KEY);

      // We add a transition for the fade out
      $el.css('transition', 'outline 0.5s ease-out');

      // Defer the actual style restoration to allow transition to take effect
      requestAnimationFrame(() => {
        $el.css({
          outline: originalStyles?.outline || '',
          'outline-offset': originalStyles?.outlineOffset || '',
        });

        // 5. Cleanup data after fade out
        $el.data(
          CLEANUP_TIMER_KEY,
          setTimeout(() => {
            $el.css('transition', originalStyles?.transition || '');
            $el.removeData(TIMER_KEY);
            $el.removeData(CLEANUP_TIMER_KEY);
            $el.removeData(ORG_STYLE_KEY);
          }, 500)
        );
      });
    }, 100)
  );
}
