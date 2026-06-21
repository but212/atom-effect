import $ from 'jquery';
import { describe, expect, it, vi } from 'vitest';
import type { EqualFn } from '@/types';
import { setupDOMCleanup } from '../utils/test-helpers';
import '@/index';

describe('Input Bindings (Two-way)', () => {
  const { appendToBody } = setupDOMCleanup();

  describe('Core Synchronization', () => {
    it('should sync values between Atom and DOM with parse/format/debounce', async () => {
      const val = $.atom(10);
      const $el = appendToBody('<input>');

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
    });

    it('should clear debounce timer on blur', async () => {
      vi.useFakeTimers();
      const val = $.atom('init');
      const $el = appendToBody('<input>');

      $el.atomVal(val, { debounce: 100 });
      await $.nextTick();

      $el.trigger('focus');
      $el.val('typed').trigger('input');
      // Blur immediately
      $el.trigger('blur');

      // Debounce timer should be cleared
      vi.advanceTimersByTime(200);
      await $.nextTick();
      expect(val.value).toBe('typed');
    });

    it('should preserve cursor position and handle selection-restricted types', async () => {
      const val = $.atom('hello');
      const $text = appendToBody('<input type="text">');
      const $num = appendToBody('<input type="number">');

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
    });

    it('should handle boolean and collection bindings (checkbox, select-multiple)', async () => {
      // Checkbox with Cycle Prevention
      const isChecked = $.atom(false);
      const $cb = appendToBody('<input type="checkbox">');
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
      } as typeof $.fn.prop;

      isChecked.value = false;
      await $.nextTick();
      expect($cb.prop('checked')).toBe(false);
      $.fn.prop = originalProp;

      // Multiple Select
      const list = $.atom(['A', 'C']);
      const $sel = appendToBody(`
        <select multiple>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      `);
      $sel.atomVal(list);
      await $.nextTick();
      expect($sel.val()).toEqual(['A', 'C']);

      // Reference stability comparison: same values, different reference should not trigger updates
      list.value = ['A', 'C'];
      await $.nextTick();
      expect($sel.val()).toEqual(['A', 'C']);
    });

    it('should dispose all effects and remove event listeners on unbind', async () => {
      const val = $.atom('initial');
      const $el = appendToBody('<input>');

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
    });
  });

  describe('IME Composition Guards', () => {
    it('should maintain stability during IME composition and handle blur correctly', async () => {
      const val = $.atom('initial');
      let syncCount = 0;

      const $el = appendToBody('<input>');
      const el = $el[0] as HTMLInputElement;

      // Track atom setter calls to detect redundant syncs
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(val), 'value');
      if (!descriptor) throw new Error('Expected descriptor to exist');
      Object.defineProperty(val, 'value', {
        get: () => val.peek(),
        set: (v) => {
          syncCount++;
          descriptor.set?.call(val, v);
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
    });

    it('should ignore input event when isComposing is true', async () => {
      const val = $.atom('initial');
      const $el = appendToBody('<input>');
      $el.atomVal(val);
      await $.nextTick();

      const jqEvent = $.Event('input', {
        originalEvent: {
          isComposing: true,
        },
      });

      $el.val('new-val');
      $el.trigger(jqEvent);
      await $.nextTick();

      // Since it's composing, atom should NOT be updated.
      expect(val.value).toBe('initial');
    });
  });

  describe('Edge Cases & Error Resilience', () => {
    it('should normalize DOM value on blur even if parsed value matches atom', async () => {
      const val = $.atom(10);
      const $el = appendToBody('<input>');

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
    });

    it('should not perform redundant DOM writes if value is up-to-date', async () => {
      const val = $.atom('initial');
      const $el = appendToBody('<input>');
      const el = $el[0] as HTMLInputElement;

      $el.atomVal(val);
      await $.nextTick();

      let writeCount = 0;
      const originalDescriptor = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      );

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
    });

    it('should log warnings when synchronization fails (Error Logging)', async () => {
      const warnSpy = vi.spyOn($.debug, 'warn').mockImplementation(() => {});
      $.debug.enabled = true;

      const val = $.atom(1);
      const $el = appendToBody('<input>');

      // 1. DOM -> Atom failure (parse error)
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

      // 2. Atom -> DOM failure (format error)
      warnSpy.mockClear();
      const val2 = $.atom(1);
      const $el2 = appendToBody('<input>');
      $el2.atomVal(val2, {
        format: () => {
          throw new Error('Format error');
        },
      });
      val2.value = 2;
      await $.nextTick();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('atom-binding'),
        expect.stringContaining('syncToDom failed'),
        expect.any(Error)
      );

      // 3. Atom -> DOM format error inside handleBlur (testing try...finally isInternalWrite reset)
      warnSpy.mockClear();
      const val3 = $.atom(1);
      const $el3 = appendToBody('<input>');
      let formatShouldThrow = false;

      $el3.atomVal(val3, {
        format: (v) => {
          if (formatShouldThrow) throw new Error('Blur format error');
          return String(v);
        },
      });

      formatShouldThrow = true;
      $el3.trigger('blur');

      formatShouldThrow = false;

      // Now if we type, it should not be locked
      $el3.val('5').trigger('input');
      expect(val3.value).toBe('5'); // If it locked, it would be ignored and remain 1
    });

    it('should test select-multiple format strategy edge cases', async () => {
      const list = $.atom<unknown>(['A']);
      const $sel = appendToBody(`
        <select multiple>
          <option value="A">A</option>
          <option value="B">B</option>
        </select>
      `);

      let formattedValue: unknown;
      $sel.atomVal(list, {
        format: (v) => {
          formattedValue = v;
          return v as string;
        },
      });
      await $.nextTick();
      expect(formattedValue).toEqual(['A']);

      $sel.atomUnbind();

      // Test with non-array value format fallback
      const nonArrayList = $.atom<unknown>('A');
      $sel.atomVal(nonArrayList);
      await $.nextTick();
      expect($sel.val()).toEqual(['A']);
    });

    it('should not throw or fail synchronization when focused on input[type="number"] which does not support selection API', async () => {
      const val = $.atom(10);
      const $el = appendToBody('<input type="number">');

      $el.atomVal(val);
      await $.nextTick();
      expect($el.val()).toBe('10');

      // Focus the element to enter the selection preservation code path
      $el.trigger('focus');

      // Update value which triggers syncToDom
      val.value = 20;
      await $.nextTick();

      // Value should be successfully updated and no errors should be thrown
      expect($el.val()).toBe('20');
    });

    it('should respect custom options.equal comparator for array elements in select-multiple', async () => {
      interface ItemType {
        id: number;
      }
      const list = $.atom<ItemType[]>([{ id: 1 }, { id: 2 }]);
      const $sel = appendToBody(`
        <select multiple>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      `);

      // Custom equal comparator checking objects' id
      const customEqual: EqualFn<ItemType[]> = (first, second) => {
        if (!first || !second || first.length !== second.length) return false;
        return first.every((val, i) => val.id === second[i]?.id);
      };

      // Spy on customEqual
      const equalSpy = vi.fn(customEqual);

      $sel.atomVal(list, {
        equal: equalSpy,
        parse: (v) => [{ id: parseInt(v, 10) }],
        format: (v) => v.map((item) => String(item.id)).join(','),
      });
      await $.nextTick();

      // Trigger change by assigning a new array reference with functionally equal elements
      equalSpy.mockClear();
      list.value = [{ id: 1 }, { id: 2 }];
      await $.nextTick();

      // equalSpy should have been called and the value should be treated as equal (no DOM update or redundant cycles)
      expect(equalSpy).toHaveBeenCalled();
    });

    it('should not perform redundant DOM writes for select-multiple when value is up-to-date', async () => {
      const list = $.atom(['A', 'B']);
      const $sel = appendToBody(`
        <select multiple>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
        </select>
      `);

      $sel.atomVal(list);
      await $.nextTick();

      const originalFnVal = $.fn.val;
      let valCallCount = 0;
      $.fn.val = function (this: JQuery, ...args: unknown[]) {
        if (args.length > 0 && this[0] === $sel[0]) {
          valCallCount++;
        }
        return (originalFnVal as (...args: unknown[]) => unknown).apply(this, args);
      } as typeof $.fn.val;

      // Case 1: Atom updates to a new value
      valCallCount = 0;
      list.value = ['A', 'C'];
      await $.nextTick();
      expect(valCallCount).toBe(1);

      // Case 2: Atom updates to the same values (functionally equal)
      valCallCount = 0;
      list.value = ['A', 'C'];
      await $.nextTick();
      expect(valCallCount).toBe(0);

      $.fn.val = originalFnVal;
    });
  });
});
