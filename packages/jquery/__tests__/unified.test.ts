import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Unified Bind', () => {
  it('should bind multiple properties', async () => {
    const text = $.atom('initial');
    const isActive = $.atom(false);

    const $el = $('<div>').appendTo(document.body);
    $el.atomBind({
      text: text,
      class: { active: isActive },
    });

    await $.nextTick();
    expect($el.text()).toBe('initial');
    expect($el.hasClass('active')).toBe(false);

    text.value = 'updated';
    isActive.value = true;
    await $.nextTick();
    expect($el.text()).toBe('updated');
    expect($el.hasClass('active')).toBe(true);

    $el.remove();
  });

  it('atomBind should support static properties', () => {
    const $el = $('<div>');
    $el.atomBind({
      text: 'static text',
      class: { active: true, inactive: false },
      css: {
        opacity: 0.5,
        'font-size': [20, 'px'],
      },
      attr: { 'data-id': '123', readonly: true },
      prop: { id: 'my-id' },
      show: true,
      hide: false,
    });

    expect($el.text()).toBe('static text');
    expect($el.hasClass('active')).toBe(true);
    expect($el.hasClass('inactive')).toBe(false);
    expect($el.css('font-size')).toBe('20px');
    expect($el.attr('data-id')).toBe('123');
    expect($el.attr('readonly')).toBe('readonly');
    expect($el.prop('id')).toBe('my-id');
    expect($el.css('display')).not.toBe('none');
  });

  it('atomBind should support reactive css and simple reactive values', async () => {
    const width = $.atom(100);
    const opacity = $.atom(0.5);
    const $el = $('<div>').appendTo(document.body);

    $el.atomBind({
      css: {
        width: [width, 'px'],
        opacity: opacity,
      },
    });

    await $.nextTick();
    expect($el.css('width')).toBe('100px');

    width.value = 200;
    opacity.value = 1;
    // CSS updates sometimes need a macrotask in JSDOM environment
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect($el.css('width')).toBe('200px');
    $el.remove();
  });

  it('atomBind should support two-way val and checked', async () => {
    const textVal = $.atom('');
    const checkVal = $.atom(false);
    const $input = $('<input type="text">');
    const $check = $('<input type="checkbox">');

    $input.atomBind({ val: textVal });
    $check.atomBind({ checked: checkVal });

    // Atom -> DOM
    textVal.value = 'hello';
    checkVal.value = true;
    await $.nextTick();

    expect($input.val()).toBe('hello');
    expect($check.prop('checked')).toBe(true);

    // DOM -> Atom
    $input.val('world').trigger('input');
    $check.prop('checked', false).trigger('change');

    expect(textVal.value).toBe('world');
    expect(checkVal.value).toBe(false);
  });

  it('atomBind should support reactive branches and events', async () => {
    const html = $.atom('<b>b</b>');
    const count = $.atom(0);
    const $el = $('<button>').appendTo(document.body);

    $el.atomBind({
      html,
      on: {
        click: () => {
          count.value++;
        },
      },
    });

    await $.nextTick();
    expect($el.html()).toBe('<b>b</b>');

    $el.trigger('click');
    expect(count.value).toBe(1);

    html.value = '<i>i</i>';
    await $.nextTick();
    expect($el.html()).toBe('<i>i</i>');

    $el.remove();
  });

  it('atomBind val should clean up event handlers on unbind', async () => {
    const val = $.atom('v');
    const $input = $('<input>').appendTo(document.body);
    const offSpy = vi.spyOn($.fn, 'off');

    $input.atomBind({ val });
    await $.nextTick();

    $input.atomUnbind();

    expect(offSpy).toHaveBeenCalledWith('input', expect.any(Function));
    expect(offSpy).toHaveBeenCalledWith('change', expect.any(Function));

    $input.remove();
    offSpy.mockRestore();
  });

  it('atomBind should support more reactive branches (attr, prop, show, hide)', async () => {
    const attrVal = $.atom<string | null>('initial');
    const propVal = $.atom(false);
    const showVal = $.atom(true);
    const hideVal = $.atom(false);
    const $el = $('<input>').appendTo(document.body);

    $el.atomBind({
      attr: { 'data-test': attrVal },
      prop: { disabled: propVal },
      show: showVal,
      hide: hideVal,
    });

    await $.nextTick();
    expect($el.attr('data-test')).toBe('initial');
    expect($el.prop('disabled')).toBe(false);
    expect($el.css('display')).not.toBe('none');

    // Update atoms
    attrVal.value = null; // Should remove attr (line 103)
    propVal.value = true;
    showVal.value = false;
    hideVal.value = true;
    await $.nextTick();

    expect($el.attr('data-test')).toBeUndefined();
    expect($el.prop('disabled')).toBe(true);
    expect($el.css('display')).toBe('none');

    $el.remove();
  });

  it('atomBind should handle static null/undefined html', () => {
    const $el = $('<div>');
    $el.atomBind({ html: null as unknown as string });
    expect($el.html()).toBe('');

    const $el2 = $('<div>');
    $el2.atomBind({ html: undefined as unknown as string });
    expect($el2.html()).toBe('');
  });

  it('atomBind should support [atom, options] for val', async () => {
    const val = $.atom(0);
    const $el = $('<input>').appendTo(document.body);

    $el.atomBind({
      val: [val, { format: (v) => `N:${v}`, parse: (v) => parseInt(v.replace('N:', ''), 10) }],
    });

    await $.nextTick();
    expect($el.val()).toBe('N:0');

    $el.val('N:100').trigger('input');
    await $.nextTick();
    expect(val.value).toBe(100);

    $el.remove();
  });

  it('atomBind reactive branches (text, html, checked cycle)', async () => {
    // line 36-41 (bindText reactive), 48 (bindHtml reactive)
    const textVal = $.atom<string | null>('val');
    const htmlVal = $.atom<string | null>('<b>b</b>');
    const checkedVal = $.atom(false);
    const $elText = $('<div>').appendTo(document.body);
    const $elHtml = $('<div>').appendTo(document.body);
    const $check = $('<input type="checkbox">').appendTo(document.body);

    $elText.atomBind({ text: textVal });
    $elHtml.atomBind({ html: htmlVal as unknown as string });
    $check.atomBind({ checked: checkedVal });

    await $.nextTick();
    expect($elText.text()).toBe('val');
    expect($elHtml.html()).toBe('<b>b</b>');

    // hit null branch in bindText/bindHtml
    textVal.value = null;
    htmlVal.value = null;
    await $.nextTick();
    expect($elText.text()).toBe('');
    expect($elHtml.html()).toBe('');

    // line 181: if (state.phase !== 'idle') return; in bindChecked
    const originalProp = $.fn.prop;
    type PropFn = (this: JQuery, name: string, value?: unknown) => JQuery | boolean | undefined;
    ($.fn.prop as PropFn) = function (this: JQuery, name: string, value?: unknown) {
      const res = (originalProp as PropFn).call(this, name, value);
      if (name === 'checked' && value !== undefined) {
        this.trigger('change');
      }
      return res;
    };

    checkedVal.value = true;
    await $.nextTick();

    $.fn.prop = originalProp;
    $elText.remove();
    $elHtml.remove();
    $check.remove();
  });
});
