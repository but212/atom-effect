import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

// ============================================================================
// Constants & Configuration
// ============================================================================

const HIGHLIGHT_CLASS = 'atom-debug-highlight';
const ATTR_MARKER = 'data-atom-debug';
const IS_BROWSER = typeof window !== 'undefined';

/** Shared timer maps to track active animations and timeouts on elements. */
const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const rafs = new WeakMap<Element, number>();

let styleInjected = false;

// ============================================================================
// Utilities
// ============================================================================

/** Calculates the CSS transition duration based on configuration. */
const getTransitionDuration = () => `${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s`;

/** Returns the necessary CSS for visual debugging. */
const getHighlightStyles = () =>
  `
  [${ATTR_MARKER}] {
    transition: outline ${getTransitionDuration()} ease-out;
  }
  .${HIGHLIGHT_CLASS} {
    outline: 2px solid rgba(255, 68, 68, 0.8);
    outline-offset: 1px;
  }
`.replace(/\s+/g, ' ');

/** Injects necessary CSS for highlighting to the document head. */
function injectStyle(): void {
  if (styleInjected || !IS_BROWSER) return;

  // Double check existence in case of multiple debug modules or manual removal
  if (document.querySelector(`style[${ATTR_MARKER}]`)) {
    styleInjected = true;
    return;
  }

  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = getHighlightStyles();
  document.head.appendChild(style);
  styleInjected = true;
}

/** Determines the initial debug state of the application. */
function resolveInitialState(): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: globalThis/process may be untyped
  const g = globalThis as any;

  // 1. Browser global override
  if (IS_BROWSER && g.window?.__ATOM_DEBUG__ === true) return true;

  // 2. Vite/Meta environment
  try {
    if (import.meta.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}

  // 3. Node.js environment
  try {
    if (g.process?.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}

  return false;
}

// ============================================================================
// DebugController
// ============================================================================

/**
 * Controller responsible for managing debug logs and UI feedback.
 * Swaps methods at runtime to minimize branch prediction misses in hot paths.
 */
class DebugController {
  private _enabled = false;

  constructor() {
    this._enabled = resolveInitialState();
    this._applyLoggingSubsystem(this._enabled);
  }

  /** Gets whether debug mode is currently active. */
  public get enabled(): boolean {
    return this._enabled;
  }

  /** Sets the debug mode state and updates active logging methods. */
  public set enabled(v: boolean) {
    if (this._enabled !== v) {
      this._enabled = v;
      this._applyLoggingSubsystem(v);
    }
  }

  /** Normal logs (No-op when disabled) */
  public log: (prefix: string, ...args: unknown[]) => void = () => {};

  /** Atom state change logs (No-op when disabled) */
  public atomChanged: (
    prefix: string,
    name: string | undefined,
    prev: unknown,
    next: unknown
  ) => void = () => {};

  /** DOM update logs with visual highlighting (No-op when disabled) */
  public domUpdated: (
    prefix: string,
    target: Element | JQuery<Element>,
    type: string,
    value: unknown
  ) => void = () => {};

  /** Resource cleanup logs (No-op when disabled) */
  public cleanup: (prefix: string, subject: string) => void = () => {};

  /** Warnings (Always logged irrespective of enabled state) */
  public warn(prefix: string, message: string, ...rest: unknown[]): void {
    console.warn(`${prefix} ${message}`, ...rest);
  }

  /** Errors (Always logged irrespective of enabled state) */
  public error(prefix: string, message: string, cause: unknown): void {
    console.error(`${prefix} ${message}`, cause);
  }

  /** Swaps the internal implementation of logging methods based on the state. */
  private _applyLoggingSubsystem(isEnabled: boolean) {
    if (isEnabled) {
      this.log = (prefix, ...args) => console.log(prefix, ...args);
      this.atomChanged = (prefix, name, prev, next) =>
        console.log(`${prefix} Atom "${name ?? 'anonymous'}" changed:`, prev, '→', next);
      this.domUpdated = (prefix, target, type, value) => {
        this._handleDomUpdateLog(prefix, target, type, value);
      };
      this.cleanup = (prefix, subject) => console.log(`${prefix} Cleanup: ${subject}`);
    } else {
      const noop = () => {};
      this.log = noop;
      this.atomChanged = noop;
      this.domUpdated = noop;
      this.cleanup = noop;
    }
  }

  /**
   * Internal handler for DOM updates. Resolves the target element,
   * logs the change, and triggers visual feedback.
   */
  private _handleDomUpdateLog(
    prefix: string,
    target: Element | JQuery<Element>,
    type: string,
    value: unknown
  ) {
    // Resolve element from target (supports HTMLElement, SVGElement, or JQuery wrapper)
    const el = 'jquery' in target ? target[0] : target;

    // Only proceed if it is a connected Element node
    if (el && el.nodeType === 1 && el.isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el as Element)}.${type} =`, value);
      this._triggerVisualHighlight(el as Element);
    }
  }

  /** Applies a visual outline highlight to an element with a fade-out transition. */
  private _triggerVisualHighlight(el: Element): void {
    const g = globalThis;
    const raf = g.requestAnimationFrame;
    const caf = g.cancelAnimationFrame;

    if (!IS_BROWSER || typeof raf !== 'function') return;
    injectStyle();

    // Cancel existing scheduled highlights on this element
    const existingRaf = rafs.get(el);
    const existingTimer = timers.get(el);
    if (existingRaf !== undefined && typeof caf === 'function') caf(existingRaf);
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer);
      timers.delete(el);
    }

    // Apply the marker attribute if not present to enable the CSS transition
    if (!el.hasAttribute(ATTR_MARKER)) {
      el.setAttribute(ATTR_MARKER, '');
    }

    // Use requestAnimationFrame to ensure the class change happens in the next paint cycle
    rafs.set(
      el,
      raf(() => {
        rafs.delete(el);
        if (!el.isConnected) return;

        el.classList.add(HIGHLIGHT_CLASS);

        // Schedule removal
        timers.set(
          el,
          setTimeout(() => {
            // Remove the highlight class. The outline will fade out smoothly
            // because the [data-atom-debug] transition remains active.
            el.classList.remove(HIGHLIGHT_CLASS);
            timers.delete(el);
          }, DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS)
        );
      })
    );
  }
}

/** Singleton instance of the DebugController. */
export const debug = new DebugController();
