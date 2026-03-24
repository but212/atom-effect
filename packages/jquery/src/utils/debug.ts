/**
 * Debug Mode
 *
 * When $.atom.debug = true is enabled:
 * 1. Logs state changes to the console.
 * 2. Visually highlights DOM updates (red border flash).
 *
 * Debug mode can be enabled in two ways:
 * 1. Build-time: VITE_ATOM_DEBUG=true (opt-in via env var)
 * 2. Runtime: $.atom.debug = true or window.__ATOM_DEBUG__ = true
 *
 * NOTE: debug mode is NOT enabled automatically in DEV builds to avoid
 * polluting the console without explicit opt-in.
 */

import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

// ============================================================================
// Timing constants — HIGHLIGHT_TRANSITION is derived from HIGHLIGHT_DEFAULTS
// so the two values stay in sync automatically.
// ============================================================================

/** CSS transition duration derived from DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS. */
const HIGHLIGHT_TRANSITION = `${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s`;

// ============================================================================
// Initial state
// ============================================================================

/**
 * Determines the initial debug state.
 * Priority: window.__ATOM_DEBUG__ > explicit VITE_ATOM_DEBUG env var.
 * DEV mode alone does NOT enable debug to avoid silent console pollution.
 */
function getInitialDebugState(): boolean {
  if (typeof window !== 'undefined') {
    const flag = (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__;
    if (typeof flag === 'boolean') return flag;
  }

  // Vite inlines import.meta.env at build time; guard for non-Vite environments.
  // We also check for process.env as a fallback for other build tools.
  try {
    if (import.meta.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {
    /* ignore if import.meta is unavailable */
  }

  try {
    // Cast globalThis to include optional process.env for environment detection
    const env = (
      globalThis as typeof globalThis & {
        process?: { env?: Record<string, string | undefined> };
      }
    ).process?.env;

    if (env?.VITE_ATOM_DEBUG === 'true') {
      return true;
    }
  } catch {
    /* ignore */
  }

  return false;
}

let debugEnabled = getInitialDebugState();

// ============================================================================
// Debug object
// ============================================================================

export const debug = {
  get enabled() {
    // Check global flag at runtime to allow dynamic toggling via console.
    if (typeof window !== 'undefined') {
      const globalFlag = (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__;
      if (typeof globalFlag === 'boolean') return globalFlag;
    }
    return debugEnabled;
  },
  set enabled(value: boolean) {
    debugEnabled = value;
  },

  /**
   * Logs a message only when debug mode is active.
   */
  log(prefix: string, ...args: unknown[]) {
    if (this.enabled) {
      console.log(`${prefix}`, ...args);
    }
  },

  /**
   * Logs an atom value change only when debug mode is active.
   */
  atomChanged(prefix: string, name: string | undefined, oldVal: unknown, newVal: unknown) {
    if (this.enabled) {
      console.log(`${prefix} Atom "${name ?? 'anonymous'}" changed:`, oldVal, '→', newVal);
    }
  },

  /**
   * Logs a DOM update and triggers a visual highlight flash.
   */
  domUpdated(prefix: string, target: Element | JQuery<Element>, type: string, value: unknown) {
    if (!this.enabled) return;

    const el: Element | undefined =
      target instanceof Element ? target : (target[0] as Element | undefined);

    // SVG elements also support classList, so we relax the check to Element.
    if (!el) return;

    console.log(`${prefix} DOM updated: ${getSelector(el)}.${type} =`, value);
    highlightElement(el);
  },

  /**
   * Logs a cleanup event only when debug mode is active.
   */
  cleanup(prefix: string, selector: string) {
    if (this.enabled) {
      console.log(`${prefix} Cleanup: ${selector}`);
    }
  },

  /**
   * Unconditional warning for runtime errors.
   */
  warn(prefix: string, message: string, ...rest: unknown[]) {
    console.warn(`${prefix} ${message}`, ...rest);
  },

  /**
   * Unconditional error for binding failures.
   */
  error(prefix: string, message: string, cause: unknown) {
    console.error(`${prefix} ${message}`, cause);
  },
};

// ============================================================================
// Visual highlight
// ============================================================================

const HIGHLIGHT_CLASS = 'atom-debug-highlight';
const HIGHLIGHT_STYLE_ATTR = 'data-atom-debug';

/**
 * Injects the highlight CSS once per document lifetime.
 * Uses a WeakRef with a plain fallback to handle both test resets and old environments.
 */
let highlightStyleRef: WeakRef<HTMLStyleElement> | HTMLStyleElement | undefined;
function injectHighlightStyle(): void {
  const current =
    highlightStyleRef instanceof HTMLStyleElement ? highlightStyleRef : highlightStyleRef?.deref();

  if (current?.isConnected) return;

  // Final guard: check if the style already exists in the document (e.g. from a previous session)
  if (document.querySelector(`style[${HIGHLIGHT_STYLE_ATTR}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(HIGHLIGHT_STYLE_ATTR, '');
  style.textContent =
    `.${HIGHLIGHT_CLASS}{` +
    `outline:2px solid rgba(255,68,68,0.8);` +
    `outline-offset:1px;` +
    `transition:outline ${HIGHLIGHT_TRANSITION} ease-out` +
    `}`;
  document.head.appendChild(style);

  // Use WeakRef only if available (ES2021)
  if (typeof WeakRef !== 'undefined') {
    highlightStyleRef = new WeakRef(style);
  } else {
    highlightStyleRef = style;
  }
}

// Tracks pending operations per element.
const highlightTimers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const highlightRafs = new WeakMap<Element, ReturnType<typeof requestAnimationFrame>>();

/**
 * Flashes a red outline on an element to indicate a reactive DOM update.
 * Supports both HTML and SVG elements via classList manipulation.
 */
function highlightElement(el: Element): void {
  // Re-check debug state and connection.
  if (!debug.enabled || !el.isConnected) return;

  injectHighlightStyle();

  // Cancel any pending rAF.
  const existingRaf = highlightRafs.get(el);
  if (existingRaf !== undefined) {
    cancelAnimationFrame(existingRaf);
  }

  // Cancel any pending timeout.
  const existingTimer = highlightTimers.get(el);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
  }

  const rafId = requestAnimationFrame(() => {
    highlightRafs.delete(el);

    // Re-verify connection inside rAF as the node might have been removed
    // between the scheduling and execution of the frame.
    if (!el.isConnected) return;

    el.classList.add(HIGHLIGHT_CLASS);

    highlightTimers.set(
      el,
      setTimeout(() => {
        // Re-verify connection again before trying to remove class.
        if (el.isConnected) {
          el.classList.remove(HIGHLIGHT_CLASS);
        }
        highlightTimers.delete(el);
      }, DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS)
    );
  });

  highlightRafs.set(el, rafId);
}
