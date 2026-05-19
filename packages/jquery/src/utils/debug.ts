/**
 * @module AEJDebugDiagnostics
 *
 * Responsibility:
 * Provides console-based logging and visual instrumentation for reactive JQuery bindings.
 *
 * Design Intent:
 * Enables real-time feedback for DOM mutations triggered by reactive state changes,
 * helping developers identify redundant updates or verify the reactive lifecycle.
 */

import { SYSTEM_DEBUG } from '@/constants';
import { getSelector } from '@/utils';

/**
 * Why: Used as a unique identifier for elements under diagnostic observation
 * and as a hook for CSS style injection.
 * @internal
 */
const ATTR_MARKER = 'data-atom-debug';

/** Constraint: Diagnostics rely on DOM APIs available only in browser environments. @internal */
const IS_BROWSER = typeof window !== 'undefined';

/**
 * Role: Orchestrates visual feedback and mutation logging for JQuery bindings.
 *
 * Logic: Encapsulated State
 * Maintains diagnostic state (style injection, active animations) independently
 * to avoid polluting the global DOM or reactive graph with debug metadata.
 */
class DebugController {
  /** Global toggle to activate or deactivate the diagnostic system. */
  public enabled: boolean;

  /** Logic: Resilience - Prevents redundant style block injections. */
  #styleInjected = false;

  /**
   * Optimization: Memory Safety
   * Uses `WeakMap` to store active animations. This ensures that visual tracking
   * resources are automatically released when the element is removed from the DOM.
   */
  readonly #animations = new WeakMap<Element, Animation>();

  constructor() {
    this.enabled = this.#resolveInitialState();
  }

  /**
   * Logs a warning message with the library's diagnostic prefix.
   *
   * When to use:
   * - Alerting about non-critical configuration issues or unexpected usage patterns.
   * - Note: Logged regardless of the `enabled` state.
   */
  public warn(prefix: string, message: string, ...rest: unknown[]): void {
    console.warn(`${prefix} ${message}`, ...rest);
  }

  /**
   * Logs an error with the library's diagnostic prefix and the associated cause.
   *
   * When to use:
   * - Reporting terminal failures in the binding or diagnostic logic.
   * - Note: Logged regardless of the `enabled` state.
   */
  public error(prefix: string, message: string, cause: unknown): void {
    console.error(`${prefix} ${message}`, cause);
  }

