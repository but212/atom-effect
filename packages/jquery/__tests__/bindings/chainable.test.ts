import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '@/index';

describe('Chainable Methods: One-Way Bindings', () => {
  it('atomText & atomHtml: basic content binding', async () => {
    const text = $.atom('text');
    const html = $.atom('<b>html</b>');
    const $el = $('<div>').appendTo(document.body);

    $el.atomText(text);
    await $.nextTick();
    expect($el.text()).toBe('text');

    $el.atomHtml(html);
    await $.nextTick();
    expect($el.html()).toBe('<b>html</b>');

    $el.remove();
  });

  it('atomClass: handles multiple classes with overlapping protection', async () => {
    const a1 = $.atom(true);
    const a2 = $.atom(true);
    const isActive = $.atom(false);
    const $el = $('<div>').appendTo(document.body);

    // Initial state
    $el.atomClass(' bg-red-500  font-bold ', isActive);
    $el.atomClass({ 'active highlight': a1, 'active large': a2 });

    await $.nextTick();
    expect($el.hasClass('bg-red-500')).toBe(false);
    expect($el.hasClass('active highlight large')).toBe(true);

    // bug prevention: if a1 becomes false, 'active' should NOT be removed because a2 still needs it
    a1.value = false;
    await $.nextTick();
    expect($el.hasClass('highlight')).toBe(false);
    expect($el.hasClass('active')).toBe(true);

    // Static toggle
    isActive.value = true;
    await $.nextTick();
    expect($el.hasClass('bg-red-500')).toBe(true);

    $el.remove();
  });

  it('atomCss: supports units and value updates', async () => {
    const opacity = $.atom(0.5);
    const width = $.atom(100);
    const $el = $('<div>').appendTo(document.body);

    $el.atomCss({ opacity, width: [width, 'px'] });

    await $.nextTick();
    expect($el.css('opacity')).toBe('0.5');
    expect($el.css('width')).toBe('100px');

    width.value = 200;
    await $.nextTick();
    expect($el.css('width')).toBe('200px');

    $el.remove();
  });

  it('atomCss: single property with unit option', async () => {
    const width = $.atom(120);
    const $el = $('<div>').appendTo(document.body);

    $el.atomCss('width', width, 'px');
    await $.nextTick();
    expect($el.css('width')).toBe('120px');

    $el.remove();
  });

  it('atomAttr: attribute lifecycle and ARIA boolean handling', async () => {
    const expanded = $.atom(true);
    const disabled = $.atom(false);
    const title = $.atom<string | null>('initial');
    const $el = $('<button>').appendTo(document.body);

    $el.atomAttr({ 'aria-expanded': expanded, disabled, title });

    await $.nextTick();
    expect($el.attr('aria-expanded')).toBe('true');
    expect($el.attr('disabled')).toBeUndefined();
    expect($el.attr('title')).toBe('initial');

    expanded.value = false;
    title.value = null;
    await $.nextTick();
    expect($el.attr('aria-expanded')).toBe('false');
    expect($el.attr('title')).toBeUndefined();

    $el.remove();
  });

  it('atomProp: basic property binding', async () => {
    const id = $.atom('my-id');
    const $el = $('<div>').appendTo(document.body);

    $el.atomProp('id', id);
    await $.nextTick();
    expect($el[0]?.id).toBe('my-id');

    $el.remove();
  });

  it('atomShow/Hide: preserves original style and supports subsequent changes', async () => {
    const isVisible = $.atom(true);
    const isHidden = $.atom(false);
    const $el = $('<div style="display: block;">').appendTo(document.body);

    $el.atomShow(isVisible).atomHide(isHidden);
    await $.nextTick();
    expect($el.css('display')).toBe('block');

    // Manually change base style to flex
    $el.css('display', 'flex');

    isVisible.value = false;
    await $.nextTick();
    expect($el[0]?.style.display).toBe('none');

    isVisible.value = true;
    await $.nextTick();
    // Should revert to 'flex', not 'block'
    expect($el.css('display')).toBe('flex');

    $el.remove();
  });
});

