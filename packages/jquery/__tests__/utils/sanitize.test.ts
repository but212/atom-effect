import { atom, effect } from '@but212/atom-effect';
import $ from 'jquery';
import { afterEach, describe, expect, it } from 'vitest';
import '@/index'; // Register all plugins including $.nextTick
import { registry } from '@/core/registry';
import { isDangerousCssValue, isDangerousUrl, sanitizeHtml } from '@/utils/sanitize';

// ============================================================================
// PART 1: Unit Tests sanitizeHtml core logic
// One test per distinct defense mechanism. Vectors within a test share the
// same code path; distinct mechanisms get their own test.
// ============================================================================

describe('Unit: sanitizeHtml (Core Logic)', () => {
  it('strips dangerous tags (script, iframe, object, embed, meta, link, base, applet, noscript, form, style)', () => {
    const tags = [
      '<script>alert(1)</script>',
      '<ScRiPt>alert(1)</sCrIpT>',
      '<script\n>alert(1)</script>',
      '<iframe src="http://evil.com"></iframe>',
      '<object data="http://evil.com"></object>',
      '<embed src="http://evil.com">',
      '<meta http-equiv="refresh">',
      '<link rel="stylesheet" href="http://evil.com/style.css">',
      '<base href="https://evil.com/">',
      '<applet code="evil.class"></applet>',
      '<noscript><img src=x onerror=alert(1)></noscript>',
      '<form action="/submit"><input></form>',
      '<style>.red{color:red}</style>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
    ];
    tags.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(
        /<(script|iframe|object|embed|meta|link|base|applet|noscript|form|style)/
      );
    });
    // template is allowed
    expect(sanitizeHtml('<template><div>ok</div></template>')).toContain('<template');
    // base tag stripped but sibling content survives
    expect(sanitizeHtml('<base href="https://evil.com/"><a href="/login">Login</a>')).toContain(
      '/login'
    );
  });

  it('neutralizes on* event handler attributes (any case, newline before =)', () => {
    const vectors = [
      '<img src=x onerror=alert(1)>',
      '<div onmouseover="alert(1)">x</div>',
      '<input onfocus=alert(1) autofocus>',
      '<img src=x OnErRoR=alert(1)>',
      '<img src=x onerror\n=alert(1)>',
      '<svg onload=alert(1)>',
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(/\bon\w+\s*=/);
      expect(safe).toContain('data-unsafe-attr=');
    });
  });

  it('neutralizes dangerous protocols (javascript:, vbscript:, whitespace-split, srcset)', () => {
    const vectors = [
      '<a href="javascript:alert(1)">',
      '<a href="vbscript:msgbox(1)">',
      '<a href="java\u0000script:alert(1)">', // null byte stripped then matched
      '<a href="j\ta\tv\ta\ts\tc\tr\ti\tp\tt:alert(1)">', // tab-split
      '<a href="j\ra\rv\ra\rs\rc\rr\ri\rp\rt:alert(1)">', // CR-split
      '<img srcset="javascript:alert(1) 2x">',
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(/javascript\s*:/);
      expect(safe).not.toMatch(/vbscript\s*:/);
    });
  });

  it('neutralizes entity-encoded protocols (&#NNN; / &#xHH; / named &colon;) before regex runs', () => {
    const vectors = [
      '<a href="&#106;avascript:alert(1)">', // decimal j
      '<a href="&#x6a;avascript:alert(1)">', // hex lowercase
      '<a href="&#X6A;avascript:alert(1)">', // hex uppercase X
      '<a href="&#0000106;avascript:alert(1)">', // zero-padded
      '<a href="java&#x73;cript:alert(1)">', // entity mid-keyword
      '<a href="javascript&#x3A;alert(1)">', // entity colon (hex)
      '<a href="javascript&colon;alert(1)">', // named entity colon
      '<a href="&#106avascript:alert(1)">', // semicolon-free entity
      '<a href="&#74;AVASCRIPT:alert(1)">', // uppercase J=74
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v);
      const div = document.createElement('div');
      div.innerHTML = safe;
      const href = div.querySelector('a')?.getAttribute('href') ?? '';
      expect(href).not.toMatch(/javascript\s*:/i);
    });
  });

  it('blocks dangerous data URIs (text/html, application/*, image/svg+xml) but allows image/*', () => {
    const bad = [
      '<a href="data:text/html;base64,PHNjcmlwdD4=">',
      '<a href="data:application/xml;base64,...">',
      '<a href="data:application/x-shockwave-flash;base64,...">',
      '<img src="data:image/svg+xml;base64,PHN2Zz4=">',
    ];
    bad.forEach((v) => expect(sanitizeHtml(v)).toContain('data-unsafe-protocol:'));
    expect(sanitizeHtml('<img src="data:image/png;base64,iVBOR...">')).toContain('data:image/png');
  });

  it('neutralizes dangerous CSS (expression, behavior, -moz-binding, url(javascript:), CSS unicode escape)', () => {
    const vectors = [
      '<div style="background:url(javascript:alert(1))">',
      '<div style="behavior:url(x.htc)">',
      '<div style="-moz-binding:url(evil.xml#xss)">',
      '<div style="width:expression(alert(1))">',
      '<div style="width:expression(/**/alert(1))">',
      '<div style="background:url(\\6a avascript:alert(1))">', // CSS unicode escape j
      '<div style="background:url(\\76 bscript:msgbox(1))">', // CSS unicode escape v
    ];
    vectors.forEach((v) => {
      const safe = sanitizeHtml(v).toLowerCase();
      expect(safe).not.toMatch(/javascript\s*:/);
      expect(safe).not.toMatch(/vbscript\s*:/);
      expect(safe).not.toMatch(/\bexpression\s*\(/);
      expect(safe).not.toMatch(/\bbehavior\s*:/);
      expect(safe).not.toMatch(/-moz-binding\s*:/);
    });
  });

  it('strips nested tag reassembly and XML processing instructions', () => {
    expect(sanitizeHtml('<scr<script>ipt>alert(1)</script>')).not.toContain('<script');
    expect(sanitizeHtml('<sc<sc<script>ript>ript>alert(1)</script>')).not.toContain('<script');
    expect(sanitizeHtml('<?xml-stylesheet href="javascript:alert(1)"?>')).not.toContain('<?');
  });

  it('preserves SVG wrapper but strips <script> inside SVG', () => {
    const safe = sanitizeHtml('<svg><script>alert(1)</script><circle r="5"/></svg>');
    expect(safe).toContain('<svg');
    expect(safe).not.toContain('<script');
  });

  it('returns empty string for null/undefined input', () => {
    expect(sanitizeHtml(null as unknown as string)).toBe('');
    expect(sanitizeHtml(undefined as unknown as string)).toBe('');
  });
});

