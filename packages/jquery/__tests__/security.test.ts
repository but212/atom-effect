import { atom, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../src/chainable'; // Register plugins
import '../src/unified'; // Register atomBind plugin
import '../src/list'; // Register atomList plugin
import { registry } from '../src/registry';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '../src/utils';

// ============================================================================
// PART 1: Unit Tests (Core Logic)
// Validate the sanitization/security logic in isolation.
// ============================================================================

describe('Unit: sanitizeHtml (Core Logic)', () => {
  // 1. Script Injection
  it('should remove script tags', () => {
    expect(sanitizeHtml('<script>alert("XSS")</script>')).not.toContain('<script');
    expect(sanitizeHtml('<ScRiPt>alert(1)</sCrIpT>')).not.toContain('<script');
    expect(sanitizeHtml('<script\n>alert(1)</script>')).not.toContain('<script');
  });

  // 2. Event Handlers
  it('should neutralize event handlers (on*)', () => {
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<div onmouseover="alert(1)">Hover me</div>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toContain('onerror=');
      expect(safe).not.toContain('onmouseover=');
      // Regex neutralizes to data-unsafe-attr check, doesn't remove payload
      expect(safe).toContain('data-unsafe-attr=');
    });
  });

  // 3. Protocol Handlers
  it('should neutralize dangerous protocols', () => {
    const vectors = [
      '<a href="javascript:alert(1)">',
      '<a href="vbscript:msgbox(1)">',
      '<a href="java\u0000script:alert(1)">', // Null byte
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toContain('javascript:');
      expect(safe).not.toContain('vbscript:');
      // Regex neutralizes to data-unsafe-protocol check
      expect(safe).toContain('data-unsafe-protocol:');
    });
  });

  // 4. Risky Tags
  it('should remove risky tags (iframe, object, embed, meta, link)', () => {
    const vectors = [
      '<iframe src="http://evil.com"></iframe>',
      '<object data="http://evil.com"></object>',
      '<embed src="http://evil.com">',
      '<meta http-equiv="refresh">',
      '<link rel="stylesheet" href="http://evil.com/style.css">',
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(/<(iframe|object|embed|meta|link)/);
    });
  });

  it('should allow practical tags (template) but remove form/style in strict mode', () => {
    // Current implementation removes forms for safety
    expect(sanitizeHtml('<form action="/submit"><input></form>')).not.toContain('<form');
    expect(sanitizeHtml('<style>.red { color: red }</style>')).not.toContain('<style');
    expect(sanitizeHtml('<template><div>tmpl</div></template>')).toContain('<template');
  });

  // 5. SVG / MathML (Allowed tags, sanitized attributes)
  it('should preserve SVG/Math but neutralize handlers', () => {
    expect(sanitizeHtml('<svg><circle r="10"/></svg>')).toContain('<svg');
    const maliciousSvg = sanitizeHtml('<svg/onload=alert(1)>');
    expect(maliciousSvg).toContain('<svg');
    expect(maliciousSvg).not.toContain('onload=');
  });

  // 6. Data URIs
  it('should block dangerous data URIs but allow simple images', () => {
    const bad = [
      '<a href="data:text/html;base64,PHNjcmlwdD4=">',
      '<a href="data:application/xml;base64,...">',
      '<a href="data:application/x-shockwave-flash;base64,...">',
      // SVG in data URI is unsafe because it can execute scripts
      '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    ];

    bad.forEach((v) => {
      expect(sanitizeHtml(v)).toContain('data-unsafe-protocol:');
    });

    const good = sanitizeHtml('<img src="data:image/png;base64,iVBOR...">');
    expect(good).toContain('data:image/png');
  });

  // 7. CSS/Style Attacks
  it('should sanitize CSS expressions and behavior', () => {
    // Re-enabled as we restored regex-based CSS sanitization within style attributes
    const v =
      '<div style="background:url(javascript:alert(1)); behavior:url(x.htc); expression(alert(1))">';
    const safe = sanitizeHtml(v).toLowerCase();
    expect(safe).not.toContain('javascript:');
    expect(safe).not.toContain('behavior:');
    expect(safe).not.toContain('expression(');
  });

  // 8. Bypass Attempts
  it('should handle bypass attempts (nested tags, null bytes)', () => {
    expect(sanitizeHtml('<scr<script>ipt>alert(1)</script>')).not.toContain('<script');
    expect(sanitizeHtml('<scr\x00ipt>alert(1)</script>')).not.toContain('<script');
  });

  // 9. Null / invalid input
  it('should return empty string for null input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
  });
});

describe('Unit: isDangerousUrl', () => {
  it('should identify dangerous protocols in URL attributes', () => {
    expect(isDangerousUrl('href', 'javascript:alert(1)')).toBe(true);
    expect(isDangerousUrl('src', 'vbscript:alert(1)')).toBe(true);
    expect(isDangerousUrl('action', 'JAVASCRIPT:alert(1)')).toBe(true);
  });

  it('should allow safe URLs', () => {
    expect(isDangerousUrl('href', 'https://example.com')).toBe(false);
    expect(isDangerousUrl('href', '/login')).toBe(false);
    expect(isDangerousUrl('src', 'data:image/png;...')).toBe(false); // isDangerousUrl only checks protocol scheme start
    expect(isDangerousUrl('href', 'mailto:user@example.com')).toBe(false);
  });

  it('should detect protocols with extra whitespace', () => {
    expect(isDangerousUrl('href', '  javascript  :  alert(1)  ')).toBe(true);
  });

  it('should checking ignore non-URL attributes', () => {
    expect(isDangerousUrl('title', 'javascript:foo')).toBe(false);
  });
});