describe('Chainable Methods: Two-Way Bindings', () => {
  it('atomVal: two-way sync for input elements', async () => {
    const val = $.atom('test');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();
    expect($el.val()).toBe('test');

    $el.val('new').trigger('input');
    expect(val.value).toBe('new');

    $el.remove();
  });

  it('atomChecked: syncs checkbox and radio (User & Programmatic Sync)', async () => {
    const check = $.atom(true);
    const rA = $.atom(true);
    const rB = $.atom(false);
    const radioName = 'user[role]';

    const $form = $('<form>').appendTo(document.body);
    const $check = $('<input type="checkbox">').appendTo($form);
    const $rA = $(`<input type="radio" name="${radioName}" value="A">`).appendTo($form);
    const $rB = $(`<input type="radio" name="${radioName}" value="B">`).appendTo($form);

    $check.atomChecked(check);
    $rA.atomChecked(rA);
    $rB.atomChecked(rB);

    await $.nextTick();
    expect($check.prop('checked')).toBe(true);

    // 1. Checkbox toggle
    $check.prop('checked', false).trigger('change');
    expect(check.value).toBe(false);

    // 2. Radio interaction (rB checked -> rA becomes false)
    $rB.prop('checked', true).trigger('change');
    await $.nextTick();
    expect(rB.value).toBe(true);
    expect(rA.value).toBe(false);

    // 3. Programmatic update (rA atom = true -> rB atom must become false)
    rA.value = true;
    await $.nextTick();
    expect($rA.prop('checked')).toBe(true);
    expect($rB.prop('checked')).toBe(false);
    expect(rB.value).toBe(false);

    $form.remove();
  });

  it('atomForm: recursive form data binding', async () => {
    const data = $.atom({ user: { name: 'alice' } });
    const $form = $('<form><input name="user[name]"></form>').appendTo(document.body);

    $form.atomForm(data);
    await $.nextTick();
    const $input = $form.find('input');
    expect($input.val()).toBe('alice');

    $input.val('bob').trigger('input');
    await $.nextTick();
    expect(data.value.user.name).toBe('bob');

    $form.remove();
  });

  it('atomChecked: radio unregistration handles detached elements correctly without memory leaks', async () => {
    const val1 = $.atom(true);
    const val2 = $.atom(false);
    const $form = $('<form>').appendTo(document.body);
    const $radio1 = $('<input type="radio" name="leak-test" value="A">').appendTo($form);
    const $radio2 = $('<input type="radio" name="leak-test" value="B">').appendTo($form);

    $radio1.atomChecked(val1);
    $radio2.atomChecked(val2);
    await $.nextTick();

    // Detach the element from the form/DOM before unbinding
    $radio1.detach();

    // Perform unbind (which triggers cleanup)
    $radio1.atomUnbind();
    await $.nextTick();

    // Attach a spy event handler to the detached element after unbinding
    const spy = vi.fn();
    $radio1.on('change.atomRadioSync', spy);

    // Trigger changes on the peer radio button (which triggers syncRadios internally)
    const radio2El = $radio2[0] as HTMLInputElement;
    radio2El.checked = true;
    $radio2.trigger('change');
    await $.nextTick();

    // If unregistration was successful and there is no memory leak,
    // the detached radio1 should NOT receive event synchronization.
    expect(spy).not.toHaveBeenCalled();

    $form.remove();
  });

  it('atomChecked: respects Shadow DOM encapsulation for radio buttons without enclosing form', async () => {
    // Create two host elements for Shadow DOM
    const $hostA = $('<div id="host-a"></div>').appendTo(document.body);
    const $hostB = $('<div id="host-b"></div>').appendTo(document.body);

    const hostA = $hostA[0];
    const hostB = $hostB[0];
    if (!hostA || !hostB) throw new Error('Host elements not found');

    const shadowA = hostA.attachShadow({ mode: 'open' });
    const shadowB = hostB.attachShadow({ mode: 'open' });

    // Inside shadowA (no form)
    const $divA = $(`
      <div>
        <input type="radio" name="option" value="A1" id="r-a1">
        <input type="radio" name="option" value="A2" id="r-a2">
      </div>
    `).appendTo(shadowA);

    // Inside shadowB (no form)
    const $divB = $(`
      <div>
        <input type="radio" name="option" value="B1" id="r-b1">
        <input type="radio" name="option" value="B2" id="r-b2">
      </div>
    `).appendTo(shadowB);

    const rA1 = $.atom(true);
    const rA2 = $.atom(false);
    const rB1 = $.atom(true);
    const rB2 = $.atom(false);

    $divA.find('#r-a1').atomChecked(rA1);
    $divA.find('#r-a2').atomChecked(rA2);
    $divB.find('#r-b1').atomChecked(rB1);
    $divB.find('#r-b2').atomChecked(rB2);

    await $.nextTick();

    // Verify initial states
    expect($divA.find('#r-a1').prop('checked')).toBe(true);
    expect($divA.find('#r-a2').prop('checked')).toBe(false);
    expect($divB.find('#r-b1').prop('checked')).toBe(true);
    expect($divB.find('#r-b2').prop('checked')).toBe(false);

    // Act: Check rA2 (should uncheck rA1, but NOT affect shadowB radio buttons!)
    $divA.find('#r-a2').prop('checked', true).trigger('change');
    await $.nextTick();

    expect(rA2.value).toBe(true);
    expect(rA1.value).toBe(false);

    // Verify shadowB is completely unaffected
    expect(rB1.value).toBe(true);
    expect(rB2.value).toBe(false);
    expect($divB.find('#r-b1').prop('checked')).toBe(true);
    expect($divB.find('#r-b2').prop('checked')).toBe(false);

    // Cleanup
    $divA.find('#r-a1').atomUnbind();
    $divA.find('#r-a2').atomUnbind();
    $divB.find('#r-b1').atomUnbind();
    $divB.find('#r-b2').atomUnbind();

    $hostA.remove();
    $hostB.remove();
  });
});