describe('Unit: isDangerousUrl', () => {
  it('blocks dangerous protocols in URL attributes, allows safe values, ignores non-URL attrs', () => {
    expect(isDangerousUrl('href', 'javascript:alert(1)')).toBe(true);
    expect(isDangerousUrl('src', 'vbscript:alert(1)')).toBe(true);
    expect(isDangerousUrl('action', 'JAVASCRIPT:alert(1)')).toBe(true);
    expect(isDangerousUrl('href', '  javascript  :  alert(1)  ')).toBe(true);

    expect(isDangerousUrl('href', 'https://example.com')).toBe(false);
    expect(isDangerousUrl('href', '/login')).toBe(false);
    expect(isDangerousUrl('href', 'mailto:user@example.com')).toBe(false);

    expect(isDangerousUrl('title', 'javascript:foo')).toBe(false);
  });
});

describe('Unit: isDangerousCssValue', () => {
  it('blocks url(javascript:/vbscript:), allows safe values', () => {
    expect(isDangerousCssValue('url(javascript:alert(1))')).toBe(true);
    expect(isDangerousCssValue("url('vbscript:alert(1)')")).toBe(true);
    expect(isDangerousCssValue('  url(  javascript: )')).toBe(true);

    expect(isDangerousCssValue('red')).toBe(false);
    expect(isDangerousCssValue('url(https://example.com/bg.png)')).toBe(false);
    expect(isDangerousCssValue('url(data:image/png;base64,...)')).toBe(false);
  });
});

