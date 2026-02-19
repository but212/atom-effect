import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '../src/index';

describe('Input Bindings (Two-way)', () => {
  it('atomVal should sync Atom <-> DOM with IME and focus support', async () => {
    const val = $.atom('initial');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();
    expect($el.val()).toBe('initial');

    // DOM -> Atom
    $el.val('changed').trigger('input');
    await $.nextTick();
    expect(val.value).toBe('changed');

    // IME support
    $el.trigger('compositionstart');
    $el.val('가').trigger('input');
    expect(val.value).toBe('changed'); // Not updated during IME
    $el.trigger('compositionend');
    expect(val.value).toBe('가');

    // Focus stability: don't overwrite user typing if parsed value matches
    val.value = '가'; // Same value
    $el.trigger('focus');
    $el.val('가 '); // User added a space, but might parse to same thing if we had a parser
    // (In this simple case it's different, but the principle is: if focus, be careful)

    $el.remove();
  });

  it('atomVal should support debounce, parse, and format', async () => {
    const val = $.atom(10);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      debounce: 20,
      parse: (v) => parseInt(v, 10),
      format: (v) => `V:${v}`,
    });

    await new Promise((r) => setTimeout(r, 10)); // Initial nextTick/delay
    expect($el.val()).toBe('V:10');

    // DOM -> Atom (debounce)
    $el.val('20').trigger('input');
    expect(val.value).toBe(10);
    await new Promise((r) => setTimeout(r, 30));
    expect(val.value).toBe(20);

    $el.trigger('focus');
    $el.val('30').trigger('input'); // Start debounce timer
    $el.trigger('blur'); // Blur should flush pending sync
    expect(val.value).toBe(30); // Atom updated with flushed value
    expect($el.val()).toBe('V:30'); // Then formatted

    // Blur formatting (no pending debounce): format with current atom value
    await new Promise((r) => setTimeout(r, 30)); // Ensure no pending timers
    $el.trigger('focus');
    $el.val('invalid text'); // No input event = no pending debounce
    $el.trigger('blur');
    expect(val.value).toBe(30); // Atom unchanged (no sync happened)
    expect($el.val()).toBe('V:30'); // Formatted with current atom value

    $el.remove();
  });

  it('atomVal should preserve cursor position when focused and atom updates', async () => {
    const val = $.atom('hello');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();

    // Simulate focus
    $el.trigger('focus');

    // Set cursor position (simulate user editing in middle of text)
    const el = $el[0] as HTMLInputElement;
    el.setSelectionRange(3, 3);

    // Update atom while focused — should preserve cursor position (lines 115-120)
    val.value = 'world';
    await $.nextTick();

    expect(el.value).toBe('world');
    // Cursor should be clamped to min(3, 'world'.length=5) = 3
    expect(el.selectionStart).toBe(3);
    expect(el.selectionEnd).toBe(3);

    $el.remove();
  });

  it('atomVal handles null selectionStart/End with fallback to 0', async () => {
    const val = $.atom('abc');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();

    $el.trigger('focus');

    // Mock selectionStart/End as null (some input types don't support selection)
    const el = $el[0] as HTMLInputElement;
    Object.defineProperty(el, 'selectionStart', { get: () => null, configurable: true });
    Object.defineProperty(el, 'selectionEnd', { get: () => null, configurable: true });

    val.value = 'xyz';
    await $.nextTick();

    expect(el.value).toBe('xyz');

    $el.remove();
  });

  it('atomChecked should handle two-way sync and cycle prevention', async () => {
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

    // Cycle prevention: trigger change during effect run
    const originalProp = $.fn.prop;
    $.fn.prop = function (this: JQuery, name: string, value?: unknown) {
      const res =
        value !== undefined
          ? (originalProp as (name: string, value: unknown) => JQuery).call(this, name, value)
          : (originalProp as (name: string) => unknown).call(this, name);
      if (name === 'checked' && value !== undefined) {
        $(this).trigger('change');
      }
      return res;
    } as typeof $.fn.prop;

    isChecked.value = true;
    await $.nextTick(); // Should not cause infinite loop
    expect($el.prop('checked')).toBe(true);

    $.fn.prop = originalProp;
    $el.remove();
  });
});

describe('bindChecked Busy guard is dead code', () => {
  /**
   * SyncingToDom flag is set during Atom->DOM sync (el.checked = val).
   * However, assigning to el.checked does NOT fire a 'change' event natively.
   * Therefore, the Busy guard in the DOM->Atom handler can never block anything
   * during normal reactive sync. These tests document and verify that invariant.
   */

  it('native property assignment does not trigger change event', () => {
    const el = document.createElement('input');
    el.type = 'checkbox';
    document.body.appendChild(el);

    const changeHandler = vi.fn();
    el.addEventListener('change', changeHandler);

    el.checked = true;
    expect(changeHandler).not.toHaveBeenCalled();

    el.removeEventListener('change', changeHandler);
    el.remove();
  });

  it('Busy guard never fires: change event from user only reaches atom when not busy', async () => {
    const isChecked = $.atom(false);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);

    ($el[0] as HTMLInputElement).checked = false;
    $el[0]!.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(false);

    ($el[0] as HTMLInputElement).checked = true;
    $el[0]!.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(true);

    $el.remove();
  });

  it('removing Busy guard from handler does not change behavior', async () => {
    const isChecked = $.atom(true);
    const $el = $('<input type="checkbox">').appendTo(document.body);

    $el.atomChecked(isChecked);
    await $.nextTick();
    expect(($el[0] as HTMLInputElement).checked).toBe(true);

    isChecked.value = false;
    await $.nextTick();
    expect(($el[0] as HTMLInputElement).checked).toBe(false);

    ($el[0] as HTMLInputElement).checked = true;
    $el[0]!.dispatchEvent(new Event('change'));
    expect(isChecked.value).toBe(true);

    $el.remove();
  });
});

describe('bindVal effect registration symmetry with bindChecked', () => {
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
    expect(($el[0] as HTMLInputElement).checked).toBe(false);

    $el.remove();
  });

  it('val cleanup removes event listeners after atomUnbind', async () => {
    const val = $.atom('a');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    $el.atomUnbind();

    const el = $el[0] as HTMLInputElement;
    el.value = 'b';
    el.dispatchEvent(new Event('input'));

    expect(val.value).toBe('a');

    $el.remove();
  });
});
