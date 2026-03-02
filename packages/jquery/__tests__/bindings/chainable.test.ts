import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../../src/index';

describe('Chainable Methods (Surface)', () => {
  it('smoke: reactive chain with update', async () => {
    const text = $.atom('a');
    const color = $.atom('red');
    const isActive = $.atom(true);
    const attr = $.atom('val');
    const html = $.atom('<b>b</b>');

    const $el = $('<div>').appendTo(document.body);
    const $el2 = $('<div>').appendTo(document.body);

    $el
      .atomText(text)
      .atomCss('color', color)
      .atomClass('active', isActive)
      .atomAttr('data-test', attr);
    $el2.atomHtml(html);

    await $.nextTick();
    expect($el.text()).toBe('a');
    expect($el.css('color')).toMatch(/red|rgb\(255, 0, 0\)/);
    expect($el.hasClass('active')).toBe(true);
    expect($el.attr('data-test')).toBe('val');
    expect($el2.html()).toBe('<b>b</b>');

    text.value = 'A';
    isActive.value = false;
    await $.nextTick();
    expect($el.text()).toBe('A');
    expect($el.hasClass('active')).toBe(false);

    $el.remove();
    $el2.remove();
  });

  it('atomUnbind stops all reactivity', async () => {
    const text = $.atom('initial');
    const $el = $('<div>');
    $el.atomText(text);

    $el.atomUnbind();
    text.value = 'updated';
    await $.nextTick();
    expect($el.text()).toBe('initial');
  });

  it('atomVal warns on non-input element', async () => {
    const val = $.atom('test');
    const $div = $('<div>');
    const warnSpy = vi.spyOn(console, 'warn');

    $div.atomVal(val);
    await $.nextTick();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('missing-arg warns: atomClass / atomCss / atomAttr / atomProp', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const $el = $('<div>');

    // @ts-expect-error - testing JS runtime guard
    $el.atomClass('active');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect($el.hasClass('active')).toBe(false);

    // @ts-expect-error - testing JS runtime guard
    $el.atomCss('color');
    expect(warnSpy).toHaveBeenCalledTimes(2);

    // @ts-expect-error - testing JS runtime guard
    $el.atomAttr('data-foo');
    expect(warnSpy).toHaveBeenCalledTimes(3);

    // @ts-expect-error - testing JS runtime guard
    $el.atomProp('id');
    expect(warnSpy).toHaveBeenCalledTimes(4);

    warnSpy.mockRestore();
  });

  it('atomClass: map overload toggles multiple classes', async () => {
    const isActive = $.atom(true);
    const isDisabled = $.atom(false);
    const $el = $('<div>');

    $el.atomClass({ active: isActive, disabled: isDisabled });

    await $.nextTick();
    expect($el.hasClass('active')).toBe(true);
    expect($el.hasClass('disabled')).toBe(false);

    isActive.value = false;
    isDisabled.value = true;
    await $.nextTick();
    expect($el.hasClass('active')).toBe(false);
    expect($el.hasClass('disabled')).toBe(true);
  });

  it('atomCss: map with unit tuple and reactive update', async () => {
    const opacity = $.atom(0.5);
    const $el = $('<div>').appendTo(document.body);

    $el.atomCss({ opacity, 'font-size': [20, 'px'] });

    await $.nextTick();
    expect($el.css('opacity')).toBe('0.5');
    expect($el.css('font-size')).toBe('20px');

    opacity.value = 1;
    await $.nextTick();
    expect($el.css('opacity')).toBe('1');

    $el.remove();
  });

  it('atomAttr: map overload sets multiple attributes', async () => {
    const href = $.atom('https://example.com');
    const title = $.atom('My Link');
    const $el = $('<a>');

    $el.atomAttr({ href, title });

    await $.nextTick();
    expect($el.attr('href')).toBe('https://example.com');
    expect($el.attr('title')).toBe('My Link');

    title.value = 'Updated';
    await $.nextTick();
    expect($el.attr('title')).toBe('Updated');
  });

  it('atomAttr: blocks on* event handler attributes', async () => {
    const $el = $('<div>');
    $el.atomAttr('onclick', $.atom('alert(1)'));
    await $.nextTick();
    expect($el.attr('onclick')).toBeUndefined();
  });

  it('atomProp: blocks dangerous properties (innerHTML, outerHTML)', async () => {
    const $el = $('<div>');
    $el.atomProp('innerHTML', $.atom('<script>alert(1)</script>'));
    await $.nextTick();
    expect($el.html()).toBe('');
  });

  it('atomOn: binds event and cleans up on atomUnbind', () => {
    const $el = $('<button>').appendTo(document.body);
    const handler = vi.fn();

    $el.atomOn('click', handler);
    $el.trigger('click');
    expect(handler).toHaveBeenCalledTimes(1);

    $el.atomUnbind();
    $el.trigger('click');
    expect(handler).toHaveBeenCalledTimes(1);

    $el.remove();
  });

  it('atomChecked: two-way binding for checkboxes', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);

    isChecked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);

    $el.prop('checked', false);
    $el[0]!.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);

    $el.remove();
  });

  it('atomShow/atomHide: react to reactive atom changes', async () => {
    const show = $.atom(true);
    const hide = $.atom(false);
    const $a = $('<div>').appendTo(document.body);
    const $b = $('<div>').appendTo(document.body);

    $a.atomShow(show);
    $b.atomHide(hide);
    await $.nextTick();
    expect($a.css('display')).not.toBe('none');
    expect($b.css('display')).not.toBe('none');

    show.value = false;
    hide.value = true;
    await $.nextTick();
    expect($a.css('display')).toBe('none');
    expect($b.css('display')).toBe('none');

    $a.remove();
    $b.remove();
  });

  it('multi-element set: binding applies to all elements', async () => {
    const text = $.atom('hello');
    const $els = $('<span>').add('<span>').appendTo(document.body);

    $els.atomText(text);
    await $.nextTick();
    $els.each((_, el) => {
      expect($(el).text()).toBe('hello');
    });

    text.value = 'world';
    await $.nextTick();
    $els.each((_, el) => {
      expect($(el).text()).toBe('world');
    });

    $els.each((_, el) => {
      $(el).atomUnbind();
    });
    $els.remove();
  });

  it('Should not crash on text nodes or document nodes', () => {
    const textAtom = $.atom('Update');
    const $container = $('<div>Text <span>Span</span> MoreText</div>');

    // Attempting to bind to a text node or document
    const $textNodes = $container.contents().filter(function () {
      return this.nodeType === 3;
    });

    expect(() => {
      $textNodes.atomText(textAtom);
    }).not.toThrow();
  });
});

