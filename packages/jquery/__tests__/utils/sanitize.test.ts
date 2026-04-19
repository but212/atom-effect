import { atom } from '@but212/atom-effect';
import { afterEach, describe, expect, it } from 'vitest';
import $ from '@/index';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// PART 1: Unit Tests (Core Logic)
// Validation of the sanitization engine's internal mechanisms.
// ============================================================================

describe('Unit: sanitizeHtml (Core Logic)', () => {
  it('strips dangerous tags and handles reassembly/null', () => {
    const vectors = [
      '<script>alert(1)</script>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<meta http-equiv="refresh">',
      '<base href="https://evil.com/">',
      '<style>.red{color:red}</style>',
    ];
    for (const v of vectors) {
      const result = sanitizeHtml(v).toLowerCase();
      expect(result).not.toMatch(/<(script|iframe|meta|base|form|style|link)\b/);
    }

    // Null safety
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });

  it('neutralizes on* event handlers and tracks all scrubbed attributes', () => {
    const vectors = [
      {
        input: '<img onerror=alert(1)>',
        expected: 'data-unsafe-attr="onerror"',
      },
      {
        input: '<div title="iron" onclick="alert(1)">',
        expected: 'data-unsafe-attr="onclick"',
      },
      {
        input: '<a onload\n=alert(1)>',
        expected: 'data-unsafe-attr="onload"',
      },
      {
        input: '<div onclick="a()" onmouseover="b()"></div>',
        expected: 'data-unsafe-attr="onmouseover,onclick"', // Implementation processes in reverse
      },
    ];

    for (const { input, expected } of vectors) {
      const result = sanitizeHtml(input).toLowerCase();
      expect(result).not.toMatch(/\bon\w+\s*=/);
      expect(result).toContain(expected);
    }
  });

  it('neutralizes dangerous protocols (javascript, vbscript, data)', () => {
    const vectors = [
      '<a href="javascript:alert(1)">',
      '<a href="vbscript:msgbox(1)">',
      '<a href="j a v a s c r i p t :alert(1)">', // Whitespace split
      '<a href="&#106;avascript:alert(1)">', // Entity decimal encoding
      '<a href="&#x6A;avascript:alert(1)">', // Entity hex encoding
      '<a href="j&#1;avascript:alert(1)">', // Control character smuggling
      '<a href="javascript&colon;alert(1)">', // Named entity
      '<a href="j&tab;avascript:alert(1)">', // Regression: semicolon-less entity
      '<a href="j&NewLine;avascript:alert(1)">', // Regression: expanded entity set
      '<img srcset="image.jpg 1x, javascript:alert(1) 2x">', // Regression: srcset smuggling
      '<a href="data:text/html,xss">', // Dangerous data URI
      '&#999999999;', // DoS (RangeError) protection
    ];

    for (const v of vectors) {
      const result = sanitizeHtml(v).toLowerCase();
      expect(result, `Failed to block: ${v}`).not.toMatch(/(javascript|vbscript|data)\s*:/);
      if (v.includes('javascript') || v.includes('vbscript') || v.includes('data:text')) {
        expect(result).toContain('data-unsafe-protocol:');
      }
    }

    // Valid data URIs should be preserved
    expect(sanitizeHtml('<img src="data:image/png;...">')).toContain('data:image/png');
  });

  it('neutralizes dangerous CSS (expression, behavior, url protocols)', () => {
    const vectors = [
      'background:url(javascript:alert(1))',
      'background:url(vbscript:alert(1))',
      'background:url(&#106;avascript:alert(1))',
      'width:expression(alert(1))',
      'behavior:url(#default#VML)',
      '-moz-binding:url(https://evil.com/xbl)',
    ];
    for (const v of vectors) {
      const result = sanitizeHtml(`<div style="${v}">`).toLowerCase();
      expect(result).not.toMatch(/(javascript|vbscript|expression|behavior|binding)\s*[:(]/);
      expect(result).toContain('data-unsafe-css:');
    }
  });
});

describe('Unit: Validation Helpers', () => {
  it('isDangerousUrl detects smuggled or unsupported protocols', () => {
    const dangerous = [
      'javascript:alert(1)',
      'vbscript:alert(1)',
      'j a v a s c r i p t :alert(1)',
      '&#106;avascript:alert(1)',
      'data:text/html,xss',
      'url(javascript:alert(1))', // SVG context
    ];
    for (const v of dangerous) {
      expect(isDangerousUrl('href', v)).toBe(true);
      expect(isDangerousUrl('fill', v)).toBe(true);
    }

    // Safe values
    expect(isDangerousUrl('href', 'https://example.com')).toBe(false);
    expect(isDangerousUrl('title', 'javascript:alert(1)')).toBe(false); // Non-URL attr
  });

  it('isDangerousCssValue detects protocols and keywords', () => {
    const dangerous = [
      'url(javascript:1)',
      'url(vbscript:1)',
      'url(&#106;avascript:1)',
      'expression(1)',
      'behavior:url(#)',
    ];
    for (const v of dangerous) {
      expect(isDangerousCssValue(v)).toBe(true);
    }

    expect(isDangerousCssValue('color: red')).toBe(false);
    expect(isDangerousCssValue('url("https://safe.com")')).toBe(false);
  });
});

// ============================================================================
// PART 2: API Integration Tests
// Verification of reactive bindings and high-level XSS guards.
// ============================================================================

describe('API Integration: XSS Guards', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  const XSS_HTML = '<script>alert(1)</script><img src=x onerror=alert(1)>';

  it('atomHtml applies sanitization on initial mount and updates', async () => {
    const val = atom(XSS_HTML);
    const div = $('<div>').appendTo(document.body).atomHtml(val);

    expect(div.find('script').length).toBe(0);
    expect(div.find('img').attr('onerror')).toBeFalsy();

    val.value = '<iframe src="javascript:alert(1)">';
    await $.nextTick();
    expect(div.find('iframe').length).toBe(0);
  });

  it('atomAttr & atomProp guard dangerous sinks', () => {
    const div = $('<div>').appendTo(document.body);

    div.atomAttr('href', atom('javascript:alert(1)'));
    expect(div.attr('href')).toBeUndefined();

    div.atomProp('innerHTML', atom(XSS_HTML));
    expect(div.html()).toBe('');
  });

  it('atomCss guards style properties', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomCss('background', atom('url(javascript:alert(1))'));
    expect(div[0]!.style.background).toBe('');
  });
});