// ============================================================================
// PART 2: API Attack Surface Tests
// One describe per method. Each test covers a distinct attack category.
// Structurally safe methods (textContent / el.value / boolean sinks) get
// one test each confirming the safe sink ??not an exhaustive attack suite.
// ============================================================================

describe('atomHtml: XSS attack surface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('strips dangerous tags (script, iframe, object, embed)', () => {
    const vectors = [
      {
        payload: '<script>alert(1)</script><b>ok</b>',
        check: () =>
          expect(
            $('<div>')
              .appendTo(document.body)
              .atomHtml(atom('<script>alert(1)</script><b>ok</b>'))
              .find('script').length
          ).toBe(0),
      },
    ];
    // consolidated: all tag strips via single loop
    const payloads: [string, string][] = [
      ['<script>alert(1)</script>', 'script'],
      ['<iframe src="https://evil.com"></iframe>', 'iframe'],
      ['<object data="evil.swf"></object>', 'object'],
      ['<embed src="evil.swf">', 'embed'],
    ];
    payloads.forEach(([html, tag]) => {
      const div = $('<div>').appendTo(document.body);
      div.atomHtml(atom(html));
      expect(div.find(tag).length).toBe(0);
    });
    void vectors;
  });

  it('strips on* handlers and preserves the host element (img onerror, svg onload)', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<img src=x onerror=alert(1)><svg onload=alert(1)><circle r="5"/></svg>'));
    expect(div.find('img')[0]!.getAttribute('onerror')).toBeNull();
    expect(div.find('svg').length).toBe(1);
    expect(div.find('svg')[0]!.getAttribute('onload')).toBeNull();
  });

  it('strips javascript: href inside injected <a>', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<a href="javascript:alert(1)">click</a>'));
    expect(div.find('a')[0]!.getAttribute('href')).not.toMatch(/javascript\s*:/i);
  });

  it('blocks entity-encoded protocols end-to-end (decimal, hex, named, mid-keyword, semicolon-free)', () => {
    const payloads = [
      '<a href="&#106;avascript:alert(1)">x</a>',
      '<a href="&#x6A;&#97;vascript:alert(1)">x</a>',
      '<a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)">x</a>',
      '<a href="javascript&#x3A;alert(1)">x</a>',
      '<a href="javascript&colon;alert(1)">x</a>',
      '<a href="&#106avascript:alert(1)">x</a>',
      '<a href="&#74;AVASCRIPT:alert(1)">x</a>',
    ];
    payloads.forEach((payload) => {
      const div = $('<div>').appendTo(document.body);
      div.atomHtml(atom(payload));
      expect(div.find('a')[0]!.getAttribute('href')).not.toMatch(/javascript\s*:/i);
    });
  });

  it('blocks entity-encoded CSS url() (&#x75;rl(javascript:...))', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<div style="background:&#x75;rl(javascript:alert(1))"></div>'));
    expect(div.find('div')[0]!.getAttribute('style') ?? '').not.toContain('javascript:');
  });

  it('strips injected script on reactive atom value change', async () => {
    const html = atom('<b>safe</b>');
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(html);
    html.value = '<script>alert(1)</script><b>still safe</b>';
    await $.nextTick();
    expect(div.html()).not.toContain('<script');
    expect(div.find('b').length).toBe(1);
  });

  it('allows safe HTML (SVG icon, img, relative link)', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<svg><circle r="4"/></svg><img src="/logo.png"><a href="/home">Home</a>'));
    expect(div.find('svg').length).toBe(1);
    expect(div.find('img').length).toBe(1);
    expect(div.find('a').attr('href')).toBe('/home');
  });
});