describe('atomBind: Integrated Binding', () => {
  it('combines multiple behaviors and supports tuples', async () => {
    const text = $.atom(1);
    const val = $.atom('init');
    const $el = $('<input>').appendTo(document.body);

    $el.atomBind({
      text: [text, (v: number) => `V:${v}`],
      val,
      attr: { 'data-bound': $.atom(true) },
    });

    await $.nextTick();
    expect($el.text()).toBe('V:1');
    expect($el.val()).toBe('init');
    expect($el.attr('data-bound')).toBe('data-bound');

    text.value = 2;
    await $.nextTick();
    expect($el.text()).toBe('V:2');

    $el.remove();
  });

  it('should cover all option tasks in atomBind (html, show, hide, checked, form, on, class, css, prop)', async () => {
    const html = $.atom('<b>html</b>');
    const show = $.atom(true);
    const hide = $.atom(false);
    const checked = $.atom(true);
    const formVal = $.atom({ name: 'test' });
    const clicked = vi.fn();
    const active = $.atom(true);
    const opacity = $.atom(0.8);
    const id = $.atom('my-id');

    const $div = $('<div>').appendTo(document.body);
    $div.atomBind({ html });

    const $form = $('<form><input name="name"><input type="checkbox" id="cb"></form>').appendTo(
      document.body
    );
    const $cb = $form.find('#cb');
    $cb.atomBind({ checked });
    $form.atomBind({
      show,
      hide,
      form: formVal,
      on: { click: clicked },
      class: { active },
      css: { opacity },
      prop: { id },
    });

    await $.nextTick();
    expect($div.html()).toContain('<b>html</b>');
    expect($form.css('display')).not.toBe('none');
    expect($cb.prop('checked')).toBe(true);
    expect($form.find('input[name="name"]').val()).toBe('test');
    expect($form.hasClass('active')).toBe(true);
    expect($form.css('opacity')).toBe('0.8');
    expect($form.prop('id')).toBe('my-id');

    $form.trigger('click');
    expect(clicked).toHaveBeenCalled();

    $div.remove();
    $form.remove();
  });

  it('atomBind: form task on non-form elements should not throw', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const $div = $('<div>').appendTo(document.body);
    const data = $.atom({});

    $div.atomBind({ form: data });
    expect(warnSpy).not.toHaveBeenCalled();
    $div.remove();
    warnSpy.mockRestore();
  });
});

