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
  const g = globalThis as typeof globalThis & {
    __ATOM_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (g.__ATOM_DEBUG__ !== undefined) return !!g.__ATOM_DEBUG__;
  const env = g.process?.env?.NODE_ENV;
  return env !== 'production' && env !== undefined;
}

function injectStyle(): void {
  if (typeof document === 'undefined' || document.querySelector(`style[${ATTR_MARKER}]`)) return;

  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = `[${ATTR_MARKER}]{outline:0px solid transparent}`;
  document.head.appendChild(style);
}

function triggerVisualHighlight(el: Element): void {
  if (typeof el.animate !== 'function') return;

  injectStyle();
  animations.get(el)?.cancel();

  if (!el.hasAttribute(ATTR_MARKER)) {
    el.setAttribute(ATTR_MARKER, '');
  }

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

  animations.set(el, anim);
  anim.onfinish = () => animations.delete(el);
}

let enabled = resolveInitialState();

/**
 * Global diagnostic system for inspecting reactive behavior.
 *
 * @public
 */
export const debug = {
  get enabled(): boolean {
    return enabled;
  },
  set enabled(val: boolean) {
    enabled = val;
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
    if (!enabled || !target) return;

    const el =
      target && typeof target === 'object' && 'jquery' in target
        ? (target as JQuery)[0]
        : (target as Element);

    if (el instanceof Element && el.isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el)}.${type} =`, value);
      triggerVisualHighlight(el);
    }
  },
};
