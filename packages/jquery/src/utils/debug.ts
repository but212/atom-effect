/**
 * @module AEJDebugDiagnostics
 *
 * Responsibility:
 * Provides console-based logging and visual instrumentation for reactive JQuery bindings.
 *
 * Design Intent:
 * Enables real-time feedback for DOM mutations triggered by reactive state changes.
 */

import { SYSTEM_DEBUG } from '@/constants';
import { getSelector } from '@/utils';

const ATTR_MARKER = 'data-atom-debug';
const animations = new WeakMap<Element, Animation>();

function resolveInitialState(): boolean {
  const globalScope = globalThis as typeof globalThis & {
    __ATOM_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (globalScope.__ATOM_DEBUG__ !== undefined) return !!globalScope.__ATOM_DEBUG__;
  const env = globalScope.process?.env?.NODE_ENV;
  return env !== 'production' && env !== undefined;
}

function injectStyle(): void {
  if (typeof document === 'undefined' || document.querySelector(`style[${ATTR_MARKER}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = `[${ATTR_MARKER}]{outline:0px solid transparent}`;
  document.head.appendChild(style);
}

function triggerVisualHighlight(element: Element): void {
  if (typeof element.animate !== 'function') return;

  injectStyle();
  animations.get(element)?.cancel();

  if (!element.hasAttribute(ATTR_MARKER)) {
    element.setAttribute(ATTR_MARKER, '');
  }

  const highlightAnimation = element.animate(
    [
      { outline: '2px solid rgba(255, 68, 68, 0.9)', outlineOffset: '1px' },
      { outline: '0px solid transparent', outlineOffset: '1px' },
    ],
    {
      duration: SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS,
      easing: 'ease-out',
    }
  );

  animations.set(element, highlightAnimation);
  highlightAnimation.onfinish = () => animations.delete(element);
}

let isEnabled = resolveInitialState();

/**
 * Global diagnostic system for inspecting reactive behavior.
 *
 * @public
 */
export const debug = {
  get enabled(): boolean {
    return isEnabled;
  },
  set enabled(value: boolean) {
    isEnabled = value;
  },

  warn(prefix: string, message: string, ...rest: unknown[]): void {
    console.warn(`${prefix} ${message}`, ...rest);
  },

  error(prefix: string, message: string, cause: unknown): void {
    console.error(`${prefix} ${message}`, cause);
  },

  domUpdated(
    prefix: string,
    target: Element | JQuery | null | undefined,
    type: string,
    value: unknown
  ): void {
    if (!isEnabled || !target) return;

    const element =
      target && typeof target === 'object' && 'jquery' in target
        ? (target as JQuery)[0]
        : (target as Element);

    if (element instanceof Element && element.isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(element)}.${type} =`, value);
      triggerVisualHighlight(element);
    }
  },
};
