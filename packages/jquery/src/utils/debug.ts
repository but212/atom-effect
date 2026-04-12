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
  const g = globalThis as {
    __ATOM_DEBUG__?: boolean;
    __DEV__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };

  // 1. Explicit global override or sessionStorage (supports runtime toggling in builds)
  if (typeof g.__ATOM_DEBUG__ !== 'undefined') return !!g.__ATOM_DEBUG__;
  try {
    if (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('__ATOM_DEBUG__') === 'true'
    )
      return true;
  } catch {}

  // 2. Node.js / Bundler environment check
  if (g.process?.env?.NODE_ENV !== 'production' && g.process?.env?.NODE_ENV !== undefined) {
    return true;
  }

  // 3. __DEV__ flag (often injected by bundlers)
  if (typeof g.__DEV__ !== 'undefined') return !!g.__DEV__;

  // 4. Vite/Meta specific
  try {
    if (import.meta.env?.DEV) return true;
    if (import.meta.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}

  return false;
}

// ============================================================================
// DebugController
// ============================================================================

export interface DebugConfig {
  enabled: boolean;
  log(prefix: string, ...args: unknown[]): void;
  atomChanged(prefix: string, name: string | undefined, prev: unknown, next: unknown): void;
  domUpdated(prefix: string, target: Element | JQuery<Element>, type: string, value: unknown): void;
  cleanup(prefix: string, subject: string): void;
  warn(prefix: string, message: string, ...rest: unknown[]): void;
  error(prefix: string, message: string, cause: unknown): void;
}

class DevDebugController implements DebugConfig {
  public enabled = true;

  public log(prefix: string, ...args: unknown[]): void {
    if (!this.enabled) return;
    console.log(prefix, ...args);
  }

  public atomChanged(prefix: string, name: string | undefined, prev: unknown, next: unknown): void {
    if (!this.enabled) return;
    console.log(`${prefix} Atom "${name ?? 'anonymous'}" changed:`, prev, '→', next);
  }

  public cleanup(prefix: string, subject: string): void {
    if (!this.enabled) return;
    console.log(`${prefix} Cleanup: ${subject}`);
  }

  public warn(prefix: string, message: string, ...rest: unknown[]): void {
    console.warn(`${prefix} ${message}`, ...rest);
  }

  public error(prefix: string, message: string, cause: unknown): void {
    console.error(`${prefix} ${message}`, cause);
  }

  public domUpdated(
    prefix: string,
    target: Element | JQuery<Element>,
    type: string,
    value: unknown
  ): void {
    if (!this.enabled) return;
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

/**
 * Inert implementation for production.
 */
const ProdDebugController: DebugConfig = {
  enabled: false,
  log: () => {},
  atomChanged: () => {},
  domUpdated: () => {},
  cleanup: () => {},
  warn: (prefix: string, message: string, ...rest: unknown[]) =>
    console.warn(`${prefix} ${message}`, ...rest),
  error: (prefix: string, message: string, cause: unknown) =>
    console.error(`${prefix} ${message}`, cause),
};

/**
 * Global debug controller singleton.
 * Swaps between Dev and Prod implementations for zero overhead in production.
 */
export const debug: DebugConfig = resolveInitialState()
  ? new DevDebugController()
  : ProdDebugController;
