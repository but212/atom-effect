import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_PREFIXES } from '../src/constants';
import { debug } from '../src/debug';

describe('Debug Module', () => {
  const logSpy = vi.fn();
  const warnSpy = vi.fn();
  const errorSpy = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(logSpy);
    vi.spyOn(console, 'warn').mockImplementation(warnSpy);
    vi.spyOn(console, 'error').mockImplementation(errorSpy);
    logSpy.mockClear();
    warnSpy.mockClear();
    errorSpy.mockClear();
    debug.enabled = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    debug.enabled = false;
  });

  // --------------------------------------------------------------------------
  // debug.log — gated by enabled
  // --------------------------------------------------------------------------

  it('log: silent when disabled, emits formatted message when enabled', () => {
    debug.log(LOG_PREFIXES.LIST, 'payload');
    expect(logSpy).not.toHaveBeenCalled();

    debug.enabled = true;
    debug.log(LOG_PREFIXES.LIST, 'payload');
    expect(logSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.LIST}`, 'payload');
  });

  // --------------------------------------------------------------------------
  // debug.warn — always-on
  // --------------------------------------------------------------------------

  it('warn: emits regardless of enabled state', () => {
    debug.warn(LOG_PREFIXES.MOUNT, 'warning message');
    expect(warnSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} warning message`);

    warnSpy.mockClear();
    debug.enabled = true;
    debug.warn(LOG_PREFIXES.MOUNT, 'warning message');
    expect(warnSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} warning message`);
  });

  // --------------------------------------------------------------------------
  // debug.error — always-on
  // --------------------------------------------------------------------------

  it('error: emits with prefix and cause regardless of enabled state', () => {
    const cause = new Error('boom');
    debug.error(LOG_PREFIXES.BINDING, 'Effect dispose error', cause);
    expect(errorSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.BINDING} Effect dispose error`, cause);
  });

  // --------------------------------------------------------------------------
  // debug.atomChanged — gated, anonymous fallback
  // --------------------------------------------------------------------------

  it('atomChanged: silent when disabled, emits formatted change when enabled', () => {
    debug.atomChanged(LOG_PREFIXES.MOUNT, 'counter', 0, 1);
    expect(logSpy).not.toHaveBeenCalled();

    debug.enabled = true;
    debug.atomChanged(LOG_PREFIXES.MOUNT, 'counter', 0, 1);
    expect(logSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} Atom "counter" changed:`, 0, '→', 1);
  });

  it('atomChanged: falls back to "anonymous" when name is undefined', () => {
    debug.enabled = true;
    debug.atomChanged(LOG_PREFIXES.MOUNT, undefined, 'a', 'b');
    expect(logSpy).toHaveBeenCalledWith(
      `${LOG_PREFIXES.MOUNT} Atom "anonymous" changed:`,
      'a',
      '→',
      'b'
    );
  });

  // --------------------------------------------------------------------------
  // debug.cleanup — gated
  // --------------------------------------------------------------------------

  it('cleanup: logs selector when enabled', () => {
    debug.enabled = true;
    debug.cleanup(LOG_PREFIXES.BINDING, '#test');
    expect(logSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.BINDING} Cleanup: #test`);
  });

  // --------------------------------------------------------------------------
  // debug.domUpdated
  // --------------------------------------------------------------------------

  it('domUpdated: logs and highlights HTMLElement when enabled', async () => {
    debug.enabled = true;
    const el = document.createElement('div');
    document.body.appendChild(el);

    debug.domUpdated(LOG_PREFIXES.BINDING, el, 'text', 'new text');

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${LOG_PREFIXES.BINDING} DOM updated:`),
      'new text'
    );

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(el.classList.contains('atom-debug-highlight')).toBe(true);
    el.remove();
  });

  it('domUpdated: accepts jQuery wrapper and highlights underlying element', async () => {
    debug.enabled = true;
    const el = document.createElement('div');
    document.body.appendChild(el);
    const jqEl = Object.assign([el], { jquery: 'mock' }) as unknown as JQuery;

    debug.domUpdated(LOG_PREFIXES.BINDING, jqEl, 'text', 'val');

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(el.classList.contains('atom-debug-highlight')).toBe(true);
    el.remove();
  });

  it('domUpdated: ignores non-HTMLElement targets (SVGElement)', () => {
    debug.enabled = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);

    expect(() => debug.domUpdated(LOG_PREFIXES.BINDING, svg as unknown as Element, 'attr', 'val')).not.toThrow();
    expect(logSpy).not.toHaveBeenCalled();
    svg.remove();
  });

  it('domUpdated: removes highlight class after duration', async () => {
    debug.enabled = true;
    const el = document.createElement('div');
    document.body.appendChild(el);

    debug.domUpdated(LOG_PREFIXES.BINDING, el, 'text', 'val');

    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    expect(el.classList.contains('atom-debug-highlight')).toBe(true);

    await new Promise<void>((r) => setTimeout(r, 650));
    expect(el.classList.contains('atom-debug-highlight')).toBe(false);

    el.remove();
  }, 2000);

  it('domUpdated: injects highlight style tag only once per document', async () => {
    debug.enabled = true;
    const el = document.createElement('div');
    document.body.appendChild(el);

    debug.domUpdated(LOG_PREFIXES.BINDING, el, 'text', 'a');
    debug.domUpdated(LOG_PREFIXES.BINDING, el, 'text', 'b');
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    expect(document.querySelectorAll('style[data-atom-debug]').length).toBe(1);
    el.remove();
  });
});
