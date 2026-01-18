import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '../src/index';
import { applyInputBinding } from '../src/input-binding';

describe('Input Binding', () => {
  it('should sync Atom -> DOM and respect hasFocus', async () => {
    const atom = $.atom('initial');
    const $el = $('<input>').appendTo(document.body);
    const { effect } = applyInputBinding($el, atom);

    // Initial sync
    effect();
    expect($el.val()).toBe('initial');

    // Update from atom
    atom.value = 'updated';
    effect();
    expect($el.val()).toBe('updated');

    // Simulate focus
    $el.trigger('focus');
    $el.val('typing');

    // When focused, if the typed value parses/formats to what atom currently has, it shouldn't overwrite
    // But here atom is 'updated', while $el is 'typing'.
    // If we set atom.value to what 'typing' would be, it should still skip if hasFocus and parsed matches.

    atom.value = 'typing';
    effect();
    // It should NOT overwrite while focused if atom value matches parsed input
    // and we are NOT in syncing-to-dom phase from this effect (which we are not yet)
    // Actually the logic is: if (state.hasFocus && parse(currentVal) === atom.value) return;
    expect($el.val()).toBe('typing');

    $el.remove();
  });

  it('should format on blur', () => {
    const atom = $.atom(123);
    const $el = $('<input>').appendTo(document.body);
    const { effect } = applyInputBinding($el, atom, {
      format: (v) => `VAL:${v}`,
    });

    effect();
    expect($el.val()).toBe('VAL:123');

    $el.trigger('focus');
    $el.val('user is editing');

    $el.trigger('blur');
    // On blur, it should restore formatted value
    expect($el.val()).toBe('VAL:123');

    $el.remove();
  });

  it('should handle IME composition', () => {
    const atom = $.atom('');
    const $el = $('<input>').appendTo(document.body);
    applyInputBinding($el, atom);

    $el.trigger('compositionstart');
    $el.val('ㄱ');
    $el.trigger('input');

    // Should not sync to atom during composition
    expect(atom.value).toBe('');

    $el.val('가');
    $el.trigger('compositionend');

    // Should sync to atom after composition end
    expect(atom.value).toBe('가');

    $el.remove();
  });

  it('atomVal should support complex options (debounce, parse, format)', async () => {
    const val = $.atom(10);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      debounce: 50,
      parse: (v) => parseInt(v, 10),
      format: (v) => `VAL:${v}`,
    });

    await new Promise((r) => setTimeout(r, 10));
    expect($el.val()).toBe('VAL:10');

    // DOM -> Atom (with debounce)
    $el.val('20').trigger('input');
    expect(val.value).toBe(10); // Not updated yet

    await new Promise((r) => setTimeout(r, 60));
    expect(val.value).toBe(20);

    // Atom -> DOM (format)
    val.value = 30;
    await new Promise((r) => setTimeout(r, 10));
    expect($el.val()).toBe('VAL:30');

    $el.remove();
  });

  it('atomVal should update immediately without debounce', async () => {
    const val = $.atom('initial');
    const $input = $('<input>').appendTo(document.body);
    $input.atomVal(val);

    await new Promise((r) => setTimeout(r, 10));
    $input.val('changed').trigger('input');

    // Default update should be relatively immediate (nextTick)
    await $.nextTick();
    expect(val.value).toBe('changed');

    $input.remove();
  });

  it('atomVal should not overwrite if typed value parses to same atom value', async () => {
    // atom value is 100
    const val = $.atom(100);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      parse: (v) => parseInt(v, 10),
      format: (v) => String(v),
    });

    await $.nextTick();
    expect($el.val()).toBe('100');

    // User types "100.0" -> parses to 100
    $el.trigger('focus');
    $el.val('100.0');

    // Atom updates to 100 (same value)
    val.value = 100;
    await $.nextTick();

    // Should NOT overwrite user's "100.0" with "100" because it parses to same thing
    expect($el.val()).toBe('100.0');

    $el.remove();
  });
});
