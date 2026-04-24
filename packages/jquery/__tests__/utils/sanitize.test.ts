import { afterEach, describe, expect, it } from 'vitest';
import $ from '@/index';

// ─── Test Harness ────────────────────────────────────────────────────────────

/**
 * Harness for testing sanitization via the public reactive API surface.
 * Using the public API ensures we validate the security layer as consumers experience it.
 */
const aej = {
  /** Sanitizes HTML by binding it to a temporary element's atomHtml. */
  async sanitize(html: string | null | undefined): Promise<string> {
    const atom = $.atom(html as string);
    const div = $('<div>').atomHtml(atom);
    await $.nextTick();
    const result = div.html();
    div.atomUnbind();
    return result;
  },

  /** Validates if a URL attribute binding is blocked. */
  async isUrlBlocked(attr: string, url: string): Promise<boolean> {
    const div = $('<a>').atomAttr(attr, $.atom(url));
    await $.nextTick();
    const isBlocked = div.attr(attr) === undefined;
    div.atomUnbind();
    return isBlocked;
  },

  /** Validates if a CSS property binding is blocked. */
  async isCssBlocked(prop: string, val: string): Promise<boolean> {
    const div = $('<div>').atomCss(prop, $.atom(val));
    await $.nextTick();
    const isBlocked = div[0]!.style.getPropertyValue(prop) === '';
    div.atomUnbind();
    return isBlocked;
  },
};

// ─── Test Vectors ────────────────────────────────────────────────────────────

const BLACKLISTED_TAGS = [
  ['<script>alert(1)</script>', 'script'],
  ['<ScRiPt>alert(1)</ScRiPt>', 'script'],
  ['<script/src="http://evil.com/x.js"></script>', 'script'],
  ['<script >alert(1)</script>', 'script'],
  ['<iframe src="javascript:alert(1)"></iframe>', 'iframe'],
  ['<object data="javascript:alert(1)"></object>', 'object'],
  ['<embed src="javascript:alert(1)"></embed>', 'embed'],
  ['<applet code="XSS.class"></applet>', 'applet'],
  ['<meta http-equiv="refresh" content="0;url=javascript:alert(1)">', 'meta'],
  ['<base href="javascript:alert(1)//">', 'base'],
  ['<link rel="import" href="http://evil.com/xss.html">', 'link'],
  ['<form action="javascript:alert(1)"></form>', 'form'],
  ['<isindex action="javascript:alert(1)">', 'isindex'],
  ['<style>@import "http://evil.com/xss.css";</style>', 'style'],
  ['<title><img src=x onerror=alert(1)></title>', 'title'],
  ['<noscript><p title="</noscript><img src=x onerror=alert(1)>">', 'noscript'],
  ['<body onload=alert(1)>', 'body'],
];

const EVENT_HANDLERS = [
  ['<img src=x onerror=alert(1)>', 'onerror'],
  ['<div onmouseover="alert(1)">Test</div>', 'onmouseover'],
  ['<a onfocus="alert(1)" href="#">Link</a>', 'onfocus'],
  ['<button onclick = "alert(1)">Click</button>', 'onclick'],
  ['<input onblur\n=\nalert(1)>', 'onblur'],
  ['<details ontoggle=alert(1)>', 'ontoggle'],
  ['<video><source onerror=alert(1)>', 'onerror'],
  ['<svg onload=alert(1)>', 'onload'],
  ['<marquee onstart=alert(1)>', 'onstart'],
];

const DANGEROUS_PROTOCOLS = [
  'javascript:alert(1)',
  'java\0script:alert(1)',
  'java\x01script:alert(1)',
  'j a v a s c r i p t :alert(1)',
  'javascript\n:alert(1)',
  'javascript\r:alert(1)',
  'j&#x61;vascript:alert(1)',
  'j&#97;vascript:alert(1)',
  'javascript&colon;alert(1)',
  'javascript&#58;alert(1)',
  'vbscript:msgbox(1)',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:application/javascript;base64,YWxlcnQoMSk=',
  'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+',
];

