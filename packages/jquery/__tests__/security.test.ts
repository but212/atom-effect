import { atom } from '@but212/atom-effect';
import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '../src/chainable'; // Register plugins

describe('Security Sanitization (Comprehensive XSS)', () => {
  // 1. Basic Script Injection
  it('should remove basic script tags', () => {
    const div = $('<div>');
    const malicious = '<script>alert("XSS")</script>';
    const a = atom(malicious);
    div.atomHtml(a);
    expect(div.html().toLowerCase()).not.toContain('<script>');
    expect(div.html()).not.toContain('alert("XSS")');
  });

  // 2. Event Handlers
  it('should remove event handlers (on*)', () => {
    const div = $('<div>');
    // Various event handlers
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<div onmouseover="alert(1)">Hover me</div>',
      '<body onload=alert(1)>',
      '<input onfocus=alert(1) autofocus>',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      // Should sanitize event handlers
      expect(html).not.toContain('onerror=');
      expect(html).not.toContain('onmouseover=');
      expect(html).not.toContain('onload=');
      expect(html).not.toContain('onfocus=');
    });
  });

  // 3. Protocol Handlers (javascript:)
  it('should remove javascript: protocol', () => {
    const div = $('<div>');
    const vectors = [
      '<a href="javascript:alert(1)">Click me</a>',
      '<iframe src="javascript:alert(1)"></iframe>',
      '<form action="javascript:alert(1)"><button>Submit</button></form>',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      // Should sanitize javascript protocol
      expect(html).not.toContain('javascript:');
    });
  });

  // 4. Advanced/Obfuscated Attacks
  it('should handle obfuscated script tags', () => {
    const div = $('<div>');
    // Case-insensitive, whitespace variations
    const vectors = [
      '<ScRiPt>alert(1)</sCrIpT>',
      '<script\n>alert(1)</script>',
      '<script type="text/javascript">alert(1)</script>',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('<script');
    });
  });

  // 5. SVG XSS
  it('should sanitize SVG payloads', () => {
    const div = $('<div>');
    const malicious = '<svg/onload=alert(1)>';
    const a = atom(malicious);
    div.atomHtml(a);
    expect(div.html().toLowerCase()).not.toContain('onload=');
  });

  // 6. Iframe and Object
  it('should remove risky tags like iframe, object, embed', () => {
    const div = $('<div>');
    const vectors = [
      '<iframe src="http://evil.com"></iframe>',
      '<object data="http://evil.com"></object>',
      '<embed src="http://evil.com">',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('<iframe');
      expect(html).not.toContain('<object');
      expect(html).not.toContain('<embed');
    });
  });

  // 7. Base64 / Data URI
  it('should sanitize data: URIs with executable content but preserve safe ones', () => {
    const div = $('<div>');

    // Malicious vector
    const malicious =
      '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Click</a>';
    const a1 = atom(malicious);
    div.atomHtml(a1);
    expect(div.html().toLowerCase()).not.toContain('data:text/html');

    // Safe vector
    const safe =
      '<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=">';
    const a2 = atom(safe);
    div.atomHtml(a2);
    expect(div.html().toLowerCase()).toContain('data:image/png');
  });

  // 9. CSS-based Attacks
  it('should sanitize CSS-based XSS', () => {
    const div = $('<div>');
    const vectors = [
      '<div style="background:url(javascript:alert(1))">',
      '<div style="behavior:url(malicious.htc)">', // IE
      '<div style="expression(alert(1))">', // IE
      '<style>@import "http://evil.com/xss.css";</style>',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('expression(');
      expect(html).not.toContain('behavior:');
    });
  });

  // 10. Template Injection
  it('should sanitize template tags', () => {
    const div = $('<div>');
    const vectors = [
      '<template><script>alert(1)</script></template>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('<script');
      expect(html).not.toContain('onerror=');
    });
  });

  // 11. Meta/Link Redirect
  it('should remove meta refresh and dangerous links', () => {
    const div = $('<div>');
    const vectors = [
      '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">',
      '<link rel="import" href="http://evil.com/component.html">',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('<meta');
      expect(html).not.toContain('rel="import"');
    });
  });

  // 12. DOM Clobbering (Basic Mitigation)
  it('should mitigate basic DOM clobbering patterns', () => {
    const div = $('<div>');

    // Vector 1: form-based clobbering. The sanitizer removes the <form> tag.
    const formVector = '<form id="location"><input name="href" value="javascript:alert(1)"></form>';
    const a1 = atom(formVector);
    div.atomHtml(a1);
    expect(div.html().toLowerCase()).not.toContain('<form');

    // Vector 2: name-based clobbering. This is a known limitation of regex-based sanitizers
    // and is not expected to be caught. The test confirms the sanitizer does not act on it.
    const imgVector = '<img name="createElement">';
    const a2 = atom(imgVector);
    div.atomHtml(a2);
    expect(div.html().toLowerCase()).toContain('<img name="createelement">');
  });

  // 13. Null Byte / Unicode Bypass
  it('should handle null byte and unicode bypass attempts', () => {
    const div = $('<div>');
    const vectors = [
      '<scr\x00ipt>alert(1)</script>',
      '<a href="java\u0000script:alert(1)">',
      '<img src="\u0001javascript:alert(1)">', // Control char
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('javascript:');
      expect(html).not.toContain('<script');
    });
  });

  // 14. VBScript
  it('should block vbscript protocol', () => {
    const div = $('<div>');
    const malicious = '<a href="vbscript:msgbox(1)">Click</a>';
    const a = atom(malicious);
    div.atomHtml(a);
    expect(div.html().toLowerCase()).not.toContain('vbscript:');
  });

  // 15. srcset / poster
  it('should sanitize srcset and poster attributes', () => {
    const div = $('<div>');
    const vectors = [
      '<img srcset="javascript:alert(1)">',
      '<video poster="javascript:alert(1)">',
      '<source src="javascript:alert(1)">',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      expect(html).not.toContain('javascript:');
    });
  });

  // 16. Double Encoding
  it('should handle double encoding', () => {
    const div = $('<div>');
    const vectors = [
      '<a href="javascript&#58;alert(1)">',
      '<a href="javascript%3Aalert(1)">',
      '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">',
    ];

    vectors.forEach((malicious) => {
      const a = atom(malicious);
      div.atomHtml(a);
      const html = div.html().toLowerCase();
      // Browser decodes entities/percent encoding in attributes.
      // Our sanitizer works on string, so it might miss these unless we decode first.
      // This test confirms if current approach fails or succeeds.
      expect(html).not.toContain('javascript:');
    });
  });
});
