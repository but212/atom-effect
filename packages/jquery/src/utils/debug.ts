import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

const HIGHLIGHT_CLASS = 'atom-debug-highlight';
const ATTR_MARKER = 'data-atom-debug';
const IS_BROWSER = typeof window !== 'undefined';

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
const rafs = new WeakMap<Element, number>();

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected || !IS_BROWSER) return;
  const style = document.createElement('style');
  style.setAttribute(ATTR_MARKER, '');
  style.textContent = `
    [${ATTR_MARKER}] { transition: outline ${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s ease-out; }
    .${HIGHLIGHT_CLASS} { outline: 2px solid rgba(255, 68, 68, 0.8); outline-offset: 1px; }
  `.replace(/\s+/g, ' ');
  document.head.appendChild(style);
  styleInjected = true;
}

function resolveInitialState(): boolean {
  const g = globalThis as typeof globalThis & {
    __ATOM_DEBUG__?: boolean;
    process?: { env?: { NODE_ENV?: string } };
  };
  if (g.__ATOM_DEBUG__ !== undefined) return !!g.__ATOM_DEBUG__;
  return g.process?.env?.NODE_ENV !== 'production' && g.process?.env?.NODE_ENV !== undefined;
}

const IS_DEV = resolveInitialState();

export const debug = {
  enabled: IS_DEV,

  warn: (prefix: string, message: string, ...rest: unknown[]) =>
    console.warn(`${prefix} ${message}`, ...rest),

  error: (prefix: string, message: string, cause: unknown) =>
    console.error(`${prefix} ${message}`, cause),

  domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown) {
    if (!this.enabled) return;
    const el = 'jquery' in target ? target[0] : target;
    if (el && el.nodeType === 1 && el.isConnected) {
      console.log(`${prefix} DOM updated: ${getSelector(el as Element)}.${type} =`, value);
      triggerVisualHighlight(el as Element);
    }
  },
};

function triggerVisualHighlight(el: Element): void {
  const g = globalThis;
  if (!IS_BROWSER || typeof g.requestAnimationFrame !== 'function') return;
  injectStyle();

  const existingRaf = rafs.get(el);
  const existingTimer = timers.get(el);
  if (existingRaf !== undefined) g.cancelAnimationFrame(existingRaf);
  if (existingTimer !== undefined) clearTimeout(existingTimer);

  if (!el.hasAttribute(ATTR_MARKER)) el.setAttribute(ATTR_MARKER, '');

  rafs.set(
    el,
    g.requestAnimationFrame(() => {
      rafs.delete(el);
      if (!el.isConnected) return;
      el.classList.add(HIGHLIGHT_CLASS);
      timers.set(
        el,
        setTimeout(() => {
          el.classList.remove(HIGHLIGHT_CLASS);
          timers.delete(el);
        }, DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS)
      );
    })
  );
}