  /**
   * Records a DOM mutation and triggers a visual highlight on the target.
   *
   * When to use:
   * - Called by internal binding logic immediately after a DOM update.
   *
   * @param prefix - The diagnostic category (e.g., '[JQuery:Text]').
   * @param target - The Element or JQuery collection affected by the update.
   * @param type - The update category (e.g., 'text', 'html', 'attr').
   * @param value - The new state applied to the target.
   *
   * @example
   * debug.domUpdated('[Binding]', $el, 'text', 'New Content');
   */
  public domUpdated(
    prefix: string,
    target: Element | JQuery | null | undefined,
    type: string,
    value: unknown
  ): void {
    if (!this.enabled || !target) return;

    const el = this.#resolveElement(target as Element | JQuery);

    /**
     * Constraint: Connection Check
     * Instrumentation is skipped for detached nodes to avoid unnecessary
     * visual processing for elements not visible to the user.
     */
    if (el?.nodeType === 1 && (el as Element).isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el as Element)}.${type} =`, value);
      this.#triggerVisualHighlight(el as Element);
    }
  }

  /** Logic: Polymorphic Input - Normalizes JQuery or Element targets into a single Element. */
  #resolveElement(target: Element | JQuery): Element | null {
    if (typeof target === 'object' && 'jquery' in target) {
      return (target as JQuery)[0] || null;
    }
    return target as Element;
  }

  /**
   * Logic: Idempotent Visual Feedback
   * Manages the lifecycle of a visual "flash" highlight. Previous animations
   * are canceled to ensure the most recent update is visually prioritized.
   */
  #triggerVisualHighlight(el: Element): void {
    if (!IS_BROWSER || typeof el.animate !== 'function') return;

    this.#injectStyle();

    // Why: Prevent visual overlap when updates occur faster than animation duration.
    this.#animations.get(el)?.cancel();

    if (!el.hasAttribute(ATTR_MARKER)) {
      el.setAttribute(ATTR_MARKER, '');
    }

    /**
     * Optimization: Compositor Offloading
     * Uses Native Web Animations API to perform style transitions on the
     * compositor thread, minimizing main-thread overhead.
     */
    const anim = el.animate(
      [
        { outline: '2px solid rgba(255, 68, 68, 0.9)', outlineOffset: '1px' },
        { outline: '0px solid transparent', outlineOffset: '1px' },
      ],
      {
        duration: SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS,
        easing: 'ease-out',
      }
    );

    this.#animations.set(el, anim);
    anim.onfinish = () => this.#animations.delete(el);
  }

  /**
   * Logic: Lazy & Resilient Style Injection
   * Injects CSS required for visual debugging only when the first highlight occurs.
   *
   * Optimization: Modern API Preference
   * Prioritizes `adoptedStyleSheets` for cleaner DOM and better performance
   * in supporting browsers, with a fallback to standard `<style>` elements.
   */
  #injectStyle(): void {
    if (!IS_BROWSER) return;

    // Resilience: Verify physical presence in case the DOM was cleared (e.g., between tests).
    const isPresent = document.querySelector(`style[${ATTR_MARKER}]`) || this.#checkAdoptedStyles();

    if (this.#styleInjected && isPresent) return;

    const css = `
      [${ATTR_MARKER}] { outline: 0px solid transparent; transition: outline 0.1s ease-out; }
      @keyframes atom-flash {
        0% { outline: 2px solid rgba(255, 68, 68, 0.9); outline-offset: 1px; }
        100% { outline: 0px solid transparent; outline-offset: 1px; }
      }
    `.replace(/\s+/g, ' ');

    if ('adoptedStyleSheets' in document && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    } else {
      const style = document.createElement('style');
      style.setAttribute(ATTR_MARKER, '');
      style.textContent = css;
      document.head.appendChild(style);
    }
    this.#styleInjected = true;
  }

  /** Logic: Deep Inspection - Scans adopted stylesheets for existing diagnostic rules. */
  #checkAdoptedStyles(): boolean {
    if (!('adoptedStyleSheets' in document)) return false;

    const doc = document as Document & { adoptedStyleSheets: readonly CSSStyleSheet[] };

    return doc.adoptedStyleSheets.some((s: CSSStyleSheet) => {
      try {
        return Array.from(s.cssRules).some((r: CSSRule) => r.cssText.includes(ATTR_MARKER));
      } catch {
        return false;
      }
    });
  }

  /** Logic: Environment Resolution - Determines initial state based on global flags or NODE_ENV. */
  #resolveInitialState(): boolean {
    const g = globalThis as typeof globalThis & {
      __ATOM_DEBUG__?: boolean;
      process?: { env?: { NODE_ENV?: string } };
    };
    if (g.__ATOM_DEBUG__ != null) {
      return !!g.__ATOM_DEBUG__;
    }
    return g.process?.env?.NODE_ENV !== 'production' && g.process?.env?.NODE_ENV != null;
  }
}

/**
 * Global diagnostic system for inspecting reactive behavior.
 *
 * When to use:
 * - Debugging reactive updates and DOM mutations in real-time.
 * - Inspecting error causes and call stacks in binding hooks.
 *
 * Logic: Runtime Control
 * Toggle `debug.enabled` at runtime (e.g., via the browser console) to
 * activate visual instrumentation without requiring a page reload.
 *
 * @example
 * ```typescript
 * $.debug.enabled = true; // Activate visual highlights
 * ```
 *
 * @public
 */
export const debug = new DebugController();
