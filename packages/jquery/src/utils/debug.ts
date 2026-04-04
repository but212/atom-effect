import { DEBUG_DEFAULTS } from '@/constants';
import { getSelector } from '@/utils';

// ============================================================================
// Environment utilities
// ============================================================================

const IS_BROWSER = typeof window !== 'undefined';
const HIGHLIGHT_TRANSITION = `${DEBUG_DEFAULTS.HIGHLIGHT_DURATION_MS / 1000}s`;

interface AtomWindow extends Window {
  __ATOM_DEBUG__?: boolean;
}

interface AtomGlobal {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

function getInitialState(): boolean {
  if (IS_BROWSER && (window as unknown as AtomWindow).__ATOM_DEBUG__ === true) return true;
  try {
    if (import.meta.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}
  try {
    if ((globalThis as unknown as AtomGlobal).process?.env?.VITE_ATOM_DEBUG === 'true') return true;
  } catch {}
  return false;
}

// ============================================================================
// DebugController — Class-based singleton for JIT optimization
// ============================================================================

class DebugController {
  private _enabled = false;
  private _lastState = false;

  constructor() {
    this._enabled = getInitialState();
    this._lastState = this._enabled;
    this._applyMethods(this._enabled);
  }

  get enabled(): boolean {
    const current =
      (IS_BROWSER && (window as unknown as AtomWindow).__ATOM_DEBUG__ === true) || this._enabled;
    if (current !== this._lastState) {
      this._lastState = current;
      this._applyMethods(current);
    }
    return current;
  }

  set enabled(v: boolean) {
    this._enabled = v;
    // Getter will handle _applyMethods on next access,
    // but we force it here for immediate effect (e.g. from code).
    if (v !== this._lastState) {
      this._lastState = v;
      this._applyMethods(v);
    }
  }

  /** Normal logs (No-op in production) */
  log(p: string, ...a: unknown[]): void {
    // Accessing .enabled triggers state sync if window.__ATOM_DEBUG__ changed
    if (this.enabled) this._log(p, ...a);
  }

  /** Atom state change logs (No-op in production) */
  atomChanged(p: string, n: string | undefined, o: unknown, v: unknown): void {
    if (this.enabled) this._atomChanged(p, n, o, v);
  }

  /** DOM update logs with highlighting (No-op in production) */
  domUpdated(p: string, t: Element | JQuery<Element>, type: string, v: unknown): void {
    if (this.enabled) this._domUpdated(p, t, type, v);
  }

  /** Resource cleanup logs (No-op in production) */
  cleanup(p: string, s: string): void {
    if (this.enabled) this._cleanup(p, s);
  }

  /** Warnings (Always logged) */
  warn(p: string, m: string, ...r: unknown[]): void {
    console.warn(`${p} ${m}`, ...r);
  }

  /** Errors (Always logged) */
  error(p: string, m: string, c: unknown): void {
    console.error(`${p} ${m}`, c);
  }

  private _log: (p: string, ...a: unknown[]) => void = () => {};
  private _atomChanged: (p: string, n: string | undefined, o: unknown, v: unknown) => void =
    () => {};
  private _domUpdated: (p: string, t: Element | JQuery<Element>, type: string, v: unknown) => void =
    () => {};
  private _cleanup: (p: string, s: string) => void = () => {};

  private _applyMethods(isEnabled: boolean) {
    if (isEnabled) {
      this._log = (p, ...a) => console.log(p, ...a);
      this._atomChanged = (p, n, o, v) =>
        console.log(`${p} Atom "${n ?? 'anonymous'}" changed:`, o, '→', v);
      this._domUpdated = (p, t, type, v) => {
        const el = t instanceof Element ? t : (t[0] as Element | undefined);
        if (el?.isConnected) {
          console.log(`${p} DOM updated: ${getSelector(el)}.${type} =`, v);
          highlightElement(el);
        }
      };
      this._cleanup = (p, s) => console.log(`${p} Cleanup: ${s}`);
    } else {
      this._log = () => {};
      this._atomChanged = () => {};
      this._domUpdated = () => {};
      this._cleanup = () => {};
    }
  }
}

export const debug = new DebugController();

// ============================================================================
// Highlighting logic
// ============================================================================

const HIGHLIGHT_CLASS = 'atom-debug-highlight',
  H_ATTR = 'data-atom-debug';
let styleInjected = false;

function injectStyle(): void {
  if (styleInjected || !IS_BROWSER) return;
  if (document.querySelector(`style[${H_ATTR}]`)) {
    styleInjected = true;
    return;
  }
  const s = Object.assign(document.createElement('style'), {
    textContent: `.${HIGHLIGHT_CLASS}{outline:2px solid rgba(255,68,68,0.8);outline-offset:1px;transition:outline ${HIGHLIGHT_TRANSITION} ease-out}`,
  });
  s.setAttribute(H_ATTR, '');
  document.head.appendChild(s);
  styleInjected = true;
}

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>(),
  rafs = new WeakMap<Element, number>();

function highlightElement(el: Element): void {
  if (!debug.enabled || !el.isConnected) return;
  injectStyle();

  const exR = rafs.get(el);
  const exT = timers.get(el);
  if (exR !== undefined) cancelAnimationFrame(exR);
  if (exT !== undefined) {
    clearTimeout(exT);
    timers.delete(el);
  }

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
