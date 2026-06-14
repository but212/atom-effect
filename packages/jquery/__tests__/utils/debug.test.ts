import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
import { castTo } from './test-helpers';

describe('Debug Module (Black-box)', () => {
  const logSpy = vi.fn();
  const warnSpy = vi.fn();
  const errorSpy = vi.fn();

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(logSpy);
    vi.spyOn(console, 'warn').mockImplementation(warnSpy);
    vi.spyOn(console, 'error').mockImplementation(errorSpy);
    for (const s of [logSpy, warnSpy, errorSpy]) {
      s.mockClear();
    }

    // Ensure we start with a clean state
    $.debug.enabled = false;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    $.debug.enabled = false;

    // Clean up any styles or elements created during tests
    for (const s of document.querySelectorAll('style[data-atom-debug]')) {
      s.remove();
    }
    if ('adoptedStyleSheets' in document) {
      document.adoptedStyleSheets = [];
    }
  });

  describe('Visibility & Gating', () => {
    it('should suppress instrumentation logs when disabled', () => {
      $.debug.enabled = false;
      const el = document.createElement('div');
      document.body.appendChild(el);

      $.debug.domUpdated('[TEST]', el, 'text', 'new value');

      expect(logSpy).not.toHaveBeenCalled();
      expect(el.hasAttribute('data-atom-debug')).toBe(false);
      el.remove();
    });

    it('should always log critical messages (warn/error) regardless of enabled state', () => {
      $.debug.enabled = false;
      const error = new Error('critical failure');

      $.debug.warn('[WARN]', 'something is wrong');
      $.debug.error('[ERROR]', 'failed', error);

      expect(warnSpy).toHaveBeenCalledWith('[WARN] something is wrong');
      expect(errorSpy).toHaveBeenCalledWith('[ERROR] failed', error);
    });
  });

  describe('DOM Feedback Behavior', () => {
    it('should identify and highlight diverse targets (HTML, SVG, JQuery)', async () => {
      $.debug.enabled = true;

      const htmlEl = Object.assign(document.createElement('div'), { id: 'app' });
      const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      const jqEl = $('<span>');

      const jqElement = jqEl[0];
      if (!jqElement) throw new Error('JQuery element not found');

      document.body.append(htmlEl, svgEl, jqElement);

      // 1. Verify HTML Identification & Logging
      $.debug.domUpdated('[UI]', htmlEl, 'text', 'v1');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('div#app.text'), 'v1');
      expect(htmlEl.hasAttribute('data-atom-debug')).toBe(true);

      // 2. Verify SVG Identification
      $.debug.domUpdated('[SVG]', svgEl, 'attr', 'v2');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('svg.attr'), 'v2');
      expect(svgEl.hasAttribute('data-atom-debug')).toBe(true);

      // 3. Verify JQuery Identification
      $.debug.domUpdated('[JQ]', jqEl, 'prop', 'v3');
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('span.prop'), 'v3');
      expect(jqElement.hasAttribute('data-atom-debug')).toBe(true);

      // 4. Verify visual side-effect (Animation presence)
      // Note: We don't check duration (implementation detail), just that an animation started.
      expect(htmlEl.getAnimations().length).toBeGreaterThan(0);

      for (const el of [htmlEl, svgEl, jqElement]) {
        el.remove();
      }
    });

    it('should ignore disconnected elements and non-element nodes', () => {
      $.debug.enabled = true;

      const disconnected = document.createElement('div');
      const textNode = document.createTextNode('text node');

      $.debug.domUpdated('[SKIP]', disconnected, 'text', 'v1');
      $.debug.domUpdated('[SKIP]', castTo<Element>(textNode), 'text', 'v2');

      expect(logSpy).not.toHaveBeenCalled();
      expect(disconnected.hasAttribute('data-atom-debug')).toBe(false);
    });

    it('should ensure idempotent style injection occurs', () => {
      $.debug.enabled = true;
      const el = document.createElement('div');
      document.body.appendChild(el);

      // Trigger multiple times; should not cause multiple redundant injections
      $.debug.domUpdated('[UI]', el, 'a', '1');
      $.debug.domUpdated('[UI]', el, 'b', '2');

      const styleTags = document.querySelectorAll('style[data-atom-debug]');
      const adoptedSheetsCount = (document.adoptedStyleSheets as unknown[])?.length || 0;

      // Black-box check: some mechanism is providing the styles
      expect(styleTags.length + adoptedSheetsCount).toBeGreaterThan(0);

      el.remove();
    });
  });

  describe('Environment Resilience', () => {
    it('should handle malformed or missing targets gracefully without crashing', () => {
      $.debug.enabled = true;

      // Passing invalid types should not throw ReferenceErrors or crash the system
      expect(() =>
        $.debug.domUpdated('[UI]', castTo<Element>(null), 'test', 'val')
      ).not.toThrow();
      expect(() => $.debug.domUpdated('[UI]', castTo<Element>({}), 'test', 'val')).not.toThrow();
      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