describe('atomAttr: XSS attack surface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('blocks javascript:/vbscript: in URL attributes (href, src, action, formaction, xlink:href ??any case, with whitespace)', () => {
    const blocked: [string, string, string][] = [
      ['a', 'href', 'javascript:alert(1)'],
      ['a', 'href', 'vbscript:msgbox(1)'],
      ['a', 'href', '  javascript:alert(1)'],
      ['a', 'href', 'JAVASCRIPT:alert(1)'],
      ['img', 'src', 'javascript:alert(1)'],
      ['form', 'action', 'javascript:alert(1)'],
      ['button', 'formaction', 'javascript:alert(1)'],
      ['use', 'xlink:href', 'javascript:alert(1)'],
    ];
    blocked.forEach(([tag, attr, val]) => {
      const el = $(`<${tag}>`).appendTo(document.body);
      el.atomAttr(attr, atom(val));
      expect(el.attr(attr)).toBeUndefined();
    });
  });

  it('blocks on* attribute names regardless of case', () => {
    const div = $('<div>').appendTo(document.body);
    ['onclick', 'onerror', 'onload', 'OnClick', 'ONERROR', 'OnMouseOver'].forEach((name) => {
      div.atomAttr(name, atom('alert(1)'));
      expect(div.attr(name.toLowerCase())).toBeUndefined();
    });
  });

  it('allows safe URL attributes through (https, relative, mailto)', () => {
    const a = $('<a>').appendTo(document.body);
    a.atomAttr('href', atom('https://example.com/path?q=1#hash'));
    expect(a.attr('href')).toBe('https://example.com/path?q=1#hash');

    const img = $('<img>').appendTo(document.body);
    img.atomAttr('src', atom('/images/logo.png'));
    expect(img.attr('src')).toBe('/images/logo.png');

    const mail = $('<a>').appendTo(document.body);
    mail.atomAttr('href', atom('mailto:user@example.com'));
    expect(mail.attr('href')).toBe('mailto:user@example.com');
  });
});

describe('atomCss: XSS attack surface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('blocks url(javascript:/vbscript:) across multiple properties', () => {
    const props: [string, string][] = [
      ['background-image', 'url(javascript:alert(1))'],
      ['background', "url('vbscript:msgbox(1)')"],
      ['list-style-image', 'url(javascript:alert(1))'],
      ['cursor', 'url(javascript:alert(1)), auto'],
    ];
    props.forEach(([prop, val]) => {
      const div = $('<div>').appendTo(document.body);
      div.atomCss(prop, atom(val));
      const camel = prop.replace(/-./g, (m) => m[1]!.toUpperCase());
      expect((div[0]!.style as unknown as Record<string, string>)[camel]).toBe('');
    });
  });

  it('blocks expression(), behavior:, -moz-binding (IE/Gecko legacy)', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomCss('width', atom('expression(alert(1))'));
    div.atomCss('behavior', atom('url(evil.htc)'));
    expect(div[0]!.style.width).toBe('');
    expect(div[0]!.style.getPropertyValue('behavior')).toBe('');
  });

  it('allows safe values (color, px, https url, data:image/*)', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomCss('color', atom('red'));
    div.atomCss('font-size', atom('16px'));
    div.atomCss('background-image', atom('url(https://example.com/bg.png)'));
    const b64 =
      'url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=)';
    div.atomCss('background-image', atom(b64));
    expect(div[0]!.style.color).toBe('red');
    expect(div[0]!.style.fontSize).toBe('16px');
    expect(div[0]!.style.backgroundImage).toContain('data:image/png');
  });
});

describe('atomProp: XSS attack surface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('blocks all DANGEROUS_PROPS (innerHTML, outerHTML, srcdoc, __proto__, constructor, prototype)', () => {
    const div = $('<div>').appendTo(document.body);
    ['innerHTML', 'outerHTML', 'srcdoc', '__proto__', 'constructor', 'prototype'].forEach(
      (prop) => {
        div.atomProp(prop, atom('<script>alert(1)</script>'));
      }
    );
    expect(div.html()).toBe('');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('allows safe props (disabled, tabIndex)', async () => {
    const input = $('<input>').appendTo(document.body);
    const isDisabled = atom(true);
    input.atomProp('disabled', isDisabled);
    await $.nextTick();
    expect((input[0] as HTMLInputElement).disabled).toBe(true);
    isDisabled.value = false;
    await $.nextTick();
    expect((input[0] as HTMLInputElement).disabled).toBe(false);
  });
});

