import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '../src/index';

describe('Chainable Methods', () => {
  it('atomText should bind text', async () => {
    const text = $.atom('initial');
    const $el = $('<div>').appendTo(document.body);
    $el.atomText(text);

    await $.nextTick();
    expect($el.text()).toBe('initial');

    text.value = 'updated';
    await $.nextTick();
    expect($el.text()).toBe('updated');
    $el.remove();
  });

  it('atomText should support formatter and non-reactive values', async () => {
    const $el = $('<div>').appendTo(document.body);

    // Test non-reactive with formatter
    $el.atomText(123, (v) => `Value: ${v}`);
    expect($el.text()).toBe('Value: 123');

    // Test reactive with formatter
    const count = $.atom(1);
    $el.atomText(count, (v) => `Count: ${v}`);
    await $.nextTick();
    expect($el.text()).toBe('Count: 1');

    count.value = 2;
    await $.nextTick();
    expect($el.text()).toBe('Count: 2');

    // Test null/undefined handling
    $el.atomText(null);
    expect($el.text()).toBe('');

    $el.remove();
  });

  it('atomText should support unit', async () => {
    const $el = $('<div>').appendTo(document.body);

    // Test non-reactive with formatter
    $el.atomText(123, (v) => `Value: ${v}px`);
    expect($el.text()).toBe('Value: 123px');

    // Test reactive with formatter
    const count = $.atom(1);
    $el.atomText(count, (v) => `Count: ${v}px`);
    await $.nextTick();
    expect($el.text()).toBe('Count: 1px');

    count.value = 2;
    await $.nextTick();
    expect($el.text()).toBe('Count: 2px');

    // Test null/undefined handling
    $el.atomText(null);
    expect($el.text()).toBe('');

    $el.remove();
  });

  it('atomCss should bind style with unit', async () => {
    const $el = $('<div>').appendTo(document.body);
    const width = $.atom(100);

    // Test reactive value with unit
    $el.atomCss('width', width, 'px');
    await $.nextTick();
    expect($el.css('width')).toBe('100px');

    width.value = 200;
    await $.nextTick();
    expect($el.css('width')).toBe('200px');

    // Test non-reactive value with unit
    $el.atomCss('height', 50, 'vh');
    expect($el.css('height')).toBe('50vh');

    $el.remove();
  });

  it('atomClass should bind class', async () => {
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);
    $el.atomClass('active', isActive);

    await $.nextTick();
    expect($el.hasClass('active')).toBe(false);

    isActive.value = true;
    await $.nextTick();
    expect($el.hasClass('active')).toBe(true);
    $el.remove();
  });

  it('atomAttr should bind attributes', async () => {
    const src = $.atom('img.jpg');
    const $el = $('<img>').appendTo(document.body);
    $el.atomAttr('src', src);

    await $.nextTick();
    expect($el.attr('src')).toBe('img.jpg');

    src.value = 'new.jpg';
    await $.nextTick();
    expect($el.attr('src')).toBe('new.jpg');
    $el.remove();
  });

  it('atomHtml should bind html', async () => {
    const html = $.atom('<span>initial</span>');
    const $el = $('<div>').appendTo(document.body);

    // Reactive
    $el.atomHtml(html);
    await $.nextTick();
    expect($el.html()).toBe('<span>initial</span>');

    html.value = '<b>updated</b>';
    await $.nextTick();
    expect($el.html()).toBe('<b>updated</b>');

    // Non-reactive
    $el.atomHtml('<i>static</i>');
    expect($el.html()).toBe('<i>static</i>');

    // Null handling
    $el.atomHtml(null as unknown as string);
    expect($el.html()).toBe('');

    $el.remove();
  });

  it('atomClass should support static values', () => {
    const $el = $('<div>');
    $el.atomClass('static', true);
    expect($el.hasClass('static')).toBe(true);
    $el.atomClass('static', false);
    expect($el.hasClass('static')).toBe(false);
  });

  it('atomAttr should support boolean and null values', () => {
    const $el = $('<div>');
    $el.atomAttr('disabled', true);
    expect($el.attr('disabled')).toBe('disabled');
    $el.atomAttr('disabled', false);
    expect($el.attr('disabled')).toBeUndefined();
    $el.atomAttr('data-test', null);
    expect($el.attr('data-test')).toBeUndefined();
  });

  it('atomProp should support static and reactive values', async () => {
    const $el = $('<input type="checkbox">');
    // Static
    $el.atomProp('checked', true);
    expect($el.prop('checked')).toBe(true);

    // Reactive
    const checked = $.atom(false);
    $el.atomProp('checked', checked);
    await $.nextTick();
    expect($el.prop('checked')).toBe(false);
    checked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);
  });

  it('atomShow and atomHide should support static and reactive values', async () => {
    const $el = $('<div>').appendTo(document.body);

    // Static show
    $el.atomShow(true);
    expect($el.css('display')).not.toBe('none');
    $el.atomShow(false);
    expect($el.css('display')).toBe('none');

    // Reactive show
    const visible = $.atom(true);
    $el.atomShow(visible);
    await $.nextTick();
    expect($el.css('display')).not.toBe('none');
    visible.value = false;
    await $.nextTick();
    expect($el.css('display')).toBe('none');

    // Static hide
    $el.atomHide(true);
    expect($el.css('display')).toBe('none');
    $el.atomHide(false);
    expect($el.css('display')).not.toBe('none');

    // Reactive hide
    const hidden = $.atom(false);
    $el.atomHide(hidden);
    await $.nextTick();
    expect($el.css('display')).not.toBe('none');
    hidden.value = true;
    await $.nextTick();
    expect($el.css('display')).toBe('none');

    $el.remove();
  });

  it('atomUnbind should stop reactivity', async () => {
    const text = $.atom('initial');
    const $el = $('<div>');
    $el.atomText(text);
    expect($el.text()).toBe('initial');

    $el.atomUnbind();
    text.value = 'updated';
    await $.nextTick();
    expect($el.text()).toBe('initial');
  });

  it('atomChecked should bind checked state and handle cycles', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);
    $el.atomChecked(isChecked);

    await $.nextTick();
    expect($el.prop('checked')).toBe(false);

    // Atom -> DOM
    isChecked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);

    // DOM -> Atom
    $el.prop('checked', false).trigger('change');
    expect(isChecked.value).toBe(false);

    $el.remove();
  });

  it('atomText, atomCss, atomAttr exhaustive branches', () => {
    const $el = $('<div>');

    // atomText non-reactive branches (lines 21, 33-36)
    $el.atomText(undefined as unknown as string);
    expect($el.text()).toBe('');
    $el.atomText('foo');
    expect($el.text()).toBe('foo');

    // atomCss non-reactive branches (line 43, 62-72)
    $el.atomCss('color', 'red');
    expect($el.css('color')).toMatch(/rgb\(255,\s*0,\s*0\)/);
    $el.atomCss('margin', 10, 'px');
    expect($el.css('margin')).toBe('10px');

    // atomAttr all branches (lines 93-99)
    $el.atomAttr('data-test', true);
    expect($el.attr('data-test')).toBe('data-test');
    $el.atomAttr('data-test', false);
    expect($el.attr('data-test')).toBeUndefined();
    $el.atomAttr('data-test', 'val');
    expect($el.attr('data-test')).toBe('val');
    $el.atomAttr('data-test', null);
    expect($el.attr('data-test')).toBeUndefined();
    $el.atomAttr('data-test', undefined as unknown as string);
    expect($el.attr('data-test')).toBeUndefined();
  });

  it('atomChecked isUpdatingFromAtom branch', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);
    $el.atomChecked(isChecked);

    // We want to trigger a 'change' event while the effect is running.
    // In chainable.ts:
    // const fx = effect(() => {
    //   isUpdatingFromAtom = true;
    //   $el.prop('checked', atom.value); // <--- Triggers change? No, but let's force it if we can.
    //   ...
    //   isUpdatingFromAtom = false;
    // });

    // We can use a spy on prop to trigger change
    const originalProp = $.fn.prop;
    type PropFn = (this: JQuery, name: string, value?: unknown) => JQuery | boolean | undefined;
    ($.fn.prop as PropFn) = function (this: JQuery, name: string, value?: unknown) {
      const res = (originalProp as PropFn).call(this, name, value);
      if (name === 'checked' && value !== undefined) {
        // Triggering change here will hit the handler in atomChecked
        // which has: if (isUpdatingFromAtom) return;
        this.trigger('change');
      }
      return res;
    };

    isChecked.value = true;
    await $.nextTick();

    $.fn.prop = originalProp;
    $el.remove();
  });
});