// ============================================================================
// PART 3: Security Regressions (Anti-Bypass)
// Critical tests for DOM Clobbering, recursion, and re-entrancy.
// ============================================================================

describe('Security: Anti-Bypass & Regressions', () => {
  describe('DOM Clobbering & Shadowing Protection', () => {
    it('prevents bypass via clobbered "attributes" property', () => {
      const payload = '<form onmouseover="alert(1)"><input name="attributes"></form>';
      const result = sanitizeHtml(payload);
      expect(result).not.toMatch(/\bonmouseover\s*=/i);
      expect(result).toContain('data-unsafe-attr="onmouseover"');
    });

    it('prevents bypass via clobbered "localName"', () => {
      const payload = '<script id="localName">alert(1)</script>';
      const result = sanitizeHtml(payload).toLowerCase();
      expect(result).not.toContain('<script');
      expect(result).toMatch(/<span\b/);
    });

    it('prevents bypass via clobbered "setAttribute"', () => {
      const payload = '<img onerror="alert(1)" name="setAttribute">';
      expect(() => sanitizeHtml(payload)).not.toThrow();
      expect(sanitizeHtml(payload).toLowerCase()).not.toContain('onerror=');
    });

    it('prevents bypass/DoS via clobbered "removeAttribute"', () => {
      const payload = '<form onmouseover="alert(1)"><input name="removeAttribute"></form>';
      expect(() => sanitizeHtml(payload)).not.toThrow();
      expect(sanitizeHtml(payload).toLowerCase()).not.toContain('onmouseover=');
    });

    it('prevents infinite loop/bypass via clobbered "firstChild"', () => {
      const payload = '<script id="firstChild">alert(1)</script>';
      const result = sanitizeHtml(payload).toLowerCase();
      expect(result).not.toContain('<script');
      expect(result).toContain('alert(1)');
    });
  });

  describe('Nested Contexts & Recursion', () => {
    it('recursively sanitizes <template> content', () => {
      const payload = '<template><script>alert(1)</script><img src=x onerror=alert(1)></template>';
      const result = sanitizeHtml(payload);
      expect(result).not.toContain('<script');
      expect(result).not.toContain('onerror=');
      expect(result).toContain('data-unsafe-attr="onerror"');
    });

    it('recursively sanitizes srcdoc content', () => {
      const payload = '<iframe srcdoc="<script>alert(1)</script><b>Hello</b>"></iframe>';
      const result = sanitizeHtml(payload);
      expect(result).toContain('srcdoc="');
      expect(result).toContain('&lt;b&gt;Hello&lt;/b&gt;'); // Encoded in attr
      expect(result).not.toContain('&lt;script');
    });

    it('detects dangerous data: URIs in srcdoc via isDangerousUrl', () => {
      // Regression: srcdoc sniffer must include data: protocols
      expect(isDangerousUrl('srcdoc', 'data:text/html,xss')).toBe(true);
      expect(isDangerousUrl('srcdoc', 'data:application/javascript,xss')).toBe(true);
    });

    it('supports re-entrant sanitization calls', () => {
      const payload =
        '<div id="outer"><iframe srcdoc="<div id=\'inner\'></div>"></iframe><p>Keep</p></div>';
      const result = sanitizeHtml(payload);
      expect(result).toContain('id="outer"');
      expect(result).toContain('id=&quot;inner&quot;');
      expect(result).toContain('<p>Keep</p>');
    });

    it('neutralizes attributes on transformed nodes (e.g., script to span)', () => {
      // Issue 1: attributes from blacklisted tags are copied but might skip security policy
      const payload =
        '<script onerror="alert(1)" src="javascript:alert(2)">console.log(1)</script>';
      const sanitized = sanitizeHtml(payload).toLowerCase();
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).not.toContain('javascript:');
      expect(sanitized).toContain('data-unsafe-attr="onerror"');
      expect(sanitized).toContain('data-unsafe-protocol:');
    });

    it('scrubs dangerous attributes on the template tag itself', () => {
      // Issue 3: <template> tag attributes should also be sanitized
      const payload = '<template onload="alert(1)"><b>content</b></template>';
      const sanitized = sanitizeHtml(payload).toLowerCase();
      expect(sanitized).not.toContain('onload=');
      expect(sanitized).toContain('data-unsafe-attr="onload"');
    });

    it('normalizes safe parts in srcset to prevent entity-encoded obfuscation', () => {
      // Issue 4: if return original part, it will contain &colon;
      const payload = '<img srcset="image.jpg?&colon;test 1x">';
      const sanitized = sanitizeHtml(payload).toLowerCase();
      // expect it to be decoded by OUR normalizeValue logic and returned
      expect(sanitized).toContain('image.jpg?:test');
      expect(sanitized).not.toContain('&colon;');
    });
    it('synchronizes sniffer regex with current blacklist and protocols', () => {
      // Issue 5: REGEX_DANGEROUS_SNIFFER must block all blacklisted tags and protocols
      const blacklist = ['script', 'iframe', 'base', 'form'];
      for (const tag of blacklist) {
        expect(isDangerousUrl('srcdoc', `<${tag}>`), `Sniffer missed tag: ${tag}`).toBe(true);
      }
      expect(isDangerousUrl('srcdoc', 'javascript:alert(1)')).toBe(true);
      expect(isDangerousUrl('srcdoc', 'onerror=alert(1)')).toBe(true);
    });
  });
});
