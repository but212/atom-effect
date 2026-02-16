import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Unified Bind (atomBind)', () => {
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
        margin: $.atom(10), // reactive without unit
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
    expect(count.value).toBe(1); // handler removed

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

  it('should support checked binding wiring via atomBind', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomBind({ checked: isChecked });

    // Verify atomBind wires Atom -> DOM correctly
    isChecked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);

    $el.remove();
  });
});