describe('atomList: XSS attack surface', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('sanitizes all render() string outputs and empty option (batch)', () => {
    const div = $('<div>').appendTo(document.body);
    const items = atom([
      { id: 1, html: '<script>alert(1)</script><b>A</b>' },
      { id: 2, html: '<img onerror=alert(2) src=x><b>B</b>' },
      { id: 3, html: '<iframe src=evil.com></iframe><b>C</b>' },
    ]);
    div.atomList(items, { key: (i) => i.id, render: (i) => i.html });
    expect(div.find('script').length).toBe(0);
    expect(div.find('iframe').length).toBe(0);
    expect(div.find('b').length).toBe(3);
    const img = div.find('img')[0];
    if (img) expect(img.getAttribute('onerror')).toBeNull();
  });

  it('sanitizes empty option string', () => {
    const div = $('<div>').appendTo(document.body);
    const items = atom<string[]>([]);
    div.atomList(items, {
      key: (_i: string, idx: number) => idx,
      render: (i) => `<span>${i}</span>`,
      empty: '<script>alert(1)</script><p>empty</p>',
    });
    expect(div.find('script').length).toBe(0);
  });

  it('allows Element/JQuery render output without double-sanitizing', () => {
    const div = $('<div>').appendTo(document.body);
    const items = atom([{ id: 1 }]);
    div.atomList(items, { key: (i) => i.id, render: () => $('<span class="safe">ok</span>')[0]! });
    expect(div.find('span.safe').length).toBe(1);
  });
});

describe('atomVal / atomText / atomChecked / atomShow / atomClass: structural safety', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('atomVal: writes to el.value ??HTML never parsed', async () => {
    const input = $('<input>').appendTo(document.body);
    input.atomVal(atom('<script>alert(1)</script>'));
    await $.nextTick();
    expect((input[0] as HTMLInputElement).value).toBe('<script>alert(1)</script>');
    expect(input.find('script').length).toBe(0);
  });

  it('atomText: writes to textContent ??HTML never parsed', async () => {
    const span = $('<span>').appendTo(document.body);
    span.atomText(atom('<script>alert(1)</script>'));
    await $.nextTick();
    expect(span[0]!.textContent).toBe('<script>alert(1)</script>');
    expect(span.find('script').length).toBe(0);
  });

  it('atomChecked/atomShow/atomClass: boolean/display/classList sinks ??no HTML path', async () => {
    const cb = $('<input type="checkbox">').appendTo(document.body);
    const checked = atom(false);
    cb.atomChecked(checked);
    checked.value = true;
    await $.nextTick();
    expect((cb[0] as HTMLInputElement).checked).toBe(true);

    const div = $('<div>').appendTo(document.body);
    const visible = atom(true);
    div.atomShow(visible);
    visible.value = false;
    await $.nextTick();
    expect(div[0]!.style.display).toBe('none');

    const div2 = $('<div>').appendTo(document.body);
    div2.atomClass('active', atom(true));
    await $.nextTick();
    expect(div2.hasClass('active')).toBe(true);
    expect(div2.html()).toBe('');
  });
});

// ============================================================================
// PART 3: Allowed / Practicality ??safe content must not be blocked
// ============================================================================

describe('Policy: Allowed / Practicality', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('allows inline SVG icons, data:image/* src, relative href, safe CSS', () => {
    const div = $('<div>').appendTo(document.body);
    div.atomHtml(atom('<svg class="feather"><circle cx="12" cy="7" r="4"></circle></svg>'));
    expect(div.find('circle').length).toBe(1);

    const b64 =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    div.atomHtml(atom(`<img src="${b64}">`));
    expect(div.find('img').length).toBe(1);

    const a = $('<a>').appendTo(document.body);
    a.atomAttr('href', atom('/dashboard?q=1'));
    expect(a.attr('href')).toBe('/dashboard?q=1');

    const cssdiv = $('<div>').appendTo(document.body);
    cssdiv.atomCss('background-image', atom(`url(${b64})`));
    expect(cssdiv[0]!.style.backgroundImage).toContain('data:image/png');
  });

  it('escape hatch: raw effect bypasses sanitization (user opt-out)', () => {
    const div = $('<div>');
    const fx = effect(() => {
      div.html('<iframe src="https://example.com"></iframe>');
    });
    registry.trackEffect(div[0]!, fx);
    expect(div.find('iframe').length).toBe(1);
  });
});
