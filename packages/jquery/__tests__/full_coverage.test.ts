import { describe, it, expect } from 'vitest';
import $ from 'jquery';
import '../src/index';

function wait(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

describe('Full Coverage - Chainable Static & Edge Cases', () => {
  it('atomText (static)', () => {
    const $el = $('<div>');
    $el.atomText('static text');
    expect($el.text()).toBe('static text');
  });

  it('atomText (formatter)', async () => {
    const val = $.atom(123);
    const $el = $('<div>');
    $el.atomText(val, (v) => `Value: ${v}`);
    await wait();
    expect($el.text()).toBe('Value: 123');
    val.value = 456;
    await wait();
    expect($el.text()).toBe('Value: 456');
  });

  it('atomHtml (static)', () => {
    const $el = $('<div>');
    $el.atomHtml('<span>static html</span>');
    expect($el.html()).toBe('<span>static html</span>');
  });

  it('atomClass (static)', () => {
    const $el = $('<div>');
    $el.atomClass('static-class', true);
    expect($el.hasClass('static-class')).toBe(true);
    $el.atomClass('static-class', false);
    expect($el.hasClass('static-class')).toBe(false);
  });

  it('atomCss (static & units)', () => {
    const $el = $('<div>');
    $el.atomCss('opacity', 0.5);
    // Loose check for string/number match
    expect(String($el.css('opacity'))).toMatch(/0\.5/); 
    
    $el.atomCss('width', 100, 'px');
    expect($el.css('width')).toBe('100px');
  });

  it('atomAttr (static & boolean/null)', () => {
    const $el = $('<div>');
    $el.atomAttr('data-test', 'static');
    expect($el.attr('data-test')).toBe('static');

    $el.atomAttr('disabled', true);
    expect($el.attr('disabled')).toBe('disabled');
    
    $el.atomAttr('disabled', false);
    expect($el.attr('disabled')).toBe(undefined);

    $el.atomAttr('data-test', null);
    expect($el.attr('data-test')).toBe(undefined);
  });

  it('atomProp (static)', () => {
    const $el = $('<input type="checkbox">');
    $el.atomProp('checked', true);
    expect($el.prop('checked')).toBe(true);
  });

  it('atomShow/Hide (static)', () => {
    // jQuery toggle/hide/show often requires element to be in DOM or at least behaves better
    const $el = $('<div>').appendTo(document.body);
    
    $el.atomShow(true);
    expect($el.css('display')).not.toBe('none');
    
    $el.atomShow(false);
    expect($el.css('display')).toBe('none');

    $el.atomHide(true);
    expect($el.css('display')).toBe('none');
    
    $el.atomHide(false);
    expect($el.css('display')).not.toBe('none');
    
    $el.remove();
  });

  it('atomVal (options: debounce, parse, format)', async () => {
    // Use real timers for reliability
    const val = $.atom(10);
    const $el = $('<input>');
    
    $el.atomVal(val, {
      debounce: 50,
      parse: (v) => parseInt(v, 10),
      format: (v) => `Value: ${v}`
    });

    await wait(10);
    // Initial format
    expect($el.val()).toBe('Value: 10');

    // DOM -> Atom (with debounce)
    $el.val('20');
    $el.trigger('input');
    
    expect(val.value).toBe(10); // Should not update yet
    
    await wait(60); // Wait for debounce
    expect(val.value).toBe(20); // Parsed value

    // Atom -> DOM (format)
    val.value = 30;
    await wait(10);
    expect($el.val()).toBe('Value: 30');
  });
});

describe('Full Coverage - Unified Bind (Static & Complex)', () => {
  it('atomBind (static properties)', () => {
    const $el = $('<div>');
    $el.atomBind({
      text: 'static text',
      // html property overwrites text if both are present, so we test html separately or accept overwrite
      // Removing html here to test text, will verify html in separate check for clarity
      // html: '<b>static</b>', 
      class: { active: true, inactive: false },
      css: { 
        opacity: 0.5,
        'font-size': [20, 'px']
      },
      attr: { 'data-id': '123', readonly: true },
      prop: { id: 'my-id' },
      show: true,
      hide: false
    });

    expect($el.text()).toBe('static text');
    expect($el.hasClass('active')).toBe(true);
    expect($el.hasClass('inactive')).toBe(false);
    expect(String($el.css('opacity'))).toMatch(/0\.5/);
    expect($el.css('font-size')).toBe('20px');
    expect($el.attr('data-id')).toBe('123');
    expect($el.attr('readonly')).toBe('readonly');
    expect($el.prop('id')).toBe('my-id');
    expect($el.css('display')).not.toBe('none');
    
    // Test html separately to ensure coverage of that branch
    const $el2 = $('<div>');
    $el2.atomBind({ html: '<b>static</b>' });
    expect($el2.html()).toBe('<b>static</b>');
  });

  it('atomBind (reactive css array & simple reactive)', async () => {
    const width = $.atom(100);
    const opacity = $.atom(0.5);
    const $el = $('<div>');

    $el.atomBind({
      css: {
        width: [width, 'px'],
        opacity: opacity
      }
    });

    await wait();
    expect($el.css('width')).toBe('100px');
    expect(String($el.css('opacity'))).toMatch(/0\.5/);

    width.value = 200;
    opacity.value = 1;
    await wait();

    expect($el.css('width')).toBe('200px');
    expect(String($el.css('opacity'))).toMatch(/1/);
  });

  it('atomBind (two-way val & checked)', async () => {
    const textVal = $.atom('');
    const checkVal = $.atom(false);
    const $input = $('<input type="text">');
    const $check = $('<input type="checkbox">');

    $input.atomBind({ val: textVal });
    $check.atomBind({ checked: checkVal });

    // Atom -> DOM
    textVal.value = 'hello';
    checkVal.value = true;
    await wait();

    expect($input.val()).toBe('hello');
    expect($check.prop('checked')).toBe(true);

    // DOM -> Atom
    $input.val('world').trigger('input');
    $check.prop('checked', false).trigger('change');
    
    // Unified binding might rely on debounce or similar? 
    // unified.ts implementation for val/checked is direct usually unless options passed?
    // unified.ts: batch(() => { atom.value = $el.val(); });
    // This is sync inside batch, but should reflect effectively immediately or next tick.
    
    await wait(); // Unified val might be instant but safer to wait
    
    expect(textVal.value).toBe('world');
    expect(checkVal.value).toBe(false);
  });
});