describe('Unit: isDangerousCssValue', () => {
  it('should identify dangerous protocols in url()', () => {
    expect(isDangerousCssValue('url(javascript:alert(1))')).toBe(true);
    expect(isDangerousCssValue("url('vbscript:alert(1)')")).toBe(true);
    expect(isDangerousCssValue('  url(  javascript: )')).toBe(true);
  });

  it('should allow safe css values', () => {
    expect(isDangerousCssValue('red')).toBe(false);
    expect(isDangerousCssValue('url(https://example.com/bg.png)')).toBe(false);
    expect(isDangerousCssValue('url(data:image/png;base64,...)')).toBe(false);
  });
});

// ============================================================================
// PART 2: Integration Tests (Wiring)
// Verify that chainable methods and bindings actually USE the core logic.
// ============================================================================

describe('Integration: Security Wiring', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  // 1. atomHtml
  it('atomHtml -> should use sanitizeHtml', () => {
    const div = $('<div>');
    // We already tested specific vectors in Unit. Just verify the wiring filters a script tag.
    div.atomHtml(atom('<script>alert("Wiring")</script>'));
    expect(div.html()).not.toContain('<script');
  });

  // 2. atomList
  it('atomList -> should use sanitizeHtml for items', () => {
    const div = $('<div>');
    const items = atom([{ html: '<script>alert("List")</script>' }]);
    div.atomList(items, {
      key: (_i, idx) => idx,
      render: (i) => i.html,
    });
    expect(div.html()).not.toContain('<script');
  });

  // 3. atomAttr
  it('atomAttr -> should block dangerous URLs via isDangerousUrl', () => {
    const a = $('<a>');
    a.atomAttr('href', atom('javascript:alert(1)'));
    expect(a.attr('href')).toBeUndefined();
  });

  it('atomAttr -> should block on* event handlers', () => {
    const div = $('<div>');
    div.atomAttr('onclick', atom('alert(1)'));
    expect(div.attr('onclick')).toBeUndefined();
  });

  // 4. atomCss
  it('atomCss -> should block dangerous CSS values via isDangerousCssValue', () => {
    const div = $('<div>');
    div.atomCss('background-image', atom('url(javascript:alert(1))'));
    expect(div.css('background-image')).toBe('');
  });

  // 5. atomProp
  it('atomProp -> should block innerHTML/outerHTML injection', () => {
    const div = $('<div>');
    div.atomProp('innerHTML', atom('<b>Bold</b>'));
    expect(div.html()).toBe('');
  });

  // 6. atomBind (Unified)
  it('atomBind -> should enforce security policies across all bindings', () => {
    const div = $('<div>');
    div.atomBind({
      html: atom('<script>'), // Should be sanitized
      attr: { href: atom('javascript:') }, // Should be blocked
      css: { background: atom('url(javascript:)') }, // Should be blocked
      prop: { innerHTML: atom('') }, // Should be blocked
    });

    expect(div.html()).not.toContain('<script');
    expect(div.attr('href')).toBeUndefined();
    expect(div.css('background-image')).toBe('');
    expect(div.html()).toBe('');
  });
});

// ============================================================================
// PART 3: Practicality & Policy (Allowed Items)
// Verify that the strict security rules do not break common legitimate UIs.
// ============================================================================

describe('Policy: Allowed / Practicality', () => {
  // 1. SVG Icons
  it('should allow inline SVG icons (common UI pattern)', () => {
    const div = $('<div>');
    const svgIcon = '<svg class="feather"><circle cx="12" cy="7" r="4"></circle></svg>';
    div.atomHtml(atom(svgIcon));
    expect(div.html().toLowerCase()).toContain('<svg');
    expect(div.find('circle').length).toBe(1);
  });

  // 2. Data URIs
  it('should allow data URIs for images in atomHtml & atomCss', () => {
    const div = $('<div>');
    const imgTag =
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=">';

    div.atomHtml(atom(imgTag));
    expect(div.find('img').length).toBe(1);

    const bg = atom(
      'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)'
    );
    div.atomCss('background-image', bg);
    expect(div[0]!.style.backgroundImage).toContain('data:image/png');
  });

  // 3. Relative URLs
  it('should allow relative URLs (SPA navigation)', () => {
    const a = $('<a>');
    a.atomAttr('href', atom('/dashboard?q=1'));
    expect(a.attr('href')).toBe('/dashboard?q=1');
  });

  // 4. Escape Hatch
  it('should ALLOW unsafe content via raw effect (Escape Hatch)', () => {
    const div = $('<div>');
    const iframe = '<iframe src="https://example.com"></iframe>';

    // User explicitly opts out of safety by using raw effect + jquery html()
    const fx = effect(() => {
      div.html(iframe);
    });
    registry.trackEffect(div[0]!, fx);

    expect(div.find('iframe').length).toBe(1);
  });
});
