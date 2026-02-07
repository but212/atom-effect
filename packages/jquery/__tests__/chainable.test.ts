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
  it('should prevent XSS sequences in atomHtml', async () => {
    const maliciousHtml = '<img src=x onerror=alert(1)>';
    const htmlAtom = $.atom(maliciousHtml);
    const $el = $('<div>');
    
    $el.atomHtml(htmlAtom);
    await $.nextTick();
    
    // Assert that the 'onerror' attribute has been removed/neutralized
    expect($el.html()).not.toContain('onerror');
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
