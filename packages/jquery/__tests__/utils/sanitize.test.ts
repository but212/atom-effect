import { atom, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { afterEach, describe, expect, it } from 'vitest';
import '@/index'; // Register all plugins including $.nextTick
import { registry } from '@/core/registry';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// PART 1: Unit Tests (The "Brains")
// Strict validation of the logic itself.
// ============================================================================

describe('Unit: sanitizeHtml (Core Logic)', () => {
  it('strips dangerous tags and preserves safe ones', () => {
    const vectors = [
      '<script>alert(1)</script>',
      '<iframe src="http://evil.com"></iframe>',
      '<meta http-equiv="refresh">',
      '<base href="https://evil.com/">',
      '<form action="/submit"></form>',
      '<style>.red{color:red}</style>',
    ];
    vectors.forEach((v) => {
      expect(sanitizeHtml(v).toLowerCase()).not.toMatch(/<(script|iframe|meta|base|form|style)/);
    });

    // Boundary conditions
    expect(sanitizeHtml('<template><b>ok</b></template>')).toContain('<template');
    expect(sanitizeHtml('<scr<script>ipt>alert(1)</script>')).not.toContain('<script');
  });

  it('neutralizes on* handlers (handling fast-path bypasses)', () => {
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<svg onload=alert(1)>',
      '<div title="iron" onclick="alert(1)">', // Regression: iron bug
      '<img src=x onerror\n=alert(1)>', // Whitespace handling
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(/\bon\w+\s*=/);
      expect(safe).toContain('data-unsafe-attr=');
    });
  });

  it('neutralizes protocols (handling order-bypass & encoding)', () => {
    const vectors = [
      '<a href="javascript:alert(1)">',
      '<a href="j a v a s c r i p t :alert(1)">', // Whitespace split
      '<a href="&#106;avascript:alert(1)">', // Entity encoding
      '<a href="j&#1;avascript:alert(1)">', // Regression: control char bypass
      '<a href="javascript&colon;alert(1)">', // Named entity
      '<img srcset="javascript:alert(1) 2x">', // srcset special case
    ];
    vectors.forEach((v) => {
      expect(sanitizeHtml(v).toLowerCase()).not.toMatch(/javascript\s*:/);
    });
  });

  it('filters data URIs and CSS safely', () => {
    // Data URI
    expect(sanitizeHtml('<a href="data:text/html;...">')).toContain('data-unsafe-protocol:');
    expect(sanitizeHtml('<img src="data:image/png;...">')).toContain('data:image/png');

    // CSS
    const css = '<div style="background:url(javascript:alert(1)); width:expression(alert(1))">';
    const safe = sanitizeHtml(css).toLowerCase();
    expect(safe).not.toContain('javascript:');
    expect(safe).not.toContain('expression(');
  });

  it('handles edge cases (null, SVG, XML)', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml('<?xml version="1.0"?>')).toBe('');
    expect(sanitizeHtml('<svg><script></script><circle/></svg>')).not.toContain('<script');
  });
});

describe('Unit: Protocol Validation Helpers', () => {
  it('isDangerousUrl: detects smuggled protocols in specific attributes', () => {
    expect(isDangerousUrl('href', 'javascript:alert(1)')).toBe(true);
    expect(isDangerousUrl('href', 'j a v a s c r i p t :alert(1)')).toBe(true); // Robustness
    expect(isDangerousUrl('fill', 'javascript:alert(1)')).toBe(true); // SVG Support

    expect(isDangerousUrl('href', 'https://example.com')).toBe(false);
    expect(isDangerousUrl('title', 'javascript:alert(1)')).toBe(false); // Non-URL attr
  });

  it('isDangerousCssValue: detects url() smuggling', () => {
    expect(isDangerousCssValue('url(javascript:alert(1))')).toBe(true);
    expect(isDangerousCssValue('url("https://safe.com")')).toBe(false);
  });
});

// ============================================================================
// PART 2: API Integration Tests (The "Plumbing")
// Ensure reactive methods actually USE the sanitizer.
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

    // atomAttr
    div.atomAttr('href', atom('javascript:alert(1)'));
    expect(div.attr('href')).toBeUndefined();

    // atomProp (DANGEROUS_PROPS)
    div.atomProp('innerHTML', atom(XSS_HTML));
    expect(div.html()).toBe('');
  });

  it('atomCss guards style properties', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomCss('background', atom('url(javascript:alert(1))'));
    expect(div[0]!.style.background).toBe('');
  });

  it('atomList sanitizes rendered strings and empty templates', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomList(atom([{ id: 1 }]), {
      key: (i) => i.id,
      render: () => XSS_HTML,
      empty: XSS_HTML,
    });
    expect(div.find('script').length).toBe(0);
  });
});

describe('Policy: Practicality & Exceptions', () => {
  it('allows safe interactive content', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<svg><circle/></svg><img src="data:image/png;base64,123">'));
    expect(div.find('svg, img').length).toBe(2);
  });

  it('provides an escape hatch via raw effects', () => {
    const div = $('<div>');
    const fx = effect(() => {
      div.html('<script id="trusted"></script>');
    });
    registry.trackEffect(div[0]!, fx);
    expect(div.find('#trusted').length).toBe(1);
  });
});
