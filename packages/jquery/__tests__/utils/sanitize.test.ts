import { atom } from '@but212/atom-effect';
import { afterEach, describe, expect, it } from 'vitest';
import $ from '@/index';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// PART 1: Unit Tests (The "Brains")
// Focused validation of defense mechanisms.
// ============================================================================

describe('Unit: sanitizeHtml (Core Logic)', () => {
  it('strips dangerous tags and handles reassembly/XML/null', () => {
    const vectors = [
      '<script>alert(1)</script>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<meta http-equiv="refresh">',
      '<base href="https://evil.com/">',
      '<style>.red{color:red}</style>',
    ];
    vectors.forEach((v) => {
      const result = sanitizeHtml(v).toLowerCase();
      expect(result).not.toMatch(/<(script|iframe|meta|base|form|style|link)\b/);
    });

    // Null safety
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });

  it('neutralizes on* event handlers (including fast-path bypasses)', () => {
    const vectors = [
      '<img onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<div title="iron" onclick="alert(1)">', // Regression: iron-pattern fast-path bypass
      '<a onload\n=alert(1)>', // Whitespace/Newline after attribute name
    ];
    vectors.forEach((v) => {
      const result = sanitizeHtml(v).toLowerCase();
      expect(result).not.toMatch(/\bon\w+\s*=/);
      expect(result).toContain('data-unsafe-attr=');
    });
  });

  it('neutralizes dangerous protocols (javascript, vbscript, data)', () => {
    // Vectors cover: standard, whitespace, entity-encoding, control characters, and data URIs
    const vectors = [
      '<a href="javascript:alert(1)">',
      '<a href="vbscript:msgbox(1)">',
      '<a href="j a v a s c r i p t :alert(1)">', // Whitespace split
      '<a href="&#106;avascript:alert(1)">', // Entity decimal encoding
      '<a href="&#x6A;avascript:alert(1)">', // Entity hex encoding
      '<a href="j&#1;avascript:alert(1)">', // Control character smuggling
      '<a href="javascript&colon;alert(1)">', // Named entity
      '<img srcset="javascript:alert(1) 2x">', // srcset specific pattern
      '<a href="data:text/html,xss">', // Dangerous data URI
      '&#999999999;', // DoS (RangeError) protection
    ];
    vectors.forEach((v) => {
      const result = sanitizeHtml(v).toLowerCase();
      // Verify protocol is either replaced or stripped of its dangerous part
      expect(result).not.toMatch(/(javascript|vbscript|data)\s*:/);
    });

    // Valid data URIs should be preserved
    expect(sanitizeHtml('<img src="data:image/png;...">')).toContain('data:image/png');
  });

  describe('Vulnerability Regression (Red Phase)', () => {
    it('blocks case-sensitive and semicolon-less named entities in protocols', () => {
      const bypasses = [
        '<a href="j&tab;avascript:alert(1)">',
        '<a href="j&Tab;avascript:alert(1)">',
        '<a href="javascript&colon alert(1)">',
        '<a href="j&Tab avascript:alert(1)">',
      ];
      bypasses.forEach((v) => {
        const result = sanitizeHtml(v).toLowerCase();
        expect(result, `Failed to block: ${v}`).not.toContain('javascript:');
        expect(result).toContain('data-unsafe-protocol:');
      });
    });

    it('blocks HTML injection in srcdoc attribute via bindAttr', () => {
      // srcdoc is a dangerous sink that must be neutralized
      expect(isDangerousUrl('srcdoc', '<script>alert(1)</script>')).toBe(true);
      // Case: on* handlers in srcdoc
      expect(isDangerousUrl('srcdoc', '<img src=x onerror=alert(1)>')).toBe(true);
      // Case: dangerous protocols in srcdoc
      expect(isDangerousUrl('srcdoc', '<a href="javascript:alert(1)">click</a>')).toBe(true);
    });

    it('blocks dangerous protocols in SVG attributes using url()', () => {
      const vectors = [
        'url(javascript:alert(1))',
        'url( vbscript:alert(1) )',
        'url("javascript:alert(1)")',
      ];
      vectors.forEach((v) => {
        expect(isDangerousUrl('fill', v), `Failed to detect dangerous URL in fill: ${v}`).toBe(
          true
        );
      });
    });
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
    vectors.forEach((v) => {
      const result = sanitizeHtml(`<div style="${v}">`).toLowerCase();
      expect(result).not.toMatch(/(javascript|vbscript|expression|behavior|binding)\s*[:(]/);
      expect(result).toContain('data-unsafe-css:');
    });
  });
});

describe('Unit: Protocol Validation Helpers', () => {
  it('isDangerousUrl detects smuggled or unsupported protocols', () => {
    const dangerous = [
      'javascript:alert(1)',
      'vbscript:alert(1)',
      'j a v a s c r i p t :alert(1)',
      '&#106;avascript:alert(1)',
      'data:text/html,xss',
    ];
    dangerous.forEach((v) => {
      expect(isDangerousUrl('href', v)).toBe(true);
    });

    // SVG attributes
    expect(isDangerousUrl('fill', 'javascript:alert(1)')).toBe(true);

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
    dangerous.forEach((v) => {
      expect(isDangerousCssValue(v)).toBe(true);
    });

    expect(isDangerousCssValue('color: red')).toBe(false);
    expect(isDangerousCssValue('url("https://safe.com")')).toBe(false);
  });
});

// ============================================================================
// PART 2: API Integration Tests (The "Plumbing")
// High-signal interaction verification.
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

  describe('Vulnerability Regression: DOM Clobbering & Template Shadowing', () => {
    it('prevents DOM Clobbering of "attributes" property', () => {
      const payload = '<form onmouseover="alert(\'XSS\')"><input name="attributes"></form>';
      const sanitized = sanitizeHtml(payload);
      // If clobbered, sanitizeHtml would miss 'onmouseover' because el.attributes returns the input element, length is undefined.
      expect(sanitized).not.toMatch(/\bonmouseover\s*=/i);
      expect(sanitized).toContain('data-unsafe-attr="onmouseover"');
    });

    it('recursively sanitizes <template> content', () => {
      const payload =
        '<template><script>alert(\'XSS\')</script><img src="x" onerror="alert(\'XSS\')"></template>';
      const sanitized = sanitizeHtml(payload);
      // querySelectorAll('*') and DANGEROUS_TAGS_SELECTOR miss template content.
      expect(sanitized).not.toContain('<script');
      expect(sanitized).not.toContain('onerror=');
      expect(sanitized).toContain('data-unsafe-attr="onerror"');
    });

    it('prevents DoS via DOM Clobbering of "removeAttribute"', () => {
      const payload = '<form onmouseover="alert(1)"><input name="removeAttribute"></form>';
      // Should not throw TypeError: el.removeAttribute is not a function
      expect(() => sanitizeHtml(payload)).not.toThrow();
      const sanitized = sanitizeHtml(payload);
      expect(sanitized).not.toMatch(/\bonmouseover\s*=/i);
    });

    it('blocks dangerous content in srcdoc even with entity encoding', () => {
      // srcdoc is often used to bypass simple filters
      const payload = '<iframe srcdoc="&lt;script&gt;alert(1)&lt;/script&gt;"></iframe>';
      const sanitized = sanitizeHtml(payload);
      expect(sanitized).toContain('data-unsafe-protocol:');
    });
  });
});
