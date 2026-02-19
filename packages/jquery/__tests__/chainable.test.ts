import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Chainable Methods (Surface)', () => {
  it('should support basic reactive bindings for all methods', async () => {
    const text = $.atom('a');
    const color = $.atom('red');
    const isActive = $.atom(true);
    const attr = $.atom('val');

    const $el = $('<div>').appendTo(document.body);

    // Chain multiple bindings
    $el
      .atomText(text)
      .atomCss('color', color)
      .atomClass('active', isActive)
      .atomAttr('data-test', attr);

    await $.nextTick();
    expect($el.text()).toBe('a');
    expect($el.css('color')).toMatch(/red|rgb\(255, 0, 0\)/);
    expect($el.hasClass('active')).toBe(true);
    expect($el.attr('data-test')).toBe('val');

    // Update all
    text.value = 'A';
    isActive.value = false;
    await $.nextTick();
    expect($el.text()).toBe('A');
    expect($el.hasClass('active')).toBe(false);

    // atomHtml separately to avoid overwriting atomText on same element
    const html = $.atom('<b>b</b>');
    const $el2 = $('<div>').appendTo(document.body);
    $el2.atomHtml(html);
    await $.nextTick();
    expect($el2.html()).toBe('<b>b</b>');

    $el.remove();
    $el2.remove();
  });

  it('should support static values, formatters, and other helpers', () => {
    const $el = $('<div>');

    $el.atomText(123, (v) => `V:${v}`);
    expect($el.text()).toBe('V:123');

    $el.atomCss('width', 10, 'px');
    expect($el.css('width')).toBe('10px');

    $el.atomAttr('disabled', true);
    expect($el.attr('disabled')).toBe('disabled');
    $el.atomAttr('disabled', false);
    expect($el.attr('disabled')).toBeUndefined();

    const $input = $('<input type="checkbox">');
    $input.atomProp('checked', true);
    expect($input.prop('checked')).toBe(true);

    // atomShow/atomHide require DOM-attached element for computed style
    const $showHide = $('<div>').appendTo(document.body);
    $showHide.atomShow(true);
    expect($showHide.css('display')).not.toBe('none');
    $showHide.atomHide(true);
    expect($showHide.css('display')).toBe('none');
    $showHide.remove();
  });

  it('atomUnbind should stop all reactivity', async () => {
    const text = $.atom('initial');
    const $el = $('<div>');
    $el.atomText(text);

    $el.atomUnbind();
    text.value = 'updated';
    await $.nextTick();
    expect($el.text()).toBe('initial');
  });
  it('should warn when atomVal is used on non-input elements', async () => {
    const val = $.atom('test');
    const $div = $('<div>'); // Not an input
    const warnSpy = vi.spyOn(console, 'warn');

    $div.atomVal(val);
    await $.nextTick();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('atomBind', () => {
  it('should bind multiple properties simultaneously', async () => {
    const text = $.atom('title');
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);

    $el.atomBind({
      text: text,
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

  it('should support complex CSS and static properties', () => {
    const $el = $('<div>');
    $el.atomBind({
      css: {
        opacity: 0.5,
        'font-size': [20, 'px'],
        margin: $.atom(10),
      },
      prop: { id: 'test-id' },
      show: true,
    });

    expect($el.css('font-size')).toBe('20px');
    expect($el.prop('id')).toBe('test-id');
    expect($el.css('display')).not.toBe('none');
  });

  it('should support event binding with automatic cleanup', () => {
    const count = $.atom(0);
    const $el = $('<button>').appendTo(document.body);
    const handler = vi.fn(() => count.value++);

    $el.atomBind({
      on: { click: handler },
    });

    $el.trigger('click');
    expect(count.value).toBe(1);

    $el.atomUnbind();
    $el.trigger('click');
    expect(count.value).toBe(1);

    $el.remove();
  });

  it('should support custom options for two-way val binding', async () => {
    const val = $.atom(0);
    const $el = $('<input>').appendTo(document.body);

    $el.atomBind({
      val: [val, { format: (v) => `N:${v}` }],
    });

    await $.nextTick();
    expect($el.val()).toBe('N:0');

    $el.remove();
  });

  it('should support html binding', async () => {
    const html = $.atom('<span>initial</span>');
    const $el = $('<div>');

    $el.atomBind({ html });

    await $.nextTick();
    expect($el.html()).toBe('<span>initial</span>');

    html.value = '<span>updated</span>';
    await $.nextTick();
    expect($el.html()).toBe('<span>updated</span>');
  });

  it('should remove attributes when value is null or false', async () => {
    const attrVal = $.atom<string | boolean | null>('initial');
    const $el = $('<div>');

    $el.atomBind({
      attr: { 'data-test': attrVal },
    });

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

  it('should support hide binding', async () => {
    const shouldHide = $.atom(false);
    const $el = $('<div>').appendTo(document.body);

    $el.atomBind({ hide: shouldHide });

    await $.nextTick();
    expect($el.css('display')).not.toBe('none');

    shouldHide.value = true;
    await $.nextTick();
    expect($el.css('display')).toBe('none');

    $el.remove();
  });

  it('should support two-way checked binding', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomBind({ checked: isChecked });

    isChecked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);

    $el.prop('checked', false);
    $el[0]!.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);

    $el.remove();
  });
});
