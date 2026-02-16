import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../src/debug';

describe('Debug Module', () => {
  let originalConsoleLog: typeof console.log;
  let originalConsoleWarn: typeof console.warn;
  const logSpy = vi.fn();
  const warnSpy = vi.fn();

  beforeEach(() => {
    originalConsoleLog = console.log;
    originalConsoleWarn = console.warn;
    console.log = logSpy;
    console.warn = warnSpy;
    logSpy.mockClear();
    warnSpy.mockClear();
    debug.enabled = false;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.warn = originalConsoleWarn;
    debug.enabled = false;
  });

  it('toggles enabled state properly', () => {
    expect(debug.enabled).toBe(false);
    debug.enabled = true;
    expect(debug.enabled).toBe(true);
  });

  describe('logging', () => {
    it('logs only when enabled', () => {
      debug.log('Test', 'msg');
      expect(logSpy).not.toHaveBeenCalled();

      debug.enabled = true;
      debug.log('Test', 'msg');
      expect(logSpy).toHaveBeenCalledWith('[atom-effect-jquery] Test:', 'msg');
    });

    it('warns only when enabled', () => {
      debug.warn('warning message');
      expect(warnSpy).not.toHaveBeenCalled();

      debug.enabled = true;
      debug.warn('warning message');
      expect(warnSpy).toHaveBeenCalledWith('[atom-effect-jquery]', 'warning message');
    });
  });

  describe('events', () => {
    it('logs atom changes when enabled', () => {
      debug.enabled = true;
      debug.atomChanged('testAtom', 1, 2);

      expect(logSpy).toHaveBeenCalledWith(
        '[atom-effect-jquery] Atom "testAtom" changed:',
        1,
        '→',
        2
      );
    });

    it('logs DOM updates and highlights element when enabled', () => {
      debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);

      debug.domUpdated(el, 'text', 'new text');

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('[atom-effect-jquery] DOM updated:'),
        'new text'
      );

      // Verify highlight class added
      expect(el.classList.contains('atom-debug-highlight')).toBe(true);
      document.body.removeChild(el);
    });

    it('handles jQuery objects in DOM updates', () => {
      debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);
      const jqEl = Object.assign([el], { jquery: 'mock' }) as unknown as JQuery;

      debug.domUpdated(jqEl, 'text', 'val');

      expect(el.classList.contains('atom-debug-highlight')).toBe(true);
      document.body.removeChild(el);
    });

    it('logs cleanup', () => {
      debug.enabled = true;
      debug.cleanup('#test');
      expect(logSpy).toHaveBeenCalledWith('[atom-effect-jquery] Cleanup: #test');
    });
  });
});
