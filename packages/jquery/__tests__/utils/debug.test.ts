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
  // Configuration & Gating
  // --------------------------------------------------------------------------

  describe('Configuration & Gating', () => {
    it('should gate standard logs by state while always emitting critical messages', () => {
      // 1. Gating check (standard logs should be silent when disabled)
      debug.log(LOG_PREFIXES.BINDING, 'silent');
      debug.atomChanged(LOG_PREFIXES.BINDING, 'atom', 0, 1);
      debug.cleanup(LOG_PREFIXES.BINDING, 'subject');
      expect(logSpy).not.toHaveBeenCalled();

      // 2. Activation check (standard logs should emit when enabled)
      debug.enabled = true;
      debug.log(LOG_PREFIXES.BINDING, 'active');
      expect(logSpy).toHaveBeenCalledWith(LOG_PREFIXES.BINDING, 'active');

      // 3. Critical messages check (behavior: always on irrespective of state)
      debug.enabled = false;
      const error = new Error('fail');
      debug.warn(LOG_PREFIXES.MOUNT, 'warning');
      debug.error(LOG_PREFIXES.BINDING, 'error', error);
      expect(warnSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.MOUNT} warning`);
      expect(errorSpy).toHaveBeenCalledWith(`${LOG_PREFIXES.BINDING} error`, error);
    });
  });

  // --------------------------------------------------------------------------
  // DOM Feedback Behavior
  // --------------------------------------------------------------------------

  describe('DOM Feedback Behavior', () => {
    it('should resolve diverse targets and manage highlight lifecycle', async () => {
      debug.enabled = true;
      const htmlEl = Object.assign(document.createElement('div'), { id: 'app' });
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const textNode = document.createTextNode('text');
      const jqWrapper = Object.assign([htmlEl], {
        jquery: '3.x',
      }) as unknown as JQuery<HTMLElement>;

      document.body.append(htmlEl, svgEl, textNode);

      // Verify identification logic (HTML, SVG, JQuery)
      debug.domUpdated(LOG_PREFIXES.BINDING, htmlEl, 'text', 'v1');
      debug.domUpdated(LOG_PREFIXES.BINDING, svgEl, 'attr', 'v2');
      debug.domUpdated(LOG_PREFIXES.BINDING, jqWrapper, 'prop', 'v3');

      // Verify skip logic (TextNode) - should not log or highlight
      debug.domUpdated(LOG_PREFIXES.BINDING, textNode as unknown as Element, 'op', 'v4');

      expect(logSpy).toHaveBeenCalledTimes(3); // html, svg, jq only
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('div#app.text'), 'v1');

      // Verify highlighting application
      await new Promise((r) => requestAnimationFrame(r));
      expect(htmlEl.classList.contains('atom-debug-highlight')).toBe(true);

      // Verify cleanup lifecycle (even if element is disconnected during the wait)
      htmlEl.remove();
      await new Promise((r) => setTimeout(r, 600)); // duration + buffer for reliability
      expect(htmlEl.classList.contains('atom-debug-highlight')).toBe(false);

      svgEl.remove();
      textNode.remove();
    });

    it('should ensure idempotent style injection', () => {
      debug.enabled = true;
      const el = document.createElement('div');

      // Triggering update multiple times should result in exactly one <style> tag
      debug.domUpdated(LOG_PREFIXES.BINDING, el, 'a', '1');
      debug.domUpdated(LOG_PREFIXES.BINDING, el, 'b', '2');

      const styles = document.querySelectorAll('style[data-atom-debug]');
      expect(styles.length).toBe(1);
      expect(styles[0]?.textContent).toMatch(/\[data-atom-debug\]\s*\{.*transition/);
    });
  });

  // --------------------------------------------------------------------------
  // Cross-environment Resilience
  // --------------------------------------------------------------------------

  describe('SSR & Environment Resilience', () => {
    it('should remain robust when browser-only globals are missing', () => {
      debug.enabled = true;
      const container = document.createElement('div');

      const originalElement = globalThis.Element;
      const originalRaf = globalThis.requestAnimationFrame;

      // Mock SSR environment by temporarily removing browser globals
      // @ts-expect-error: simulating missing globals
      globalThis.Element = undefined;
      // @ts-expect-error: simulating missing globals
      globalThis.requestAnimationFrame = undefined;

      // Logic check: should not throw ReferenceErrors or crash
      expect(() => {
        debug.domUpdated(LOG_PREFIXES.BINDING, container, 'test', 'value');
      }).not.toThrow();

      // Verify state was not updated illegally
      expect(logSpy).not.toHaveBeenCalled();

      // Restore environment
      globalThis.Element = originalElement;
      globalThis.requestAnimationFrame = originalRaf;
    });
  });
});
