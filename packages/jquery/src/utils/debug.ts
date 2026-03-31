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

let debugEnabled = getInitialState();

// ============================================================================
// DebugController — Class-based singleton for JIT optimization
// ============================================================================

class DebugController {
  get enabled(): boolean {
    return (
      (IS_BROWSER && (window as unknown as AtomWindow).__ATOM_DEBUG__ === true) || debugEnabled
    );
  }
  set enabled(v: boolean) {
    debugEnabled = v;
  }

  log(p: string, ...a: unknown[]): void {
    if (this.enabled) console.log(p, ...a);
  }

  atomChanged(p: string, n: string | undefined, o: unknown, v: unknown): void {
    if (this.enabled) console.log(`${p} Atom "${n ?? 'anonymous'}" changed:`, o, '→', v);
  }

  domUpdated(p: string, t: Element | JQuery<Element>, type: string, v: unknown): void {
    if (!this.enabled) return;
    const el = t instanceof Element ? t : (t[0] as Element | undefined);
    if (!el?.isConnected) return;
    console.log(`${p} DOM updated: ${getSelector(el)}.${type} =`, v);
    highlightElement(el);
  }

  cleanup(p: string, s: string): void {
    if (this.enabled) console.log(`${p} Cleanup: ${s}`);
  }

  warn(p: string, m: string, ...r: unknown[]): void {
    // Warnings are always logged unless suppressed via build-time logic
    console.warn(`${p} ${m}`, ...r);
  }

  error(p: string, m: string, c: unknown): void {
    // Errors are always logged
    console.error(`${p} ${m}`, c);
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
