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

  it('should support two-way checked binding via atomBind', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomBind({ checked: isChecked });

    // Atom -> DOM
    isChecked.value = true;
    await $.nextTick();
    expect($el.prop('checked')).toBe(true);

    // DOM -> Atom
    $el.prop('checked', false);
    $el[0].dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);

    $el.remove();
  });
});

// ============================================================================
// Red Phase: Pending structural improvements
// ============================================================================

describe('Red Phase: bindChecked Busy guard is dead code', () => {
  /**
   * SyncingToDom flag is set during Atom->DOM sync (el.checked = val).
   * However, assigning to el.checked does NOT fire a 'change' event natively.
   * Therefore, the Busy guard in the DOM->Atom handler can never block anything
   * during normal reactive sync. These tests document and verify that invariant.
   */

  it('native property assignment does not trigger change event', () => {
    // Verifies the core assumption: el.checked = x never fires 'change'
    const el = document.createElement('input');
    el.type = 'checkbox';
    document.body.appendChild(el);

    const changeHandler = vi.fn();
    el.addEventListener('change', changeHandler);

    el.checked = true; // Atom->DOM path
    expect(changeHandler).not.toHaveBeenCalled();

    el.removeEventListener('change', changeHandler);
    el.remove();
  });

  it('Busy guard never fires: change event from user only reaches atom when not busy', async () => {
    // Even if we could somehow set Busy before a change event,
    // the only way change fires is via dispatchEvent (user action simulation),
    // never from property assignment. This test proves the handler always runs
    // on simulated user input (Busy is always 0 at that point).
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);

    // Simulate user unchecking
    ($el[0] as HTMLInputElement).checked = false;
    $el[0].dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);

    // Simulate user checking
    ($el[0] as HTMLInputElement).checked = true;
    $el[0].dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(true);

    $el.remove();
  });

  it('removing Busy guard from handler does not change behavior', async () => {
    // If the Busy guard were removed, behavior should be identical.
    // This test shows the guard adds no observable protection.
    const isChecked = $.atom(true);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);
    await $.nextTick();
    expect(($el[0] as HTMLInputElement).checked).toBe(true);

    // Atom->DOM update (sets SyncingToDom flag during execution)
    isChecked.value = false;
    await $.nextTick();
    expect(($el[0] as HTMLInputElement).checked).toBe(false);

    // After Atom->DOM, Busy flag must be cleared (not stuck)
    // Subsequent user input must still reach atom
    ($el[0] as HTMLInputElement).checked = true;
    $el[0].dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(true); // would fail if Busy was stuck

    $el.remove();
  });
});

describe('Red Phase: bindVal effect registration symmetry with bindChecked', () => {
  /**
   * bindVal delegates effect creation to applyInputBinding which returns
   * { effect: fn, cleanup: fn }, and unified.ts wraps fn with effect() externally.
   * bindChecked creates effect() internally.
   * Both should behave identically regarding cleanup via atomUnbind.
   */

  it('atomUnbind disposes val effect (effect registered via external effect() wrap)', async () => {
    const val = $.atom('hello');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();
    expect($el.val()).toBe('hello');

    $el.atomUnbind();

    val.value = 'world';
    await $.nextTick();
    // Effect disposed: DOM should not update
    expect($el.val()).toBe('hello');

    $el.remove();
  });

  it('atomUnbind disposes checked effect (effect registered internally)', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);
    await $.nextTick();
    expect(($el[0] as HTMLInputElement).checked).toBe(false);

    $el.atomUnbind();

    isChecked.value = true;
    await $.nextTick();
    // Effect disposed: DOM should not update
    expect(($el[0] as HTMLInputElement).checked).toBe(false);

    $el.remove();
  });

  it('val cleanup removes event listeners after atomUnbind', async () => {
    const val = $.atom('a');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    $el.atomUnbind();

    // Simulate user input after unbind: atom should not change
    const el = $el[0] as HTMLInputElement;
    el.value = 'b';
    el.dispatchEvent(new Event('input'));

    expect(val.value).toBe('a');

    $el.remove();
  });
});
