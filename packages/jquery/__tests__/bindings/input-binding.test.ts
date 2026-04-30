import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import '@/index';

describe('Input Bindings (Two-way)', () => {
  // --- 1. Basic Synchronization & Data Transformation ---
  it('should sync values between Atom and DOM with parse/format/debounce', async () => {
    const val = $.atom(10);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      debounce: 20,
      parse: (v) => parseInt(v, 10),
      format: (v) => `V:${v}`,
    });

    // Initial sync (awaiting initial effect + potential debounce tick)
    await new Promise((r) => setTimeout(r, 40));
    expect($el.val()).toBe('V:10');

    // DOM -> Atom with debounce
    $el.val('25').trigger('input');
    expect(val.value).toBe(10); // Not yet
    await new Promise((r) => setTimeout(r, 30));
    expect(val.value).toBe(25);

    // Focus stability: don't overwrite user typing if functionally equivalent
    $el.trigger('focus');
    $el.val('25.0'); // parse("25.0") is 25, which matches atom
    val.value = 25; // Re-trigger effect with same value
    await $.nextTick();
    expect($el.val()).toBe('25.0'); // Should NOT be formatted back to "V:25" while focused

    $el.remove();
  });

  // --- 2. IME & Blur Stability (Core UX Logic) ---
  it('should maintain stability during IME composition and handle blur correctly', async () => {
    const val = $.atom('initial');
    let syncCount = 0;

    const $el = $('<input>').appendTo(document.body);
    const el = $el[0] as HTMLInputElement;

    // Track atom setter calls to detect redundant syncs
    Object.defineProperty(val, 'value', {
      get: () => val.peek(),
      set: (v) => {
        syncCount++;
        // @ts-expect-error - accessing internal atom state for testing
        val._value = v;
      },
      configurable: true,
    });

    $el.atomVal(val);
    await $.nextTick();
    syncCount = 0; // Reset after initial sync

    // Start IME composition
    $el.trigger('focus').trigger('compositionstart');
    el.value = '가';

    // IME Stability: Atom update from outside should not overwrite DOM
    val.value = 'external';
    await $.nextTick();
    expect(el.value).toBe('가'); // DOM preserved

    syncCount = 0; // Reset count before blur sync
    // Blur during composition: Should sync once and avoid duplicate calls
    $el.trigger('blur');
    expect(val.value).toBe('가');
    expect(syncCount).toBe(1); // Must be exactly 1

    $el.remove();
  });

  // --- 3. Cursor Preservation & Type Safety ---
  it('should preserve cursor position and handle selection-restricted types', async () => {
    const val = $.atom('hello');
    const $text = $('<input type="text">').appendTo(document.body);
    const $num = $('<input type="number">').appendTo(document.body);

    $text.atomVal(val);
    $num.atomVal($.atom(123));
    await $.nextTick();

    // Cursor preservation
    $text.trigger('focus');
    ($text[0] as HTMLInputElement).setSelectionRange(2, 2);
    val.value = 'world'; // Remote update
    await $.nextTick();
    expect(($text[0] as HTMLInputElement).selectionStart).toBe(2);

    // Should not throw when accessing selection properties on type="number"
    $num.trigger('focus');
    await $.nextTick(); // Validation: accessing el.selectionStart on number should be safely handled

    $text.remove();
    $num.remove();
  });

  // --- 4. Checkboxes & Multiple Select ---
  it('should handle boolean and collection bindings (checkbox, select-multiple)', async () => {
    // Checkbox with Cycle Prevention
    const isChecked = $.atom(false);
    const $cb = $('<input type="checkbox">').appendTo(document.body);
    $cb.atomChecked(isChecked);
    await $.nextTick();

    isChecked.value = true;
    await $.nextTick();
    expect($cb.prop('checked')).toBe(true);

    // Simulate potential infinite loop via manual trigger in prop setter
    const originalProp = $.fn.prop;
    $.fn.prop = function (this: HTMLElement, ...args: unknown[]) {
      const res = (originalProp as (...a: unknown[]) => unknown).apply($(this), args);
      const [name, val] = args;
      if (name === 'checked' && val !== undefined) $(this).trigger('change');
      return res;
    } as unknown as typeof $.fn.prop;

    isChecked.value = false;
    await $.nextTick();
    expect($cb.prop('checked')).toBe(false);
    $.fn.prop = originalProp;

    // Multiple Select
    const list = $.atom(['A', 'C']);
    const $sel = $(`
      <select multiple>
        <option value="A">A</option>
        <option value="B">B</option>
        <option value="C">C</option>
      </select>
    `).appendTo(document.body);
    $sel.atomVal(list);
    await $.nextTick();
    expect($sel.val()).toEqual(['A', 'C']);

    $cb.remove();
    $sel.remove();
  });

  // --- 5. Lifecycle & Cleanup ---
  it('should dispose all effects and remove event listeners on unbind', async () => {
    const val = $.atom('initial');
    const $el = $('<input>').appendTo(document.body);

    // Multiple namespaced events test
    $el.atomVal(val, { event: 'custom-a custom-b' });
    await $.nextTick();

    $el.atomUnbind();

    // DOM -> Atom stopped
    $el.val('changed').trigger('custom-a');
    expect(val.value).toBe('initial');

    // Atom -> DOM stopped
    val.value = 'external';
    await $.nextTick();
    expect($el.val()).toBe('changed');

    $el.remove();
  });

  // --- 6. Performance & Strict Normalization ---
  it('should normalize DOM value on blur even if parsed value matches atom', async () => {
    const val = $.atom(10);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      parse: (v) => parseInt(v, 10),
      format: (v) => `V:${v}`,
    });

    await $.nextTick();
    expect($el.val()).toBe('V:10');

    // 1. Focus and type something functionally equivalent but string-different
    $el.trigger('focus');
    $el.val('10.0'); // parse("10.0") is 10, which matches atom.peek()
    $el.trigger('input');

    expect(val.value).toBe(10);
    expect($el.val()).toBe('10.0'); // DOM preserved while focused (Focus Stability)

    // 2. Blur the element
    $el.trigger('blur');

    // DOM SHOULD be normalized back to "V:10" now that focus is lost
    expect($el.val()).toBe('V:10');

    $el.remove();
  });

  it('should not perform redundant DOM writes if value is up-to-date', async () => {
    const val = $.atom('initial');
    const $el = $('<input>').appendTo(document.body);
    const el = $el[0] as HTMLInputElement;

    $el.atomVal(val);
    await $.nextTick();

    let writeCount = 0;
    const originalDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

    // Spy on the element.value setter
    Object.defineProperty(el, 'value', {
      get: function () {
        return originalDescriptor?.get?.call(this);
      },
      set: function (v) {
        writeCount++;
        originalDescriptor?.set?.call(this, v);
      },
      configurable: true,
    });

    // Case: Atom updates normally
    writeCount = 0;
    val.value = 'second';
    await $.nextTick();
    expect(writeCount).toBe(1);

    // Case: User types something, Atom updates, Effect triggers.
    // In this case, DOM is ALREADY 'third'. The effect should see this and NOT write again.
    $el.val('third');
    writeCount = 0;
    $el.trigger('input');
    expect(val.value).toBe('third');
    await $.nextTick();

    // Redundant write count should be 0
    expect(writeCount).toBe(0);

    $el.remove();
  });

  it('should log warnings when synchronization fails (Error Logging)', async () => {
    const warnSpy = vi.spyOn($.debug, 'warn').mockImplementation(() => {});
    $.debug.enabled = true;

    const val = $.atom(1);
    const $el = $('<input>').appendTo(document.body);

    $el.atomVal(val, {
      parse: () => {
        throw new Error('Parse error');
      },
    });

    $el.val('2').trigger('input');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('atom-binding'),
      expect.stringContaining('syncToAtom failed'),
      expect.any(Error)
    );

    $el.remove();
  });
});