describe('atomBind', () => {
  it('binds multiple properties simultaneously and updates reactively', async () => {
    const text = $.atom('title');
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);

    $el.atomBind({
      text,
      class: { active: isActive },
      attr: { 'data-mode': 'demo' },
    });

    await $.nextTick();
    expect($el.text()).toBe('title');
    expect($el.hasClass('active')).toBe(false);
    expect($el.attr('data-mode')).toBe('demo');

    text.value = 'updated';
    isActive.value = true;
    await $.nextTick();
    expect($el.text()).toBe('updated');
    expect($el.hasClass('active')).toBe(true);

    $el.remove();
  });

  it('val: [atom, options] tuple applies format function', async () => {
    const val = $.atom(0);
    const $el = $('<input>').appendTo(document.body);

    $el.atomBind({ val: [val, { format: (v) => `N:${v}` }] });

    await $.nextTick();
    expect($el.val()).toBe('N:0');

    $el.remove();
  });

  it('attr: null and false remove the attribute', async () => {
    const attrVal = $.atom<string | boolean | null>('initial');
    const $el = $('<div>');

    $el.atomBind({ attr: { 'data-test': attrVal } });

    await $.nextTick();
    expect($el.attr('data-test')).toBe('initial');

    attrVal.value = null;
    await $.nextTick();
    expect($el.attr('data-test')).toBeUndefined();

    attrVal.value = 'again';
    await $.nextTick();
    expect($el.attr('data-test')).toBe('again');

    attrVal.value = false;
    await $.nextTick();
    expect($el.attr('data-test')).toBeUndefined();
  });

  it('atomUnbind cleans up all bindings registered via atomBind', async () => {
    const text = $.atom('before');
    const cls = $.atom(false);
    const $el = $('<div>');

    $el.atomBind({ text, class: { active: cls } });
    $el.atomUnbind();

    text.value = 'after';
    cls.value = true;
    await $.nextTick();

    expect($el.text()).toBe('before');
    expect($el.hasClass('active')).toBe(false);
  });
  it('bindClass should support multiple space-separated classes without DOMException (Fix 1)', async () => {
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);

    // Testing with spaces, tabs, and newlines
    $el.atomClass('  bg-red-500 \t font-bold \n ', isActive);
    await $.nextTick();
    expect($el.hasClass('bg-red-500')).toBe(false);
    expect($el.hasClass('font-bold')).toBe(false);

    isActive.value = true;
    await $.nextTick();
    expect($el.hasClass('bg-red-500')).toBe(true);
    expect($el.hasClass('font-bold')).toBe(true);

    $el.remove();
  });

  it('bindChecked should cross-communicate to uncheck sibling radio buttons (Fix 2)', async () => {
    const atomA = $.atom(true);
    const atomB = $.atom(false);

    const $form = $('<form>').appendTo(document.body);
    const $radioA = $('<input type="radio" name="group" value="A" checked>').appendTo($form);
    const $radioB = $('<input type="radio" name="group" value="B">').appendTo($form);

    $radioA.atomChecked(atomA);
    $radioB.atomChecked(atomB);
    await $.nextTick();

    expect(atomA.value).toBe(true);
    expect(atomB.value).toBe(false);

    // User clicks on B. A native browser would uncheck A automatically without firing 'change' on A.
    $radioB.prop('checked', true).trigger('change');
    await $.nextTick();

    expect(atomB.value).toBe(true);
    expect(atomA.value).toBe(false); // Atom A should natively sync to false through cross-communication.

    $form.remove();
  });

  it('bindChecked radio cross-sync should be scoped to the containing form (Fix 2 follow-up)', async () => {
    const form1A = $.atom(true);
    const form1B = $.atom(false);
    const form2A = $.atom(true);

    const $form1 = $('<form>').appendTo(document.body);
    const $form2 = $('<form>').appendTo(document.body);

    // Both forms use the same radio name 'group'
    const $f1RadioA = $('<input type="radio" name="group" value="A" checked>').appendTo($form1);
    const $f1RadioB = $('<input type="radio" name="group" value="B">').appendTo($form1);
    const $f2RadioA = $('<input type="radio" name="group" value="A" checked>').appendTo($form2);

    $f1RadioA.atomChecked(form1A);
    $f1RadioB.atomChecked(form1B);
    $f2RadioA.atomChecked(form2A);
    await $.nextTick();

    // Click radio B in form1
    $f1RadioB.prop('checked', true).trigger('change');
    await $.nextTick();

    // form1 should update
    expect(form1B.value).toBe(true);
    expect(form1A.value).toBe(false);

    // form2 should NOT be affected
    expect(form2A.value).toBe(true);

    $form1.remove();
    $form2.remove();
  });

  it('bindAttr should preserve false boolean values for ARIA prefix attributes (Fix 3)', async () => {
    const expanded = $.atom(true);
    const disabled = $.atom(true);
    const $el = $('<div>').appendTo(document.body);

    $el.atomAttr({
      'aria-expanded': expanded,
      disabled: disabled,
    });
    await $.nextTick();

    expect($el.attr('aria-expanded')).toBe('true');
    expect($el.attr('disabled')).toBe('disabled');

    expanded.value = false;
    disabled.value = false;
    await $.nextTick();

    // ARIA attribute should become string "false"
    expect($el.attr('aria-expanded')).toBe('false');
    // Normal boolean attribute should be completely removed
    expect($el.attr('disabled')).toBeUndefined();

    $el.remove();
  });

  it('bindVisibility should preserve original inline display styles, not blast them to empty string (Fix 5)', async () => {
    const isHidden = $.atom(false);
    // Inline display state
    const $el = $('<div style="display: flex;">').appendTo(document.body);

    $el.atomHide(isHidden);
    await $.nextTick();
    expect($el.css('display')).toBe('flex');

    isHidden.value = true;
    await $.nextTick();
    expect($el[0]!.style.display).toBe('none');

    isHidden.value = false;
    await $.nextTick();
    // Should restore back to flex
    expect($el[0]!.style.display).toBe('flex');

    $el.remove();
  });
});
