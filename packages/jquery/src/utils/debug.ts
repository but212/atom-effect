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

const HIGHLIGHT_TRANSITION = `${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s`;

function getInitialState(): boolean {
  if (
    typeof window !== 'undefined' &&
    (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__ === true
  )
    return true;
  try {
    if (import.meta.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}
  try {
    if (
      (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } })
        .process?.env?.VITE_ATOM_DEBUG === 'true'
    )
      return true;
  } catch {}
  return false;
}

let debugEnabled = getInitialState();

export const debug = {
  get enabled() {
    return (
      (typeof window !== 'undefined' &&
        (window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__) ??
      debugEnabled
    );
  },
  set enabled(v: boolean) {
    debugEnabled = v;
  },
  log: (p: string, ...a: unknown[]) => debug.enabled && console.log(p, ...a),
  atomChanged(p: string, n: string | undefined, o: unknown, v: unknown) {
    if (this.enabled) console.log(`${p} Atom "${n ?? 'anonymous'}" changed:`, o, '→', v);
  },
  domUpdated(p: string, t: Element | JQuery<Element>, type: string, v: unknown) {
    if (!this.enabled) return;
    const el = t instanceof Element ? t : (t[0] as Element | undefined);
    if (el) {
      console.log(`${p} DOM updated: ${getSelector(el)}.${type} =`, v);
      highlightElement(el);
    }
  },
  cleanup: (p: string, s: string) => debug.enabled && console.log(`${p} Cleanup: ${s}`),
  warn: (p: string, m: string, ...r: unknown[]) => console.warn(`${p} ${m}`, ...r),
  error: (p: string, m: string, c: unknown) => console.error(`${p} ${m}`, c),
};

const HIGHLIGHT_CLASS = 'atom-debug-highlight',
  H_ATTR = 'data-atom-debug';
let styleRef: WeakRef<HTMLStyleElement> | HTMLStyleElement | undefined;

function injectStyle(): void {
  const cur = styleRef instanceof HTMLStyleElement ? styleRef : styleRef?.deref();
  if (cur?.isConnected || document.querySelector(`style[${H_ATTR}]`)) return;
  const s = Object.assign(document.createElement('style'), {
    textContent: `.${HIGHLIGHT_CLASS}{outline:2px solid rgba(255,68,68,0.8);outline-offset:1px;transition:outline ${HIGHLIGHT_TRANSITION} ease-out}`,
  });
  s.setAttribute(H_ATTR, '');
  document.head.appendChild(s);
  styleRef = typeof WeakRef !== 'undefined' ? new WeakRef(s) : s;
}

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>(),
  rafs = new WeakMap<Element, number>();

function highlightElement(el: Element): void {
  if (!debug.enabled || !el.isConnected) return;
  injectStyle();
  const exR = rafs.get(el),
    exT = timers.get(el);
  if (exR !== undefined) cancelAnimationFrame(exR);
  if (exT !== undefined) clearTimeout(exT);

  rafs.set(
    el,
    requestAnimationFrame(() => {
      rafs.delete(el);
      if (!el.isConnected) return;
      el.classList.add(HIGHLIGHT_CLASS);
      timers.set(
        el,
        setTimeout(() => {
          if (el.isConnected) el.classList.remove(HIGHLIGHT_CLASS);
          timers.delete(el);
        }, DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS)
      );
    })
  );
}