describe('Events & Lifecycle', () => {
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

  it('unpacking handles null or undefined as second argument without crashing', async () => {
    const el = document.createElement('div');
    const val = $.atom(10);
    // Passing null to ensure the unpack logic respects the tuple shape.
    expect(() => {
      $(el).atomBind({
        // biome-ignore lint/suspicious/noExplicitAny: testing edge case null options
        val: [val, null as any],
      });
    }).not.toThrow();

    expect(() => {
      $(el).atomBind({
        // biome-ignore lint/suspicious/noExplicitAny: testing edge case undefined options
        val: [val, undefined as any],
      });
    }).not.toThrow();
  });

  it('atomUnbind: recursively stops reactivity for root and descendants', async () => {
    const outer = $.atom('O');
    const inner = $.atom('I');
    const $outer = $('<div>').appendTo(document.body);
    const $inner = $('<span>').appendTo($outer);

    $outer.atomAttr('data-val', outer);
    $inner.atomText(inner);

    await $.nextTick();
    $outer.atomUnbind();

    outer.value = 'X';
    inner.value = 'Y';
    await $.nextTick();

    expect($outer.attr('data-val')).toBe('O');
    expect($inner.text()).toBe('I');

    $outer.remove();
  });
});

describe('Safety & Robustness', () => {
  it('Security: blocks dangerous attributes and properties', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const $el = $('<div>');

    $el.atomAttr('onclick', $.atom('alert(1)'));
    $el.atomProp('innerHTML', $.atom('<script>'));

    await $.nextTick();
    expect($el.attr('onclick')).toBeUndefined();
    expect($el.html()).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('Guards: warns on invalid use cases', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const $div = $('<div>');
    const $input = $('<input>');

    // Non-input atomVal
    $div.atomVal($.atom(''));
    // @ts-expect-error
    $input.atomClass('active');

    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  it('Robustness: multi-element sets and static arrays', async () => {
    const text = $.atom('hi');
    const $els = $('<span></span><span></span>').appendTo(document.body);
    const $mixed = $els.add(document.createTextNode('skip'));

    $mixed.atomText(text);
    await $.nextTick();
    expect($els.eq(0).text()).toBe('hi');
    expect($els.eq(1).text()).toBe('hi');

    // Should not confuse static array with a tuple in atomText
    const staticArray = ['a', 'b'];
    $els.eq(0).atomText(staticArray);
    await $.nextTick();
    expect($els.eq(0).text()).toMatch(/a,?b/);

    $els.remove();
  });

  it('Guards: warns when atomForm is called on non-Form element', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const $div = $('<div>');
    $div.atomForm($.atom({}));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('atomChecked: warns on non-input element', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const $div = $('<div>');
    $div.atomChecked($.atom(true));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('atomProp: blocks dangerous URL properties', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const $el = $('<img>');
    $el.atomProp('src', $.atom('javascript:alert(1)'));
    await $.nextTick();
    expect(($el[0] as HTMLImageElement | undefined)?.src).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('resolveArgs: should handle null/falsy map gracefully', () => {
    const $el = $('<div>');
    // @ts-expect-error
    $el.atomClass(null);
    expect($el).toBeInstanceOf($);
  });
});