const DANGEROUS_CSS = [
  'background:url(javascript:alert(1))',
  'background-image:  url("javascript:alert(1)")',
  "list-style: url('javascript:alert(1)')",
  'width:expression(alert(1))',
  'behavior:url(#default#VML)',
  '-moz-binding:url(https://evil.com/xbl)',
  'filter:progid:DXImageTransform.Microsoft.AlphaImageLoader(src="javascript:alert(1)")',
  'top:/**/0;background:url(javascript:alert(1))',
  'color:rgb(0,0,0);background:url(j&#x61;vascript:alert(1))',
];

// ============================================================================
// PART 1: Core XSS Protection
// ============================================================================

describe('Security: Core XSS Protection', () => {
  describe('Tag & Structure Sanitization', () => {
    it.each(BLACKLISTED_TAGS)('neutralizes dangerous tag: %s', async (input, tag) => {
      const result = (await aej.sanitize(input)).toLowerCase();
      expect(result, `Failed to block <${tag}`).not.toContain(`<${tag}`);
      expect(result).toContain('<span');
    });

    it('neutralizes multiple nested dangerous tags', async () => {
      const payload = '<div><script>alert(1)</script><iframe></iframe><form></form></div>';
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).not.toMatch(/<(script|iframe|form)/);
      expect((result.match(/<span/g) || []).length).toBe(3);
    });
  });

  describe('Attribute & Event Handler Sanitization', () => {
    it.each(EVENT_HANDLERS)('scrubs event handler: %s', async (input, attr) => {
      const result = (await aej.sanitize(input)).toLowerCase();
      expect(result).not.toContain(`${attr}=`);
      expect(result).toContain('data-unsafe-attr=');
      expect(result).toContain(attr);
    });

    it('scrubs multiple event handlers on a single element', async () => {
      const payload = '<div onclick="a()" onmouseover="b()" onmouseenter="c()"></div>';
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).not.toMatch(/\bon\w+\s*=/);
      expect(result).toContain('data-unsafe-attr="onmouseenter,onmouseover,onclick"');
    });
  });

  describe('Protocol & URL Sanitization', () => {
    it.each(DANGEROUS_PROTOCOLS)('blocks dangerous protocol: %s', async (proto) => {
      const input = `<a href="${proto}">Link</a>`;
      const result = (await aej.sanitize(input)).toLowerCase();
      expect(result).not.toContain(proto.replace(/\s+/g, ''));
      expect(result).toContain('data-unsafe-protocol:');
    });

    it('blocks protocols in various attributes', async () => {
      const attrs = ['href', 'src', 'action', 'formaction', 'data', 'poster', 'fill', 'xlink:href'];
      for (const attr of attrs) {
        expect(await aej.isUrlBlocked(attr, 'javascript:alert(1)'), `Missed ${attr}`).toBe(true);
      }
    });

    it('handles srcset protocol smuggling', async () => {
      const payload = '<img srcset="image.jpg 1x, javascript:alert(1) 2x">';
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).toContain('data-unsafe-protocol:');
      expect(result).not.toContain('javascript');
    });
  });

  describe('CSS & Style Sanitization', () => {
    it.each(DANGEROUS_CSS)('blocks dangerous CSS: %s', async (css) => {
      const input = `<div style="${css}">Test</div>`;
      const result = (await aej.sanitize(input)).toLowerCase();
      expect(result).toContain('style="data-unsafe-css:"');
      expect(result).not.toContain('javascript');
      expect(result).not.toContain('expression');
    });

    it('blocks dangerous CSS via atomCss', async () => {
      expect(await aej.isCssBlocked('background', 'url(javascript:1)')).toBe(true);
      expect(await aej.isCssBlocked('width', 'expression(1)')).toBe(true);
    });
  });
});

// ============================================================================
// PART 2: Advanced Bypass Protection
// ============================================================================

