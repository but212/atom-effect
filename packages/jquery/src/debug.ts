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

import { LOG_PREFIXES } from './constants';
import { getSelector } from './utils';

// ============================================================================
// Timing constants — HIGHLIGHT_TRANSITION is derived from HIGHLIGHT_DURATION_MS
// so the two values stay in sync automatically.
// ============================================================================

/** Duration (ms) of the highlight flash animation. */
const HIGHLIGHT_DURATION_MS = 600;

/** CSS transition duration derived from HIGHLIGHT_DURATION_MS. */
const HIGHLIGHT_TRANSITION = `${HIGHLIGHT_DURATION_MS / 1000}s`;

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

  // Vite inlines import.meta.env at build time; guard for non-Vite environments
  // (e.g. Jest/Node) where import.meta.env may be undefined.
  if (import.meta.env?.VITE_ATOM_DEBUG === 'true') {
    return true;
  }

  return false;
}

let debugEnabled = getInitialDebugState();

// ============================================================================
// Debug object
// ============================================================================

export const debug = {
  get enabled() {
    return debugEnabled;
  },
  set enabled(value: boolean) {
    debugEnabled = value;
  },

  /**
   * Logs a message only when debug mode is active.
   */
  log(type: string, ...args: unknown[]) {
    if (debugEnabled) {
      console.log(`${LOG_PREFIXES.MOUNT} ${type}:`, ...args);
    }
  },

  /**
   * Logs an atom value change only when debug mode is active.
   */
  atomChanged(name: string | undefined, oldVal: unknown, newVal: unknown) {
    if (debugEnabled) {
      console.log(
        `${LOG_PREFIXES.MOUNT} Atom "${name ?? 'anonymous'}" changed:`,
        oldVal,
        '→',
        newVal
      );
    }
  },

  /**
   * Logs a DOM update and triggers a visual highlight flash.
   * Only active when debug mode is enabled.
   *
   * @param target - The element or jQuery wrapper that was updated.
   * @param type - The binding type (e.g. 'text', 'checked', 'attr.href').
   * @param value - The new value that was applied.
   */
  domUpdated(target: Element | JQuery, type: string, value: unknown) {
    if (!debugEnabled) return;

    const el: Element | undefined =
      target instanceof Element ? target : (target[0] as Element | undefined);
    if (!(el instanceof HTMLElement)) return;

    console.log(`${LOG_PREFIXES.MOUNT} DOM updated: ${getSelector(el)}.${type} =`, value);
    highlightElement(el);
  },

  /**
   * Logs a cleanup event only when debug mode is active.
   */
  cleanup(selector: string) {
    if (debugEnabled) {
      console.log(`${LOG_PREFIXES.MOUNT} Cleanup: ${selector}`);
    }
  },

  /**
   * Unconditional warning for runtime errors and unexpected states.
   * Not gated by debugEnabled — these are always surfaced regardless of
   * debug mode because they indicate real problems (e.g. dispose failures,
   * missing route targets, pushState security errors).
   *
   * `prefix` is the subsystem tag (e.g. `LOG_PREFIXES.ROUTE`) so that the
   * originating subsystem appears in the log rather than the generic MOUNT tag.
   * Pass an empty string to emit a prefix-free message.
   */
  warn(prefix: string, message: string, ...rest: unknown[]) {
    console.warn(`${prefix} ${message}`, ...rest);
  },

  /**
   * Unconditional error for binding failures.
   * Not gated by debugEnabled — binding errors are always surfaced because
   * they indicate a broken updater that silently stopped applying values.
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
 * Uses a WeakRef so that JSDOM test resets naturally invalidate the cache:
 * when the old document is GC'd the WeakRef deref returns undefined and
 * the style is re-injected into the fresh document — no module-level boolean
 * flag needed.
 */
let _highlightStyleRef: WeakRef<HTMLStyleElement> | undefined;
function injectHighlightStyle(): void {
  if (_highlightStyleRef?.deref()?.isConnected) return;
  const style = document.createElement('style');
  style.setAttribute(HIGHLIGHT_STYLE_ATTR, '');
  style.textContent =
    `.${HIGHLIGHT_CLASS}{` +
    `outline:2px solid rgba(255,68,68,0.8);` +
    `outline-offset:1px;` +
    `transition:outline ${HIGHLIGHT_TRANSITION} ease-out` +
    `}`;
  document.head.appendChild(style);
  _highlightStyleRef = new WeakRef(style);
}

// Tracks the pending setTimeout handle per element.
// Stored outside rAF so that rapid successive calls can cancel a previously
// scheduled timer even before the rAF callback has fired.
const highlightTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

// Tracks pending rAF IDs so that a second call before the first rAF fires
// can cancel it, preventing duplicate classList.add calls.
const highlightRafs = new WeakMap<HTMLElement, ReturnType<typeof requestAnimationFrame>>();

/**
 * Flashes a red outline on an element to indicate a reactive DOM update.
 * Accepts only HTMLElement — callers are responsible for unwrapping JQuery.
 *
 * Handles rapid successive calls correctly:
 * - Cancels any pending rAF before scheduling a new one.
 * - Cancels any pending timeout before scheduling a new one.
 */
function highlightElement(el: HTMLElement): void {
  if (!el.isConnected) return;

  injectHighlightStyle();

  // Cancel pending rAF to avoid duplicate classList.add.
  // .set() below overwrites the entry, so .delete() here is not needed.
  const existingRaf = highlightRafs.get(el);
  if (existingRaf !== undefined) {
    cancelAnimationFrame(existingRaf);
  }

  // Cancel pending timeout so the class is not prematurely removed.
  // .set() in the rAF callback overwrites the entry, so .delete() here is not needed.
  const existingTimer = highlightTimers.get(el);
  if (existingTimer !== undefined) {
    clearTimeout(existingTimer);
  }

  const rafId = requestAnimationFrame(() => {
    highlightRafs.delete(el);
    el.classList.add(HIGHLIGHT_CLASS);

    highlightTimers.set(
      el,
      setTimeout(() => {
        el.classList.remove(HIGHLIGHT_CLASS);
        highlightTimers.delete(el);
      }, HIGHLIGHT_DURATION_MS)
    );
  });

  highlightRafs.set(el, rafId);
}
