import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SYSTEM_BINDING, SYSTEM_DEBUG, SYSTEM_MOUNT } from '@/constants';
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
    it('should gate by enabled state', () => {
      // 1. Gating check
      debug.enabled = false;
      debug.domUpdated(SYSTEM_BINDING.PREFIX, document.createElement('div'), 'test', 'val');
      expect(logSpy).not.toHaveBeenCalled();

      // 2. Critical messages check (behavior: always on irrespective of state)
      const error = new Error('fail');
      debug.warn(SYSTEM_MOUNT.PREFIX, 'warning');
      debug.error(SYSTEM_BINDING.PREFIX, 'error', error);
      expect(warnSpy).toHaveBeenCalledWith(`${SYSTEM_MOUNT.PREFIX} warning`);
      expect(errorSpy).toHaveBeenCalledWith(`${SYSTEM_BINDING.PREFIX} error`, error);
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
      debug.domUpdated(SYSTEM_BINDING.PREFIX, htmlEl, 'text', 'v1');
      debug.domUpdated(SYSTEM_BINDING.PREFIX, svgEl, 'attr', 'v2');
      debug.domUpdated(SYSTEM_BINDING.PREFIX, jqWrapper, 'prop', 'v3');

      // Verify skip logic (TextNode) - should not log or highlight
      debug.domUpdated(SYSTEM_BINDING.PREFIX, textNode as unknown as Element, 'op', 'v4');

      expect(logSpy).toHaveBeenCalledTimes(3); // html, svg, jq only
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('div#app.text'), 'v1');

      // Verify highlighting application
      await new Promise((r) => requestAnimationFrame(r));
      const anims = htmlEl.getAnimations();
      expect(anims.length).toBeGreaterThan(0);
      expect(anims[0]?.effect?.getTiming().duration).toBe(
        SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS
      );

      // Verify cleanup lifecycle (even if element is disconnected during the wait)
      htmlEl.remove();
      await new Promise((r) => setTimeout(r, SYSTEM_DEBUG.DEFAULTS.HIGHLIGHT_DURATION_MS + 100));
      expect(htmlEl.getAnimations().length).toBe(0);

      svgEl.remove();
      textNode.remove();
    });

    it('should ensure idempotent style injection', () => {
      debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);

      // Triggering update multiple times should result in exactly one injection method
      debug.domUpdated(SYSTEM_BINDING.PREFIX, el, 'a', '1');
      debug.domUpdated(SYSTEM_BINDING.PREFIX, el, 'b', '2');

      const hasAdopted =
        'adoptedStyleSheets' in document && 'replaceSync' in CSSStyleSheet.prototype;

      if (hasAdopted) {
        const sheets = document.adoptedStyleSheets;
        const hasDebugSheet = sheets.some((s) => {
          try {
            return Array.from(s.cssRules).some((r) => r.cssText.includes('data-atom-debug'));
          } catch {
            return false;
          }
        });
        expect(hasDebugSheet).toBe(true);
      } else {
        const styles = document.querySelectorAll('style[data-atom-debug]');
        expect(styles.length).toBe(1);
        expect(styles[0]?.textContent).toMatch(/\[data-atom-debug\]/);
      }
      el.remove();
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
        debug.domUpdated(SYSTEM_BINDING.PREFIX, container, 'test', 'value');
      }).not.toThrow();

      // Verify state was not updated illegally
      expect(logSpy).not.toHaveBeenCalled();

      // Restore environment
      globalThis.Element = originalElement;
      globalThis.requestAnimationFrame = originalRaf;
    });
  });
});
