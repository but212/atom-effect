import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOG_PREFIXES } from '@/constants';
import { debug } from '@/utils/debug';

describe('Debug Module', () => {
  const logSpy = vi.fn();
  const warnSpy = vi.fn();
  const errorSpy = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(logSpy);
    vi.spyOn(console, 'warn').mockImplementation(warnSpy);
    vi.spyOn(console, 'error').mockImplementation(errorSpy);
    [logSpy, warnSpy, errorSpy].forEach((s) => s.mockClear());
    debug.enabled = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    debug.enabled = false;
  });

  // --------------------------------------------------------------------------
  // Control Flow & Gating
  // --------------------------------------------------------------------------

  describe('Flow Control', () => {
    it('should gate all standard logging methods by enabled state', () => {
      // 1. Silent when disabled
      debug.log(LOG_PREFIXES.BINDING, 'msg');
      debug.atomChanged(LOG_PREFIXES.MOUNT, 'atom', 0, 1);
      debug.cleanup(LOG_PREFIXES.LIST, 'subject');
      expect(logSpy).not.toHaveBeenCalled();

      // 2. Active when enabled
      debug.enabled = true;
      debug.log(LOG_PREFIXES.BINDING, 'msg');
      debug.atomChanged(LOG_PREFIXES.MOUNT, 'atom', 0, 1);
      debug.atomChanged(LOG_PREFIXES.MOUNT, undefined, 'old', 'new'); // Anonymous check
      debug.cleanup(LOG_PREFIXES.LIST, 'subject');

      expect(logSpy).toHaveBeenCalledWith(LOG_PREFIXES.BINDING, 'msg');
      expect(logSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} Atom "atom" changed:`, 0, '→', 1);
      expect(logSpy).toHaveBeenCalledWith(
        `${LOG_PREFIXES.MOUNT} Atom "anonymous" changed:`,
        'old',
        '→',
        'new'
      );
      expect(logSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.LIST} Cleanup: subject`);
    });

    it('should always emit critical messages (warn, error) irrespective of state', () => {
      const cause = new Error('boom');
      debug.warn(LOG_PREFIXES.MOUNT, 'low battery');
      debug.error(LOG_PREFIXES.BINDING, 'short circuit', cause);

      expect(warnSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} low battery`);
      expect(errorSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.BINDING} short circuit`, cause);

      warnSpy.mockClear();
      debug.enabled = true;
      debug.warn(LOG_PREFIXES.MOUNT, 'low battery');
      expect(warnSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} low battery`);
    });
  });

  // --------------------------------------------------------------------------
  // DOM Feedback (domUpdated)
  // --------------------------------------------------------------------------

  describe('DOM Visual Feedback', () => {
    it('should resolve various target types and apply highlighting', async () => {
      debug.enabled = true;

      // Prepare different targets
      const htmlEl = Object.assign(document.createElement('div'), { id: 'app', className: 'main' });
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svgEl.setAttribute('class', 'icon small');
      const jqEl = Object.assign([htmlEl], { jquery: 'fixture' }) as unknown as JQuery<HTMLElement>;

      document.body.append(htmlEl, svgEl);

      // Trigger updates
      debug.domUpdated(LOG_PREFIXES.BINDING, htmlEl, 'text', 'v1');
      debug.domUpdated(LOG_PREFIXES.BINDING, svgEl, 'attr', 'v2');
      debug.domUpdated(LOG_PREFIXES.BINDING, jqEl, 'prop', 'v3');

      // Verify selectors in logs
      expect(logSpy).toHaveBeenCalledWith(
        `${LOG_PREFIXES.BINDING} DOM updated: div#app.main.text =`,
        'v1'
      );
      expect(logSpy).toHaveBeenCalledWith(
        `${LOG_PREFIXES.BINDING} DOM updated: svg.icon.small.attr =`,
        'v2'
      );
      expect(logSpy).toHaveBeenCalledWith(
        `${LOG_PREFIXES.BINDING} DOM updated: div#app.main.prop =`,
        'v3'
      );

      // Wait for RAF
      await new Promise((r) => requestAnimationFrame(r));
      expect(htmlEl.classList.contains('atom-debug-highlight')).toBe(true);
      expect(svgEl.classList.contains('atom-debug-highlight')).toBe(true);

      [htmlEl, svgEl].forEach((el) => el.remove());
    });

    it('should manage highlight lifecycle and ensure cleanup even on disconnected elements', async () => {
      debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);

      // Start highlight
      debug.domUpdated(LOG_PREFIXES.BINDING, el, 'op', 'val');
      await new Promise((r) => requestAnimationFrame(r));
      expect(el.classList.contains('atom-debug-highlight')).toBe(true);

      // Regression check: element removed before timeout
      el.remove();

      // Wait for timeout (duration is 500ms)
      await new Promise((r) => setTimeout(r, 650));
      expect(el.classList.contains('atom-debug-highlight')).toBe(false);
    });

    it('should inject persistent transition styles exactly once', () => {
      debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);

      // Multiple calls
      debug.domUpdated(LOG_PREFIXES.BINDING, el, 'a', '1');
      debug.domUpdated(LOG_PREFIXES.BINDING, el, 'b', '2');

      const styles = document.querySelectorAll('style[data-atom-debug]');
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toMatch(/\[data-atom-debug\]\s*\{.*transition/);
      el.remove();
    });
  });
});
