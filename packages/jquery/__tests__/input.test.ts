import $ from 'jquery';
import { describe, expect, it } from 'vitest';
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
    $el.val('가 ');

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

  it('atomChecked Atom->DOM->Atom full cycle works correctly', async () => {
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

  it('atomUnbind disposes val effect and removes event listeners', async () => {
    const val = $.atom('hello');
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val);
    await $.nextTick();
    expect($el.val()).toBe('hello');

    $el.atomUnbind();

    // Atom -> DOM stopped
    val.value = 'world';
    await $.nextTick();
    expect($el.val()).toBe('hello');

    // DOM -> Atom stopped
    const el = $el[0] as HTMLInputElement;
    el.value = 'direct';
    el.dispatchEvent(new Event('input'));
    expect(val.value).toBe('world');

    $el.remove();
  });

  it('atomUnbind disposes checked effect', async () => {
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
});
