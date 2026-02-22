import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

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
});