describe('Security: Advanced Bypass Protection', () => {
  describe('DOM Clobbering Prevention', () => {
    it.each([
      ['id="attributes"', '<form onmouseover=alert(1)><input id="attributes"></form>'],
      ['name="attributes"', '<form onmouseover=alert(1)><input name="attributes"></form>'],
      ['id="localName"', '<script id="localName">alert(1)</script>'],
      ['id="tagName"', '<img onerror=alert(1) id="tagName">'],
      ['name="nodeName"', '<iframe name="nodeName" src="javascript:alert(1)"></iframe>'],
      ['id="innerHTML"', '<div id="innerHTML">XSS</div>'],
      ['id="parentNode"', '<div id="parentNode">XSS</div>'],
    ])('prevents bypass via clobbered %s', async (_, payload) => {
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).not.toMatch(/<(script|iframe)/);
      expect(result).not.toContain('onerror=');
      expect(result).not.toContain('onmouseover=');
    });
  });

  describe('Recursive & Shadow Contexts', () => {
    it('sanitizes srcdoc with multiple levels of nesting', async () => {
      const payload =
        '<iframe srcdoc="&lt;iframe srcdoc=&quot;&lt;script&gt;alert(1)&lt;/script&gt;&quot;&gt;&lt;/iframe&gt;"></iframe>';
      const result = await aej.sanitize(payload);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('&lt;script');
    });

    it('sanitizes nested <template> fragments', async () => {
      const payload =
        '<template><div><template><script>alert(1)</script></template></div></template>';
      const result = await aej.sanitize(payload);
      expect(result).not.toContain('<script');
      expect(result).toContain('<span');
    });

    it('sanitizes attributes on nodes transformed from executable to safe', async () => {
      const payload =
        '<script onerror="alert(1)" src="javascript:alert(2)">console.log(1)</script>';
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('onerror=');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('data-unsafe-attr="onerror"');
      expect(result).toContain('data-unsafe-protocol:');
    });
  });

  describe('Foreign Contexts (SVG/MathML)', () => {
    it('sanitizes SVG elements and attributes including animation vectors', async () => {
      const payloads = [
        '<svg><a xlink:href="javascript:alert(1)"><rect fill="url(javascript:alert(2))" /></a></svg>',
        '<svg><set attributeName="onmouseover" to="alert(1)"/></svg>',
        '<svg><handler xmlns:ev="http://www.w3.org/2001/xml-events" ev:event="load">alert(1)</handler></svg>',
      ];
      for (const p of payloads) {
        const result = (await aej.sanitize(p)).toLowerCase();
        expect(result).not.toContain('javascript');
        expect(result).not.toContain('onmouseover');
        expect(result).not.toContain('onload');
      }
    });

    it('sanitizes MathML elements and URI attributes', async () => {
      const payload = '<math><mi xlink:href="javascript:alert(1)">x</mi></math>';
      const result = (await aej.sanitize(payload)).toLowerCase();
      expect(result).not.toContain('javascript');
    });
  });
});

// ============================================================================
// PART 3: Reactive API Integration
// ============================================================================

describe('Security: Reactive API Integration', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('atomHtml prevents dynamic updates from introducing XSS', async () => {
    const val = $.atom('<b>Safe</b>');
    const div = $('<div>').appendTo(document.body).atomHtml(val);
    expect(div.html()).toBe('<b>Safe</b>');

    val.value = '<img src=x onerror=alert(1)>';
    await $.nextTick();
    expect(div.find('img').attr('onerror')).toBeFalsy();
    expect(div.html()).toContain('data-unsafe-attr="onerror"');
  });

  it('atomAttr & atomProp guard dangerous sinks in real DOM elements', async () => {
    const div = $('<div>').appendTo(document.body);

    div.atomAttr('href', $.atom('javascript:alert(1)'));
    await $.nextTick();
    expect(div.attr('href')).toBeUndefined();

    // innerHTML is a critical sink blocked by the unified binding system
    div.atomProp('innerHTML', $.atom('<script>alert(1)</script>'));
    await $.nextTick();
    expect(div.html()).toBe('');
  });

  it('atomCss guards style properties against protocol smuggling', async () => {
    const div = $('<div>').appendTo(document.body);
    div.atomCss('background', $.atom('url(javascript:alert(1))'));
    await $.nextTick();
    expect(div[0]!.style.background).toBe('');
  });
});
