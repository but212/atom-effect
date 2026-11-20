import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MultiSourceField } from '@/bindings/form-field-atoms';
import { registry } from '@/core/registry';
import $, { enableAutoCleanup, refreshFormBinding } from '@/index';
import { castTo, setupDOMCleanup } from '../utils/test-helpers';

/** Helper to wait for MutationObserver and microtask flushes */
const waitMutation = () => new Promise((r) => setTimeout(r, 20));

describe('Form Binding (atomForm)', () => {
  const { appendToBody } = setupDOMCleanup();

  beforeEach(() => {
    document.body.innerHTML = '';
    $.initAEJ({ patch: true, autoCleanup: true });
  });

  describe('Two-way Binding by Input Type', () => {
    it('should synchronize text inputs and deep paths', async () => {
      const data = $.atom({ user: { name: 'Alice' } });
      const $form = appendToBody('<form><input name="user.name"></form>');

      $form.atomForm(data);
      await $.nextTick();

      // Initial Sync
      expect($form.find('input').val()).toBe('Alice');

      // DOM -> Atom
      $form.find('input').val('Bob').trigger('input');
      await $.nextTick();
      expect(data.value.user.name).toBe('Bob');
    });

    it.each(['form', 'control', 'replace'] as const)(
      'stops a value binding cancelled during its first format (%s)',
      async (target) => {
        const $form = appendToBody('<form>');
        const $field = $('<input name="field">');
        const model = $.atom({ field: 'original' });
        const replacement = $.atom({ field: 'replacement' });
        $form.atomForm(model, {
          debounce: 0,
          format(value) {
            if (target === 'form') $form.atomUnbind();
            else if (target === 'control') $field.atomUnbind();
            else $form.atomForm(replacement, { debounce: 0 });
            return String(value);
          },
        });

        $form.append($field);
        await $.nextTick();
        expect(model.subscriberCount()).toBe(0);
        expect($field.val()).toBe(target === 'replace' ? 'replacement' : '');

        $field.val('edited').trigger('input');
        expect(model.value.field).toBe('original');
        expect(replacement.value.field).toBe(target === 'replace' ? 'edited' : 'replacement');
      }
    );

    it('binds the next field when an initial formatter removes its own field', async () => {
      const $form = appendToBody('<form><input name="first"><input name="second"></form>');
      const $first = $form.find('[name="first"]');
      const $second = $form.find('[name="second"]');
      const model = $.atom({ first: 'first', second: 'second' });
      $form.atomForm(model, {
        format(value: unknown) {
          if (value === 'first') $first.get(0)?.remove();
          return String(value);
        },
      });
      await $.nextTick();

      expect($first.val()).toBe('');
      expect($second.val()).toBe('second');
      $second.val('edited').trigger('input');
      expect(model.value.second).toBe('edited');
      expect(model.subscriberCount()).toBe(1);
    });

    it('does not write a formatted value after the formatter transfers an external field', async () => {
      const $form = appendToBody('<form id="format-owner">');
      const $destination = appendToBody('<form id="format-destination">');
      const input = document.createElement('input');
      input.name = 'field';
      input.setAttribute('form', 'format-owner');
      input.value = 'existing';
      const model = $.atom({ field: 'old model' });
      $form.atomForm(model, {
        format(value) {
          input.setAttribute('form', 'format-destination');
          return String(value);
        },
      });

      appendToBody(input);
      await $.nextTick();

      expect(input.form).toBe($destination.get(0));
      expect(input.value).toBe('existing');
      expect(model.subscriberCount()).toBe(0);
    });

    it.each(['format', 'validate'] as const)(
      'does not write a validation error to a field transferred during %s',
      async (during) => {
        const $form = appendToBody('<form id="validate-owner">');
        const $destination = appendToBody('<form id="validate-destination">');
        const input = appendToBody('<input name="field" form="validate-owner">').get(
          0
        ) as HTMLInputElement;
        const transfer = () => input.setAttribute('form', 'validate-destination');
        const validate = vi.fn(() => {
          if (during === 'validate') transfer();
          return 'Stale error';
        });
        $destination.atomForm($.atom({ field: 'destination' }));
        $form.atomForm($.atom({ field: 'original' }), {
          format(value) {
            if (during === 'format') transfer();
            return String(value);
          },
          validation: { field: validate },
        });

        expect(input.form).toBe($destination.get(0));
        expect(input.validity.customError).toBe(false);
        expect(validate).toHaveBeenCalledTimes(during === 'validate' ? 1 : 0);
        await $.nextTick();
        expect(input.value).toBe('destination');
      }
    );

    it('replays value, toggle, and validation updates after the original names return', async () => {
      const $form = appendToBody(
        '<form><input name="field"><input name="toggle" type="checkbox"></form>'
      );
      const input = $form.find('input').get(0) as HTMLInputElement;
      const toggle = $form.find('input').get(1) as HTMLInputElement;
      const model = $.atom({ field: 'original', toggle: false });
      const validate = vi.fn((value) => (value === 'updated' ? 'Invalid value' : true));
      $form.atomForm(model, { validation: { field: validate } });

      $.batch(() => {
        input.name = 'temporary-field';
        toggle.name = 'temporary-toggle';
        model.value = { field: 'updated', toggle: true };
      });
      expect(input.value).toBe('original');
      expect(toggle.checked).toBe(false);
      expect(input.validity.valid).toBe(true);
      input.name = 'field';
      toggle.name = 'toggle';
      await $.nextTick();

      expect(input.value).toBe('updated');
      expect(toggle.checked).toBe(true);
      expect(input.validity.customError).toBe(true);
      expect(validate.mock.calls).toEqual([['original'], ['updated']]);
    });

    it.each(['format', 'initial format', 'validate'] as const)(
      'retries a write discarded when %s temporarily moves the control',
      async (during) => {
        const $form = appendToBody('<form id="replay-owner">');
        appendToBody('<form id="replay-other">');
        const input = appendToBody('<input name="field" form="replay-owner">').get(
          0
        ) as HTMLInputElement;
        const initial = during === 'initial format';
        const model = $.atom({ field: initial ? 'updated' : 'original' });
        let moveOnce = true;
        const move = (value: unknown) => {
          if (value !== 'updated' || !moveOnce) return;
          moveOnce = false;
          input.setAttribute('form', 'replay-other');
        };
        $form.atomForm(model, {
          format(value) {
            if (during !== 'validate') move(value);
            return String(value);
          },
          validation: {
            field(value) {
              if (during === 'validate') move(value);
              return value === 'updated' ? 'Invalid value' : true;
            },
          },
        });

        if (!initial) {
          $.batch(() => {
            model.value = { field: 'updated' };
          });
        }
        expect(input.getAttribute('form')).toBe('replay-other');
        if (during !== 'validate') expect(input.value).toBe(initial ? '' : 'original');
        expect(input.validity.valid).toBe(true);
        input.setAttribute('form', 'replay-owner');
        await $.nextTick();
        expect(input.value).toBe('updated');
        expect(input.validity.customError).toBe(true);
      }
    );

    it('does not debounce an input event dispatched while its form binding is stale', async () => {
      const $form = appendToBody('<form id="debounced-owner">');
      appendToBody('<form id="temporary-owner">');
      const $input = appendToBody('<input name="field" form="debounced-owner">');
      const model = $.atom({ field: 'original' });
      vi.useFakeTimers();
      try {
        $form.atomForm(model, { debounce: 10 });
        $input.attr('form', 'temporary-owner').val('ignored').trigger('input');
        $input.attr('form', 'debounced-owner');
        await vi.advanceTimersByTimeAsync(10);
        expect(model.value.field).toBe('original');

        $input.val('accepted').trigger('input');
        await vi.advanceTimersByTimeAsync(10);
        expect(model.value.field).toBe('accepted');
      } finally {
        $form.atomUnbind();
        vi.useRealTimers();
      }
    });

    it('should synchronize radio buttons', async () => {
      const data = $.atom({ gender: 'male' });
      const $form = appendToBody(`
        <form>
          <input type="radio" name="gender" value="male" id="r-male">
          <input type="radio" name="gender" value="female" id="r-female">
        </form>
      `);

      $form.atomForm(data);
      await $.nextTick();

      expect($form.find('#r-male').prop('checked')).toBe(true);

      $form.find('#r-female').prop('checked', true).trigger('change');
      await $.nextTick();
      expect(data.value.gender).toBe('female');
    });

    it('should synchronize checkbox arrays', async () => {
      const data = $.atom({ hobbies: ['coding'] });
      const $form = appendToBody(`
        <form>
          <input type="checkbox" name="hobbies" value="coding" id="cb-coding">
          <input type="checkbox" name="hobbies" value="music" id="cb-music">
        </form>
      `);

      $form.atomForm(data);
      await $.nextTick();

      expect($form.find('#cb-coding').prop('checked')).toBe(true);
      expect($form.find('#cb-music').prop('checked')).toBe(false);

      // DOM -> Atom
      $form.find('#cb-music').prop('checked', true).trigger('change');
      await $.nextTick();
      expect(data.value.hobbies).toEqual(['coding', 'music']);

      // DOM -> Atom (uncheck)
      $form.find('#cb-music').prop('checked', false).trigger('change');
      await $.nextTick();
      expect(data.value.hobbies).toEqual(['coding']);

      // Atom -> DOM
      data.value = { hobbies: ['music'] };
      await $.nextTick();
      expect($form.find('#cb-coding').prop('checked')).toBe(false);
      expect($form.find('#cb-music').prop('checked')).toBe(true);
    });

    it('disposes a checkbox effect even if unbinding its change handler throws', async () => {
      const $form = appendToBody(`
        <form>
          <input type="checkbox" name="items" value="a">
          <input type="checkbox" name="items" value="b">
        </form>
      `);
      const data = $.atom({ items: ['a'] });
      $form.atomForm(data);
      await $.nextTick();
      const $first = $form.find('[value="a"]');
      const $second = $form.find('[value="b"]');
      expect($first.prop('checked')).toBe(true);
      expect($second.prop('checked')).toBe(false);

      const failure = new Error('change handler teardown failed');
      const off = vi.spyOn($.fn, 'off').mockImplementationOnce(() => {
        throw failure;
      });
      const log = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      try {
        $first.atomUnbind();
        expect(log).toHaveBeenCalledWith(expect.any(String), expect.any(String), failure);
        data.value = { items: ['b'] };
        await $.nextTick();
        expect($first.prop('checked')).toBe(true);
        expect($second.prop('checked')).toBe(true);
      } finally {
        off.mockRestore();
        log.mockRestore();
        $form.atomUnbind();
      }
    });

    it('should synchronize boolean toggles (single checkbox)', async () => {
      const data = $.atom({ isActive: true });
      const $form = appendToBody(
        '<form><input type="checkbox" name="isActive" id="cb-active"></form>'
      );

      $form.atomForm(data);
      await $.nextTick();

      expect($form.find('#cb-active').prop('checked')).toBe(true);

      $form.find('#cb-active').prop('checked', false).trigger('change');
      await $.nextTick();
      expect(data.value.isActive).toBe(false);
    });
  });

  describe('Reactivity & Lifecycle', () => {
    it('should reflect bulk atom updates to the DOM', async () => {
      const data = $.atom({ status: 'active' });
      const $form = appendToBody('<form><input name="status"></form>');

      $form.atomForm(data);
      await $.nextTick();

      data.value = { status: 'inactive' };
      await $.nextTick();
      expect($form.find('input').val()).toBe('inactive');
    });

    it('should co-exist safely with other bindings and prevent infinite loops', async () => {
      const data = $.atom({ text: 'val' });
      const active = $.atom(true);
      const $form = appendToBody('<form><input name="text"></form>');
      const $input = $form.find('input');

      $input.atomClass('active', active);
      $form.atomForm(data);
      await $.nextTick();

      let updateCount = 0;
      data.subscribe(() => updateCount++);

      $input.val('new').trigger('input');
      await $.nextTick();
      expect(data.value.text).toBe('new');
      expect(updateCount).toBe(1);

      active.value = false;
      await $.nextTick();
      expect($input.hasClass('active')).toBe(false);
      expect($input.val()).toBe('new');
    });

    it('should support multiple source atoms via array (mergeLenses)', async () => {
      const user = $.atom({ name: 'Alice' });
      const settings = $.atom({ theme: 'dark' });

      const $form = appendToBody(`
        <form>
          <input name="name">
          <input name="theme">
        </form>
      `);

      $form.atomForm([user, settings]);
      await $.nextTick();

      expect($form.find('[name="name"]').val()).toBe('Alice');
      expect($form.find('[name="theme"]').val()).toBe('dark');

      $form.find('[name="name"]').val('Bob').trigger('input');
      $form.find('[name="theme"]').val('light').trigger('input');
      await $.nextTick();

      expect(user.value.name).toBe('Bob');
      expect(settings.value.theme).toBe('light');

      user.value = { name: 'Charlie' };
      settings.value = { theme: 'high-contrast' };
      await $.nextTick();

      expect($form.find('[name="name"]').val()).toBe('Charlie');
      expect($form.find('[name="theme"]').val()).toBe('high-contrast');
    });

    it('should write only to the source atom that owns the field', async () => {
      const user = $.atom({ name: 'Alice', age: 30 });
      const settings = $.atom({ theme: 'dark' });

      const $form = appendToBody(`
        <form>
          <input name="name">
          <input name="theme">
        </form>
      `);

      $form.atomForm([user, settings]);
      await $.nextTick();

      $form.find('[name="name"]').val('Bob').trigger('input');
      await $.nextTick();

      expect(user.value).toEqual({ name: 'Bob', age: 30 });
      expect(settings.value).toEqual({ theme: 'dark' });
    });

    it('should own an overlapping field by the last source, and an unknown field by the first', async () => {
      const primary = $.atom({ shared: 'primary', only: 'p' });
      const override = $.atom({ shared: 'override' });

      const $form = appendToBody(`
        <form>
          <input name="shared">
          <input name="only">
          <input name="fresh">
        </form>
      `);

      $form.atomForm([primary, override]);
      await $.nextTick();

      expect($form.find('[name="shared"]').val()).toBe('override');

      $form.find('[name="shared"]').val('next').trigger('input');
      $form.find('[name="only"]').val('o').trigger('input');
      await $.nextTick();

      expect(override.value).toEqual({ shared: 'next' });
      expect(primary.value).toEqual({ shared: 'primary', only: 'o' });

      $form.find('[name="fresh"]').val('created').trigger('input');
      await $.nextTick();

      expect(primary.value).toEqual({ shared: 'primary', only: 'o', fresh: 'created' });
      expect(override.value).toEqual({ shared: 'next' });
    });

    it('should follow a field whose owner changes after mount', async () => {
      const user = $.atom({ name: 'Alice' });
      const draft = $.atom<Record<string, string>>({});

      const $form = appendToBody(`
        <form>
          <input name="name">
        </form>
      `);

      // At mount only `user` defines "name", so it owns the field.
      $form.atomForm([user, draft]);
      await $.nextTick();
      expect($form.find('[name="name"]').val()).toBe('Alice');

      // A later source takes the path over: the read must follow it.
      draft.value = { name: 'Bob' };
      await $.nextTick();
      expect($form.find('[name="name"]').val()).toBe('Bob');

      // ...and the write must target the new owner, not the mount-time one.
      $form.find('[name="name"]').val('Carl').trigger('input');
      await $.nextTick();
      expect(draft.value).toEqual({ name: 'Carl' });
      expect(user.value).toEqual({ name: 'Alice' });
    });

    it('should return ownership to an earlier source when a later source drops the path', async () => {
      const primary = $.atom({ shared: 'primary' });
      const override = $.atom<Record<string, string>>({ shared: 'override' });

      const $form = appendToBody(`
        <form>
          <input name="shared">
        </form>
      `);

      $form.atomForm([primary, override]);
      await $.nextTick();
      expect($form.find('[name="shared"]').val()).toBe('override');

      override.value = {};
      await $.nextTick();
      expect($form.find('[name="shared"]').val()).toBe('primary');

      $form.find('[name="shared"]').val('back').trigger('input');
      await $.nextTick();
      expect(primary.value).toEqual({ shared: 'back' });
      expect(override.value).toEqual({});
    });

    it('should preserve nested sibling fields across sources without shallow-merge clobbering', async () => {
      const source1 = $.atom({ user: { name: 'Alice' } });
      const source2 = $.atom({ user: { role: 'admin' } });

      const $form = appendToBody(`
        <form>
          <input name="user.name">
          <input name="user.role">
        </form>
      `);

      $form.atomForm([source1, source2]);
      await $.nextTick();

      expect($form.find('[name="user.name"]').val()).toBe('Alice');
      expect($form.find('[name="user.role"]').val()).toBe('admin');

      $form.find('[name="user.name"]').val('Bob').trigger('input');
      await $.nextTick();

      expect(source1.value).toEqual({ user: { name: 'Bob' } });
      expect(source2.value).toEqual({ user: { role: 'admin' } });
      expect($form.find('[name="user.name"]').val()).toBe('Bob');
      expect($form.find('[name="user.role"]').val()).toBe('admin');
    });

    it('keeps reading and writing the original sources after the caller empties the array', async () => {
      const $form = appendToBody('<form><input name="field"></form>');
      const $input = $form.find('input');
      const first = $.atom({ field: 'first' });
      const last = $.atom({ field: 'last' });
      const sources = [first, last];
      $form.atomForm(sources, { debounce: 0 });
      sources.length = 0;

      last.value = { field: 'updated' };
      await $.nextTick();
      expect($input.val()).toBe('updated');
      $input.val('edited').trigger('input');
      expect(last.value.field).toBe('edited');
      expect(first.value.field).toBe('first');
    });

    it('should reject an empty source array with a named error', async () => {
      const withControl = appendToBody('<form><input name="username"></form>');
      const withoutControl = appendToBody('<form></form>');

      for (const $form of [withControl, withoutControl]) {
        expect(() => $form.atomForm([])).toThrowError(
          /\[bindForm\] requires at least one source atom; received an empty array\./
        );
      }
    });
  });

  describe('Dynamic DOM Discovery (MutationObserver)', () => {
    it('should handle dynamic element addition, renaming, and removal', async () => {
      const data = $.atom({ fieldA: '1', fieldB: '2', fieldC: '3' });
      const $form = appendToBody('<form><input name="fieldA" id="id-a"></form>');

      $form.atomForm(data);
      await $.nextTick();

      // 1. Dynamic Addition
      $form.append('<div><input name="fieldB" id="id-b"></div>');
      await waitMutation();
      expect($form.find('#id-b').val()).toBe('2');

      // 2. Dynamic Renaming
      const $inputA = $form.find('#id-a');
      $inputA.attr('name', 'fieldC');
      await waitMutation();
      expect($inputA.val()).toBe('3');

      // 3. Removal & Sync Check
      $inputA.remove();
      await waitMutation();
      data.value = { ...data.value, fieldB: 'changed-b' };
      await $.nextTick();
      expect($form.find('#id-b').val()).toBe('changed-b');
    });
  });

  describe('FormOptions', () => {
    describe('value options', () => {
      it('should forward parse, format, and equal to field bindings', async () => {
        const data = $.atom({ age: 20 });
        const equal = vi.fn((first: number, second: number) => first === second);
        const $form = appendToBody('<form><input name="age"></form>');

        $form.atomForm(
          data,
          castTo<never>({
            parse: (value: string) => Number(value),
            format: (value: number) => `age:${value}`,
            equal,
          })
        );
        await $.nextTick();

        expect($form.find('input').val()).toBe('age:20');
        $form.find('input').val('21').trigger('input');
        await $.nextTick();

        expect(data.value.age).toBe(21);
        expect(equal).toHaveBeenCalled();
      });
    });

    describe('transform & onChange', () => {
      it('should apply transform and trigger onChange correctly', async () => {
        const data = $.atom({ age: 20, ids: [1] });
        const onChange = vi.fn();
        const $form = appendToBody(`
          <form>
            <input name="age">
            <input type="checkbox" name="ids" value="2" id="id-2">
          </form>
        `);

        $form.atomForm(data, {
          transform: (path, value) => {
            if (path === 'age') return Number(value);
            if (path === 'ids' && Array.isArray(value)) return value.map(Number);
            return value;
          },
          onChange,
        });
        await $.nextTick();

        $form.find('[name="age"]').val('25').trigger('input');
        await $.nextTick();

        expect(data.value.age).toBe(25);
        expect(onChange).toHaveBeenCalledWith('age', 25);

        $form.find('#id-2').prop('checked', true).trigger('change');
        await $.nextTick();
        expect(data.value.ids).toEqual([1, 2]);
      });

      it('should handle exceptions gracefully without breaking sync', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const data = $.atom({ age: 20, text: 'init' });

        const $form = appendToBody(`
          <form>
            <input name="age">
            <input name="text">
          </form>
        `);

        $form.atomForm(data, {
          transform: (path: string, value: unknown) => {
            if (path === 'age') throw new Error('Transform error');
            return value;
          },
          onChange: (path: string) => {
            if (path === 'text') throw new Error('onChange error');
          },
        });
        await $.nextTick();

        // Transform exception
        $form.find('[name="age"]').val('25').trigger('input');
        await $.nextTick();
        expect(String(data.value.age)).toBe('25'); // Value falls back to raw input
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[bindForm] Transform error in field "age":',
          expect.any(Error)
        );

        // onChange exception
        $form.find('[name="text"]').val('changed').trigger('input');
        await $.nextTick();
        expect(data.value.text).toBe('changed');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[bindForm] onChange error in field "text":',
          expect.any(Error)
        );
      });
    });

    describe('debounce', () => {
      it('should debounce rapid input events', async () => {
        vi.useFakeTimers();
        const data = $.atom({ text: 'init' });
        const $form = appendToBody('<form><input name="text"></form>');

        $form.atomForm(data, { debounce: 30 });
        await $.nextTick();

        $form.find('input').val('delayed').trigger('input');
        expect(data.value.text).toBe('init'); // Not updated yet

        vi.advanceTimersByTime(50);
        await $.nextTick();
        expect(data.value.text).toBe('delayed'); // Updated after debounce

        vi.useRealTimers();
      });
    });

    describe('validation', () => {
      it('should integrate declarative validation with form controls', async () => {
        const data = $.atom({ email: 'invalid' });
        const $form = appendToBody('<form><input name="email" id="email-input"></form>');

        $form.atomForm(data, {
          validation: {
            email: (value: unknown) => (String(value).includes('@') ? '' : 'Invalid Email'),
          },
        });
        await $.nextTick();

        const input = document.getElementById('email-input') as HTMLInputElement;

        // 1. Initial State
        expect(input.validationMessage).toBe('Invalid Email');
        expect(($form[0] as HTMLFormElement).checkValidity()).toBe(false);

        // 2. Reactive Correction
        data.value = { email: 'user@example.com' };
        await $.nextTick();

        expect(input.validationMessage).toBe('');
        expect(($form[0] as HTMLFormElement).checkValidity()).toBe(true);
      });

      it('clears only the validation message still owned by the binding on unbind', async () => {
        const $form = appendToBody('<form><input name="first"><input name="second"></form>');
        const first = $form.find<HTMLInputElement>('[name="first"]').get(0) as HTMLInputElement;
        const second = $form.find<HTMLInputElement>('[name="second"]').get(0) as HTMLInputElement;
        $form.atomForm($.atom({ first: 'a', second: 'b' }), {
          validation: { first: () => false, second: () => false },
        });
        await $.nextTick();
        expect(first.validity.customError).toBe(true);
        expect(second.validity.customError).toBe(true);

        const externalMessage = 'Rejected by the server';
        second.setCustomValidity(externalMessage);
        $form.atomUnbind();

        expect(first.checkValidity()).toBe(true);
        expect(second.checkValidity()).toBe(false);
        expect(second.validationMessage).toBe(externalMessage);
      });

      it.each([false, true])(
        'restores a configurable read-only validation setter (external write: %s)',
        async (externalWrite) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
          const descriptor = {
            value: input.setCustomValidity,
            configurable: true,
            writable: false,
          };
          Object.defineProperty(input, 'setCustomValidity', descriptor);
          $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
          await $.nextTick();
          expect(input.validity.customError).toBe(true);

          if (externalWrite) input.setCustomValidity(input.validationMessage);
          $form.atomUnbind();

          expect(input.checkValidity()).toBe(!externalWrite);
          expect(Object.getOwnPropertyDescriptor(input, 'setCustomValidity')).toMatchObject(
            descriptor
          );
        }
      );

      it.each([false, true])(
        'clears only owned errors from a fixed validation setter with disabled=%s',
        async (disabled) => {
          const $form = appendToBody('<form><input name="owned"><input name="external"></form>');
          const owned = $form.find<HTMLInputElement>('[name="owned"]').get(0) as HTMLInputElement;
          const external = $form
            .find<HTMLInputElement>('[name="external"]')
            .get(0) as HTMLInputElement;
          const setter = owned.setCustomValidity;
          for (const input of [owned, external]) {
            Object.defineProperty(input, 'setCustomValidity', { value: setter });
            input.disabled = disabled;
          }
          $form.atomForm($.atom({ owned: 'a', external: 'b' }), {
            validation: { owned: () => false, external: () => false },
          });
          expect(owned.validity.customError).toBe(true);
          external.setCustomValidity('External error');

          $form.atomUnbind();
          if (disabled) {
            expect(owned.validity.customError).toBe(true);
            owned.disabled = external.disabled = false;
            await $.nextTick();
          }
          expect(owned.checkValidity()).toBe(true);
          expect(external.validationMessage).toBe('External error');
          expect(owned.setCustomValidity).toBe(setter);
        }
      );

      it.each([false, true])(
        'clears a multiline validation message set with disabled=%s',
        async (disabled) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
          input.disabled = disabled;
          $form.atomForm($.atom({ field: 'value' }), {
            validation: { field: () => 'First line\r\nSecond line' },
          });
          await $.nextTick();
          input.disabled = false;
          expect(input.validity.customError).toBe(true);

          $form.atomUnbind();
          expect(input.checkValidity()).toBe(true);
        }
      );

      it.each(['setup', 'update'] as const)(
        'does not write a validation result after the validator unbinds the form during %s',
        async (when) => {
          const $form = appendToBody('<form><input name="field"><input name="sibling"></form>');
          const input = $form.find<HTMLInputElement>('[name="field"]').get(0) as HTMLInputElement;
          const model = $.atom({ field: when === 'setup' ? 'unbind' : 'bound', sibling: 'bound' });
          $form.atomForm(model, {
            validation: {
              field: (value) => {
                if (value === 'unbind') $form.atomUnbind();
                return `Invalid: ${value}`;
              },
            },
          });
          if (when === 'update') {
            await $.nextTick();
            expect(input.validity.customError).toBe(true);
            model.value = { field: 'unbind', sibling: 'bound' };
          }

          await $.nextTick();
          expect(model.subscriberCount()).toBe(0);
          expect(input.checkValidity()).toBe(true);
        }
      );

      it.each([false, true])(
        'releases an owned error with an unchanged setter accessor (external write: %s)',
        (externalWrite) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
          const nativeSetter = input.setCustomValidity;
          const getSetter = function (this: HTMLInputElement) {
            return nativeSetter.bind(this);
          };
          Object.defineProperty(input, 'setCustomValidity', { get: getSetter });
          $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
          expect(input.validity.customError).toBe(true);

          if (externalWrite) input.setCustomValidity('Server rejection');
          $form.atomUnbind();

          expect(input.checkValidity()).toBe(!externalWrite);
          if (externalWrite) expect(input.validationMessage).toBe('Server rejection');
          expect(Object.getOwnPropertyDescriptor(input, 'setCustomValidity')?.get).toBe(getSetter);
        }
      );

      it('preserves an external validation write that repeats the binding message', async () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const originalSetter = input.setCustomValidity;
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
        await $.nextTick();
        expect(input.validity.customError).toBe(true);

        input.setCustomValidity(input.validationMessage);
        $form.atomUnbind();

        expect(input.validity.customError).toBe(true);
        expect(input.setCustomValidity).toBe(originalSetter);
      });

      it.each([false, true])(
        'tracks validation writes after a setter replacement (external write: %s)',
        async (externalWrite) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find('input').get(0) as HTMLInputElement;
          const replacement = input.setCustomValidity.bind(input);
          const model = $.atom({ field: 'first' });
          $form.atomForm(model, { validation: { field: String } });
          expect(input.validationMessage).toBe('first');

          input.setCustomValidity = replacement;
          model.value = { field: 'second' };
          await $.nextTick();
          expect(input.validationMessage).toBe('second');
          if (externalWrite) input.setCustomValidity(input.validationMessage);
          $form.atomUnbind();

          expect(input.validity.customError).toBe(externalWrite);
          expect(input.setCustomValidity).toBe(replacement);
        }
      );

      it('does not install reactive validation on a fieldset that can never be eligible', () => {
        const $form = appendToBody('<form><fieldset name="group"></fieldset></form>');
        const fieldset = $form.find('fieldset').get(0) as HTMLFieldSetElement;
        const setter = fieldset.setCustomValidity;
        const validate = vi.fn(() => false);
        $form.atomForm($.atom({ group: 'value' }), { validation: { group: validate } });
        $form.atomUnbind();

        expect(fieldset.willValidate).toBe(false);
        expect(validate).not.toHaveBeenCalled();
        expect(fieldset.validity.customError).toBe(false);
        expect(fieldset.setCustomValidity).toBe(setter);
      });

      it('does not relinquish ownership when an external validity write fails', async () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
        await $.nextTick();

        expect(() => Reflect.apply(input.setCustomValidity, input, [])).toThrow(TypeError);
        $form.atomUnbind();
        expect(input.checkValidity()).toBe(true);
      });

      it.each(['disabled', 'readOnly'] as const)(
        'clears a binding-owned error after %s stops barring validation',
        async (property) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
          const setter = input.setCustomValidity;
          $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
          await $.nextTick();
          expect(input.validity.customError).toBe(true);

          input[property] = true;
          $form.atomUnbind();
          expect(input[property]).toBe(true);
          expect(input.validity.customError).toBe(true);
          input[property] = false;
          await $.nextTick();

          expect(input.checkValidity()).toBe(true);
          expect(input.setCustomValidity).toBe(setter);
        }
      );

      it('clears only owned errors after enabling a fieldset, without toggling its state', async () => {
        const disabledStates: boolean[] = [];
        customElements.define(
          'aej-validation-disabled-state',
          class extends HTMLElement {
            static formAssociated = true;

            constructor() {
              super();
              this.attachInternals();
            }

            formDisabledCallback(disabled: boolean): void {
              disabledStates.push(disabled);
            }
          }
        );
        const $form = appendToBody(`
          <form><fieldset disabled="disabled">
            <input name="owned"><input name="external">
            <aej-validation-disabled-state></aej-validation-disabled-state>
          </fieldset></form>
        `);
        const fieldset = $form.find<HTMLFieldSetElement>('fieldset').get(0) as HTMLFieldSetElement;
        const owned = $form.find<HTMLInputElement>('[name="owned"]').get(0) as HTMLInputElement;
        const external = $form
          .find<HTMLInputElement>('[name="external"]')
          .get(0) as HTMLInputElement;
        const setExternalValidity = external.setCustomValidity.bind(external);
        $form.atomForm($.atom({ owned: 'a', external: 'b' }), {
          validation: { owned: () => false, external: () => false },
        });
        await $.nextTick();
        expect(owned.validity.customError).toBe(true);
        expect(external.validity.customError).toBe(true);
        setExternalValidity('External error');

        expect(disabledStates).toEqual([true]);
        $form.atomUnbind();
        expect(fieldset.disabled).toBe(true);
        expect(disabledStates).toEqual([true]);
        fieldset.disabled = false;
        await $.nextTick();
        expect(disabledStates).toEqual([true, false]);
        expect(owned.checkValidity()).toBe(true);
        expect(external.validationMessage).toBe('External error');
      });

      it('clears a deferred validation error when an iframe fieldset becomes enabled', async () => {
        const frame = appendToBody('<iframe>').get(0) as HTMLIFrameElement;
        const frameDocument = frame.contentDocument as Document;
        const fieldset = frameDocument.body.appendChild(frameDocument.createElement('fieldset'));
        fieldset.disabled = true;
        const $form = appendToBody('<form><input name="field"></form>');
        const form = $form.get(0) as HTMLFormElement;
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;

        try {
          $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
          expect(input.validity.customError).toBe(true);

          fieldset.append(form);
          expect(input.willValidate).toBe(false);
          $form.atomUnbind();
          fieldset.disabled = false;
          await $.nextTick();

          expect(input.willValidate).toBe(true);
          expect(input.checkValidity()).toBe(true);
        } finally {
          $form.atomUnbind();
          input.setCustomValidity('');
        }
      });

      it('preserves a different disabled validation message written through a saved setter', async () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const setExternalValidity = input.setCustomValidity.bind(input);
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
        await $.nextTick();
        expect(input.validity.customError).toBe(true);

        input.setAttribute('disabled', 'disabled');
        const externalMessage = 'Rejected by the server';
        setExternalValidity(externalMessage);
        $form.atomUnbind();
        expect(input.getAttribute('disabled')).toBe('disabled');
        input.disabled = false;
        await $.nextTick();

        expect(input.validationMessage).toBe(externalMessage);
      });

      it('cancels deferred cleanup after a new write of the same message', async () => {
        const $form = appendToBody('<form><input name="field" disabled></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const setter = input.setCustomValidity;
        const message = 'Already taken';
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => message } });
        await $.nextTick();
        $form.atomUnbind();

        input.setCustomValidity(message);
        expect(input.setCustomValidity).toBe(setter);
        input.disabled = false;
        await $.nextTick();
        expect(input.validationMessage).toBe(message);
      });

      it('does not clear a newer binding’s error when deferred cleanup becomes eligible', async () => {
        const $form = appendToBody('<form><input name="field" disabled></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const setter = input.setCustomValidity;
        const atom = $.atom({ field: 'value' });
        const options = { validation: { field: () => false } };
        $form.atomForm(atom, options);
        await $.nextTick();
        $form.atomUnbind();
        $form.atomForm(atom, options);

        input.disabled = false;
        await $.nextTick();
        expect(input.validity.customError).toBe(true);
        $form.atomUnbind();
        expect(input.validity.customError).toBe(false);
        expect(input.setCustomValidity).toBe(setter);
      });

      it('rechecks eligibility when a field leaves a disabled fieldset', async () => {
        const $form = appendToBody(
          '<form><fieldset disabled><input name="field"></fieldset></form>'
        );
        const $other = appendToBody('<fieldset disabled>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
        await $.nextTick();
        expect(input.validity.customError).toBe(true);
        $form.atomUnbind();

        $other.append(input);
        await $.nextTick();
        expect(input.validity.customError).toBe(true);
        $other.prop('disabled', false);
        await $.nextTick();
        expect(input.checkValidity()).toBe(true);
      });

      it('follows a new blocking ancestor when a detached field is inserted', async () => {
        const $form = appendToBody('<form><input name="field" readonly></form>');
        const $fieldset = appendToBody('<form><fieldset disabled></fieldset></form>').find(
          'fieldset'
        );
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        $form.atomForm($.atom({ field: 'value' }), { validation: { field: () => false } });
        await $.nextTick();
        $(input).detach().atomUnbind();

        $fieldset.append(input);
        input.readOnly = false;
        await $.nextTick();
        expect(input.validity.customError).toBe(true);

        $fieldset.prop('disabled', false);
        await $.nextTick();
        expect(input.checkValidity()).toBe(true);
      });

      it('clears an error written by a validity setter that synchronously unbinds the form', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const setter = function (this: HTMLInputElement, message: string) {
          nativeSetter.call(this, message);
          if (message) $form.atomUnbind();
        };
        input.setCustomValidity = setter;
        const model = $.atom({ field: 'initial' });

        $form.atomForm(model, { validation: { field: () => false } });

        expect(input.validity.customError).toBe(false);
        expect(input.setCustomValidity).toBe(setter);
        expect(model.subscriberCount()).toBe(0);
      });

      it.each(['before', 'after'] as const)(
        'keeps a reentrant reactive error owned when an external setter forwards %s the update',
        (forward) => {
          const $form = appendToBody('<form><input name="field"></form>');
          const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
          const nativeSetter = input.setCustomValidity;
          const model = $.atom({ field: 'initial' });
          input.setCustomValidity = function (message) {
            if (message !== 'external') {
              nativeSetter.call(this, message);
              return;
            }
            if (forward === 'before') nativeSetter.call(this, message);
            $.batch(() => {
              model.value = { field: 'updated' };
            });
            if (forward === 'after') nativeSetter.call(this, message);
          };
          $form.atomForm(model, {
            validation: { field: (value: unknown) => String(value) },
          });

          input.setCustomValidity('external');

          expect(input.validationMessage).toBe('updated');
          $form.atomUnbind();
          expect(input.checkValidity()).toBe(true);
        }
      );

      it('preserves a newer validation write during reentrant unbind and rebind', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const first = $.atom({ field: 'first' });
        const second = $.atom({ field: 'second' });
        let rebound = false;
        const setter = function (this: HTMLInputElement, message: string) {
          nativeSetter.call(this, message);
          if (!message || rebound) return;
          rebound = true;
          $form.atomUnbind();
          $form.atomForm(second, { validation: { field: () => false } });
        };
        input.setCustomValidity = setter;

        $form.atomForm(first, { validation: { field: () => false } });

        expect(input.validity.customError).toBe(true);
        expect(input.value).toBe('second');
        expect(first.subscriberCount()).toBe(0);
        $form.atomUnbind();
        expect(input.validity.customError).toBe(false);
        expect(input.setCustomValidity).toBe(setter);
      });

      it('applies the replacement error when the old setter rebinds before forwarding its write', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const input = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const first = $.atom({ field: 'first' });
        const replacement = $.atom({ field: 'replacement' });
        const setter = function (this: HTMLInputElement, message: string) {
          if (message === 'Original error') {
            $form.atomUnbind();
            $form.atomForm(replacement, { validation: { field: () => 'Replacement error' } });
          }
          nativeSetter.call(this, message);
        };
        input.setCustomValidity = setter;

        $form.atomForm(first, { validation: { field: () => 'Original error' } });

        expect(input.value).toBe('replacement');
        expect(input.validationMessage).toBe('Replacement error');
        expect(first.subscriberCount()).toBe(0);
        $form.atomUnbind();
        expect(input.validity.customError).toBe(false);
        expect(input.setCustomValidity).toBe(setter);
      });

      it('keeps a queued replacement error even when the old clear throws after rebinding', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const $input = $form.find<HTMLInputElement>('input');
        const input = $input.get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const replacement = $.atom({ field: 'replacement' });
        let shouldThrow = true;
        input.setCustomValidity = function (message) {
          if (!message && shouldThrow) {
            shouldThrow = false;
            $form.atomForm(replacement, { validation: { field: () => 'Replacement error' } });
            throw new Error('clear failed');
          }
          nativeSetter.call(this, message);
        };
        $form.atomForm($.atom({ field: 'original' }), { validation: { field: () => 'Original' } });

        $input.atomUnbind();

        expect(input.value).toBe('replacement');
        expect(input.validationMessage).toBe('Replacement error');
        $form.atomUnbind();
        expect(input.validity.customError).toBe(false);
      });

      it('restores the original setter after rebinding during a validation clear', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const $input = $form.find<HTMLInputElement>('input');
        const input = $input.get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const first = $.atom({ field: 'first' });
        const second = $.atom({ field: 'second' });
        let rebound = false;
        const setter = function (this: HTMLInputElement, message: string) {
          nativeSetter.call(this, message);
          if (message || rebound) return;
          rebound = true;
          $form.atomForm(second, { validation: { field: () => 'Second error' } });
        };
        input.setCustomValidity = setter;
        $form.atomForm(first, { validation: { field: () => 'First error' } });

        $input.atomUnbind();
        expect(first.subscriberCount()).toBe(0);
        expect(input.validationMessage).toBe('Second error');
        $input.atomUnbind();
        expect(second.subscriberCount()).toBe(0);
        expect(input.validity.customError).toBe(false);
        expect(input.setCustomValidity).toBe(setter);
      });

      it('keeps the replacement error when a setter rebinds before forwarding the old clear', () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const $input = $form.find<HTMLInputElement>('input');
        const input = $input.get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        const first = $.atom({ field: 'first' });
        const next = $.atom({ field: 'next' });
        let rebound = false;
        input.setCustomValidity = function (message) {
          if (!message && !rebound) {
            rebound = true;
            $form.atomForm(next, { validation: { field: () => 'Replacement error' } });
          }
          nativeSetter.call(this, message);
        };
        $form.atomForm(first, { validation: { field: () => 'Original error' } });

        $input.atomUnbind();

        expect(first.subscriberCount()).toBe(0);
        expect(input.value).toBe('next');
        expect(input.validationMessage).toBe('Replacement error');
        expect(input.checkValidity()).toBe(false);
        $form.atomUnbind();
        expect(input.checkValidity()).toBe(true);
      });

      it('keeps existing and new fields on the form binding installed during teardown', async () => {
        const $form = appendToBody('<form><input name="field"></form>');
        const field = $form.find<HTMLInputElement>('input').get(0) as HTMLInputElement;
        const nativeSetter = field.setCustomValidity;
        const original = $.atom({ field: 'original' });
        const outer = $.atom({ field: 'outer' });
        const latest = $.atom({ field: 'latest' });
        field.setCustomValidity = function (message) {
          nativeSetter.call(this, message);
          if (message === '') $form.atomForm(latest);
        };
        $form.atomForm(original, { validation: { field: () => false } });
        $form.atomForm(outer);
        const $added = $('<input name="field">').appendTo($form);

        latest.value = { field: 'updated' };
        await $.nextTick();

        expect(field.value).toBe('updated');
        expect($added.val()).toBe('updated');
        expect(original.subscriberCount()).toBe(0);
        expect(outer.subscriberCount()).toBe(0);
        $form.atomUnbind();
        expect(latest.subscriberCount()).toBe(0);
      });

      it('does not let a stale field callback dispose a reentrant form binding', async () => {
        const $form = appendToBody('<form>');
        const field = document.createElement('input');
        field.name = 'field';
        const original = $.atom({ field: 'original' });
        const latest = $.atom({ field: 'latest' });
        const nativeGetAttribute = field.getAttribute;
        let rebound = false;
        field.getAttribute = function (name) {
          if (name === 'name' && !rebound) {
            rebound = true;
            $form.atomForm(latest);
          }
          return nativeGetAttribute.call(this, name);
        };
        $form.atomForm(original);
        $form.append(field);
        await $.nextTick();

        latest.value = { field: 'updated' };
        await $.nextTick();
        expect(field.value).toBe('updated');
        expect(original.subscriberCount()).toBe(0);
      });

      it('should handle validation exceptions gracefully', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const data = $.atom({ name: 'fail' });
        const $form = appendToBody('<form><input name="name" id="name-input"></form>');

        $form.atomForm(data, {
          validation: {
            name: () => {
              throw new Error('validate crash');
            },
          },
        });
        await $.nextTick();

        const input = document.getElementById('name-input') as HTMLInputElement;
        expect(input.validationMessage).toBe('Validation failed');
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      it('ignores Object.prototype properties when looking up field validators', async () => {
        const $form = $(
          '<form><input name="toString"><input name="hasOwnProperty"><input name="email"></form>'
        ).appendTo(document.body);
        const form = $form.get(0) as HTMLFormElement;
        const model = $.atom({ toString: 'ok', hasOwnProperty: 'ok', email: 'a@b.com' });
        try {
          $form.atomForm(model, {
            validation: {
              email: (v) => String(v).includes('@') || 'Bad email',
            },
          });
          await $.nextTick();

          const toStringInput = $form
            .find<HTMLInputElement>('[name="toString"]')
            .get(0) as HTMLInputElement;
          const hasOwnInput = $form
            .find<HTMLInputElement>('[name="hasOwnProperty"]')
            .get(0) as HTMLInputElement;
          expect(toStringInput.validationMessage).toBe('');
          expect(hasOwnInput.validationMessage).toBe('');
          expect(form.checkValidity()).toBe(true);
        } finally {
          $form.atomUnbind();
          form.remove();
        }
      });
    });
  });

  describe('Modern Web Standards Integration', () => {
    it('binds a newly inserted custom control with an unrelated form property', async () => {
      const tagName = 'aej-custom-control-unrelated-form';
      class CustomControl extends HTMLElement {
        value = '';
        form = null;
      }
      customElements.define(tagName, CustomControl);
      const control = document.createElement(tagName) as CustomControl;
      control.setAttribute('name', 'custom');
      const data = $.atom({ custom: 'initial' });
      const $form = appendToBody('<form>').atomForm(data);

      $form.append(control);
      await $.nextTick();
      expect(control.value).toBe('initial');

      control.value = 'changed';
      $(control).trigger('input');
      expect(data.value.custom).toBe('changed');
    });

    it('should automatically bind to Form-Associated Custom Elements (FACE)', async () => {
      const data = $.atom({ custom: 'initial' });
      const tagName = `face-field-${Math.random().toString(36).slice(2, 7)}`;

      customElements.define(
        tagName,
        class extends HTMLElement {
          static formAssociated = true;
          private _internals = this.attachInternals();
          private _value = '';
          get value() {
            return this._value;
          }
          set value(value) {
            this._value = value;
            this._internals.setFormValue(value);
          }
          val(value?: unknown) {
            if (value === undefined) return this.value;
            this.value = value as string;
            return this;
          }
        }
      );

      const $form = appendToBody(`<form><${tagName} name="custom"></${tagName}></form>`);

      $form.atomForm(data);
      await $.nextTick();

      const faceEl = $form.find(tagName)[0] as HTMLElement & { value: string };
      expect(faceEl.value).toBe('initial');

      faceEl.value = 'changed';
      $(faceEl).trigger('change');
      await $.nextTick();
      expect(data.value.custom).toBe('changed');
    });
  });

  describe('Safety & Robustness', () => {
    it('should skip elements if name property is null or undefined to avoid coercing to string "null"/"undefined"', async () => {
      const data = $.atom<Record<string, unknown>>({ name: 'initial' });
      const $form = appendToBody('<form><input id="test-input"></form>');
      const input = $form.find('input')[0];

      Object.defineProperty(input, 'name', {
        get: () => null,
        configurable: true,
      });

      $form.atomForm(data);
      await $.nextTick();

      $form.find('input').val('new-value').trigger('change');
      await $.nextTick();

      expect(data.value).not.toHaveProperty('null');
      expect(data.value).not.toHaveProperty('undefined');
    });

    it('cleans up two-way binding when input name attribute is removed', async () => {
      const data = $.atom({ name: 'Alice' });
      const $form = appendToBody('<form><input name="name" value="Alice"></form>');
      $form.atomForm(data);
      await $.nextTick();

      const input = $form.find('input')[0] as HTMLInputElement;
      expect(input.value).toBe('Alice');

      input.removeAttribute('name');
      await waitMutation();
      await $.nextTick();

      $form.find('input').val('Bob').trigger('input');
      await $.nextTick();
      expect(data.value.name).toBe('Alice');

      data.value = { name: 'Charlie' };
      await $.nextTick();
      expect(input.value).toBe('Bob');
      expect(registry.hasBind(input)).toBe(false);
    });
  });

  describe('MultiSourceField Lifecycle & Disposal', () => {
    it('should track its own disposed state and become a write no-op after disposal', () => {
      const source1 = $.atom({ profile: { name: 'Alice' } });
      const source2 = $.atom({ profile: { age: 30 } });
      const field = new MultiSourceField([source1, source2], 'profile.name');

      expect(field.value).toBe('Alice');
      expect((field as unknown as { isDisposed: boolean }).isDisposed).toBe(false);

      // Mutate via field
      field.value = 'Bob';
      expect(source1.value.profile.name).toBe('Bob');

      // Dispose field
      field.dispose();
      expect((field as unknown as { isDisposed: boolean }).isDisposed).toBe(true);

      // Writes after disposal must be suppressed (no-op)
      field.value = 'Charlie';
      expect(source1.value.profile.name).toBe('Bob');

      // Underlying sources must NOT be marked as disposed
      expect((source1 as unknown as { isDisposed: boolean }).isDisposed).toBe(false);
      expect((source2 as unknown as { isDisposed: boolean }).isDisposed).toBe(false);
    });

    it('detaches source subscriptions and suppresses notifications upon disposal', () => {
      const source = $.atom({ profile: { name: 'Alice' } });
      const field = new MultiSourceField([source], 'profile.name');
      const listener = vi.fn();

      field.subscribe(listener);
      expect(source.subscriberCount()).toBe(1);

      field.dispose();
      expect(source.subscriberCount()).toBe(0);

      source.value = { profile: { name: 'Bob' } };
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports Subscriber object with execute() method', async () => {
      const source = $.atom({ profile: { name: 'Alice' } });
      const field = new MultiSourceField([source], 'profile.name');
      const subscriber = { execute: vi.fn() };

      const unsub = field.subscribe(subscriber as never);
      expect(subscriber.execute).not.toHaveBeenCalled();

      source.value = { profile: { name: 'Bob' } };
      await $.nextTick();
      expect(subscriber.execute).toHaveBeenCalledTimes(1);

      unsub();
      source.value = { profile: { name: 'Charlie' } };
      await $.nextTick();
      expect(subscriber.execute).toHaveBeenCalledTimes(1);
    });

    it('returns direct subscriber count instead of summing upstream source subscribers', () => {
      const source = $.atom({ profile: { name: 'Alice' } });
      source.subscribe(() => {});
      expect(source.subscriberCount()).toBe(1);

      const field = new MultiSourceField([source], 'profile.name');
      expect(field.subscriberCount()).toBe(0);

      const unsub = field.subscribe(() => {});
      expect(field.subscriberCount()).toBe(1);

      unsub();
      expect(field.subscriberCount()).toBe(0);
    });

    it('re-binds removed and re-inserted form controls correctly', async () => {
      const data = $.atom({ name: 'Alice' });
      const $form = appendToBody('<form><input name="name" /></form>');
      $form.atomForm(data);
      await $.nextTick();

      const input = $form.find('input')[0] as HTMLInputElement;
      expect(input.value).toBe('Alice');

      // Remove input from DOM
      $(input).detach();
      await $.nextTick();

      // Re-insert input into form
      $form.append(input);
      await $.nextTick();

      // Update atom; re-inserted input should reflect update
      data.value = { name: 'Bob' };
      await $.nextTick();
      expect(input.value).toBe('Bob');
    });

    it('keeps a detached external field through refresh but releases a later native removal', async () => {
      $.initAEJ({ autoCleanup: false });
      const $form = appendToBody('<form id="refresh-detached">');
      const $input = appendToBody('<input name="field" form="refresh-detached">');
      const form = $form.get(0) as HTMLFormElement;
      const input = $input.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'initial' });
      $form.atomForm(model, { debounce: 0 });

      $input.detach();
      await $.nextTick();
      expect(model.subscriberCount()).toBe(1);
      refreshFormBinding(form);
      model.value = { field: 'detached update' };
      await $.nextTick();
      expect(model.subscriberCount()).toBe(1);
      expect(input.value).toBe('detached update');
      $input.val('ignored').trigger('input');
      expect(model.value.field).toBe('detached update');

      document.body.append(input);
      await $.nextTick();
      expect(model.subscriberCount()).toBe(1);
      expect(input.value).toBe('detached update');
      input.remove();
      await $.nextTick();
      expect(model.subscriberCount()).toBe(0);
    });

    it('resyncs a detached descendant input edited directly while suspended on reattach', async () => {
      const $form = appendToBody('<form><input name="field"></form>');
      const $input = $form.find<HTMLInputElement>('input');
      const input = $input.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'bound' });
      $form.atomForm(model, { debounce: 0 });
      await $.nextTick();

      $input.detach();
      await $.nextTick();
      input.value = 'stale';

      $form.append($input);
      await $.nextTick();
      expect(input.value).toBe('bound');
    });

    it('resyncs detached checkbox and radio controls edited while suspended on reattach', async () => {
      const $form = appendToBody(
        '<form><input type="checkbox" name="agree"><input type="radio" name="choice" value="a"><input type="radio" name="choice" value="b"></form>'
      );
      const $checkbox = $form.find<HTMLInputElement>('[name="agree"]');
      const $radioA = $form.find<HTMLInputElement>('[value="a"]');
      const $radioB = $form.find<HTMLInputElement>('[value="b"]');
      const checkbox = $checkbox.get(0) as HTMLInputElement;
      const radioA = $radioA.get(0) as HTMLInputElement;
      const radioB = $radioB.get(0) as HTMLInputElement;
      const model = $.atom({ agree: true, choice: 'a' });
      $form.atomForm(model);
      await $.nextTick();
      expect(checkbox.checked).toBe(true);
      expect(radioA.checked).toBe(true);
      expect(radioB.checked).toBe(false);

      $checkbox.detach();
      $radioA.detach();
      $radioB.detach();
      await $.nextTick();

      $checkbox.prop('checked', false).trigger('change');
      $radioA.prop('checked', false);
      $radioB.prop('checked', true).trigger('change');
      expect(model.value).toEqual({ agree: true, choice: 'a' });

      $form.append($checkbox, $radioA, $radioB);
      await $.nextTick();
      expect(checkbox.checked).toBe(true);
      expect(radioA.checked).toBe(true);
      expect(radioB.checked).toBe(false);
    });

    it('resyncs a suspended external control after same-tick form detach, edit, and reattach', async () => {
      const $form = appendToBody('<form id="same-tick-detach-form">');
      const $input = appendToBody('<input name="field" form="same-tick-detach-form">');
      const input = $input.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'initial' });
      $form.atomForm(model, { debounce: 0 });
      await $.nextTick();

      $form.detach();
      $input.val('rejected').trigger('input');
      expect(model.value.field).toBe('initial');
      document.body.append($form.get(0) as HTMLFormElement);
      await $.nextTick();

      expect(input.value).toBe('initial');
      $input.val('accepted').trigger('input');
      expect(model.value.field).toBe('accepted');
    });

    it.each(['contains', 'getRootNode'])(
      'binds dynamic controls alongside a field named %s',
      async (name) => {
        const $form = appendToBody('<form>');
        const existing = document.createElement('input');
        existing.name = name;
        $form.append(existing);
        const source = $.atom({ [name]: 'Initial', added: 'Added', renamed: 'Renamed' });
        $form.atomForm(source);

        const added = document.createElement('input');
        added.name = 'added';
        $form.append(added);
        await $.nextTick();
        expect(existing.value).toBe('Initial');
        expect(added.value).toBe('Added');

        added.name = 'renamed';
        await $.nextTick();
        expect(added.value).toBe('Renamed');
        $(added).val('Edited').trigger('input');
        expect(source.value.renamed).toBe('Edited');
      }
    );

    it('releases a natively removed control from a disconnected form', async () => {
      const $form = $('<form><div><input name="field"></div></form>');
      const $input = $form.find('input');
      const input = $input.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'bound' });
      try {
        $form.atomForm(model);
        $form.find('div').get(0)?.remove();
        await $.nextTick();

        expect(input.form).toBeNull();
        expect(model.subscriberCount()).toBe(0);
        $input.val('orphan edit').trigger('input');
        expect(model.value.field).toBe('bound');
      } finally {
        $form.atomUnbind();
      }
    });

    it.each([false, true])(
      'preserves a patched detach from a disconnected form but not a native removal (same delivery: %s)',
      async (sameDelivery) => {
        const $form = $('<form><input name="field"></form>');
        const $input = $form.find('input');
        const input = $input.get(0) as HTMLInputElement;
        const model = $.atom({ field: 'bound' });
        try {
          $form.atomForm(model);
          $input.detach();
          if (!sameDelivery) {
            await $.nextTick();
            expect(model.subscriberCount()).toBe(1);
          }

          $form.append($input);
          input.remove();
          await $.nextTick();
          expect(model.subscriberCount()).toBe(0);
        } finally {
          $form.atomUnbind();
        }
      }
    );

    it('honors a patched detach of a parentless field while auto-cleanup observes the form', async () => {
      const $form = appendToBody('<form><input name="field"></form>');
      const $input = $form.find('input');
      const input = $input.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'bound' });
      $form.atomForm(model);
      input.remove();
      $input.detach();
      await $.nextTick();
      expect(model.subscriberCount()).toBe(1);

      $form.append($input);
      input.remove();
      await $.nextTick();
      expect(model.subscriberCount()).toBe(0);
    });

    it.each(['parentless field', 'moved field', 'moved wrapper'] as const)(
      'preserves a patched detach of a %s without auto-cleanup',
      async (target) => {
        $.initAEJ({ autoCleanup: false });
        const $form = appendToBody('<form><div><input name="field"></div></form>');
        const $destination = appendToBody('<section>');
        const $input = $form.find<HTMLInputElement>('input');
        const input = $input.get(0) as HTMLInputElement;
        const $wrapper = $form.find('div');
        const model = $.atom({ field: 'bound' });
        try {
          $form.atomForm(model);
          if (target === 'parentless field') {
            input.remove();
            $input.detach();
          } else {
            const $target = target === 'moved field' ? $input : $wrapper;
            $destination.append($target);
            $target.detach();
          }

          await $.nextTick();
          model.value = { field: 'still bound' };
          await $.nextTick();
          expect(input.value).toBe('still bound');
          expect(model.subscriberCount()).toBe(1);

          $form.append($input);
          input.remove();
          await $.nextTick();
          expect(model.subscriberCount()).toBe(0);
        } finally {
          $form.atomUnbind();
          $.initAEJ();
        }
      }
    );

    it('transfers a detached control without disposing its independent bindings', async () => {
      const $first = appendToBody('<form><input name="name" /></form>');
      const $second = appendToBody('<form>');
      const first = $.atom({ name: 'First' });
      const second = $.atom({ name: 'Second' });
      const label = $.atom('a label');
      $first.atomForm(first);
      $second.atomForm(second);
      const $input = $first.find('input').atomAttr('aria-label', label).detach();
      await $.nextTick();
      $second.append($input);
      await $.nextTick();

      $input.val('Edited').trigger('input');
      expect(first.value.name).toBe('First');
      expect(second.value.name).toBe('Edited');
      $first.atomUnbind();
      second.value = { name: 'New' };
      label.value = 'new label';
      await $.nextTick();
      expect($input.val()).toBe('New');
      expect($input.attr('aria-label')).toBe('new label');
    });

    it('releases form ownership but keeps independent bindings after a move into an observed fragment', async () => {
      const $form = appendToBody('<form><input name="field"></form>');
      const $input = $form.find<HTMLInputElement>('input');
      const input = $input.get(0) as HTMLInputElement;
      const fragment = document.createDocumentFragment();
      const destination = fragment.appendChild(document.createElement('form'));
      const source = $.atom({ field: 'Original' });
      const label = $.atom('Original label');
      enableAutoCleanup(fragment);
      $form.atomForm(source, { debounce: 0 });
      $input.atomAttr('aria-label', label);

      try {
        destination.append(input);
        await $.nextTick();
        expect(input.form).toBe(destination);
        $input.val('Edited').trigger('input');
        expect(source.value.field).toBe('Original');
        expect(source.subscriberCount()).toBe(0);
        label.value = 'Updated label';
        await $.nextTick();
        expect($input.attr('aria-label')).toBe('Updated label');
      } finally {
        registry.cleanupTree(fragment);
      }
    });

    it.each(['input', 'aej-explicit-owner-control'])(
      'keeps and updates the form owner when %s moves inside another bound form',
      async (tagName) => {
        if (tagName !== 'input') {
          customElements.define(
            tagName,
            class extends HTMLElement {
              static formAssociated = true;
              readonly #internals = this.attachInternals();
              value = '';
              get form() {
                return this.#internals.form;
              }
            }
          );
        }
        const $first = appendToBody('<form>');
        const $owner = appendToBody('<form id="explicit-owner">');
        const control = document.createElement(tagName);
        control.setAttribute('name', 'name');
        control.setAttribute('form', 'explicit-owner');
        const $input = appendToBody(control);
        const first = $.atom({ name: 'First' });
        const owner = $.atom({ name: 'Owner' });
        $first.atomForm(first);
        $owner.atomForm(owner);
        await $.nextTick();
        expect($input.val()).toBe('Owner');

        $first.append($input);
        await $.nextTick();
        expect($input.val()).toBe('Owner');

        $input.val('Edited').trigger('input');
        expect(first.value.name).toBe('First');
        expect(owner.value.name).toBe('Edited');

        control.removeAttribute('form');
        await $.nextTick();
        expect($input.val()).toBe('First');
        $input.val('Edited in first').trigger('input');
        expect(first.value.name).toBe('Edited in first');
        expect(owner.value.name).toBe('Edited');

        control.setAttribute('form', 'missing-owner');
        await $.nextTick();
        $input.val('Unowned edit').trigger('input');
        expect(first.value.name).toBe('Edited in first');
        expect(owner.value.name).toBe('Edited');

        control.setAttribute('form', 'explicit-owner');
        await $.nextTick();
        expect($input.val()).toBe('Edited');
        $input.val('Edited again').trigger('input');
        expect(first.value.name).toBe('Edited in first');
        expect(owner.value.name).toBe('Edited again');
      }
    );

    it('binds dynamically inserted fields to their explicit owner and follows renames', async () => {
      const $container = appendToBody('<form>');
      const $owner = appendToBody('<form id="dynamic-explicit-owner">');
      const container = $.atom({ field: 'Other form', renamed: 'Other path' });
      const owner = $.atom({ field: 'First path', renamed: 'Second path' });
      $container.atomForm(container);
      $owner.atomForm(owner);

      const $input = $('<input name="field" form="dynamic-explicit-owner">').appendTo($container);
      await $.nextTick();
      expect($input.val()).toBe('First path');

      $input.attr('name', 'renamed');
      await $.nextTick();
      expect($input.val()).toBe('Second path');

      $input.val('Edited').trigger('input');
      expect(owner.value).toEqual({ field: 'First path', renamed: 'Edited' });
      expect(container.value).toEqual({ field: 'Other form', renamed: 'Other path' });
    });

    it.each(['light DOM', 'open', 'closed'] as const)(
      'releases form ownership when a bound subtree moves outside the form (%s)',
      async (scope) => {
        const $form = appendToBody('<form><div><input name="field"></div></form>');
        const outside = appendToBody('<section>').get(0) as HTMLElement;
        const destination = scope === 'light DOM' ? outside : outside.attachShadow({ mode: scope });
        const model = $.atom({ field: 'bound' });
        const label = $.atom('label');
        const $wrapper = $form.find('div');
        const $field = $wrapper.find<HTMLInputElement>('input').atomAttr('aria-label', label);
        const field = $field.get(0) as HTMLInputElement;
        $form.atomForm(model);
        await $.nextTick();
        expect(field.value).toBe('bound');

        destination.append($wrapper.get(0) as HTMLElement);
        await $.nextTick();
        expect(field.form).toBeNull();
        $field.val('unowned').trigger('input');
        expect(model.value.field).toBe('bound');
        expect(model.subscriberCount()).toBe(0);

        label.value = 'updated label';
        await $.nextTick();
        expect($field.attr('aria-label')).toBe('updated label');

        ($form.get(0) as HTMLFormElement).append($wrapper.get(0) as HTMLElement);
        await $.nextTick();
        expect(field.value).toBe('bound');
        $field.val('owned again').trigger('input');
        expect(model.value.field).toBe('owned again');
      }
    );

    it.each(['detach', 'parentless detach', 'detach in the same delivery'] as const)(
      'releases a native external field removal outside the cleanup root even after %s',
      async (detach) => {
        const $root = appendToBody('<section>');
        const root = $root.get(0) as HTMLElement;
        $.initAEJ({ autoCleanup: { root } });
        const $form = $('<form id="scoped-owner">').appendTo($root);
        const $field = appendToBody('<input name="field" form="scoped-owner">');
        const input = $field.get(0) as HTMLInputElement;
        const model = $.atom({ field: 'bound' });
        const label = $.atom('label');
        try {
          $form.atomForm(model);
          $field.atomAttr('aria-label', label);
          await $.nextTick();

          if (detach === 'parentless detach') input.remove();
          $field.detach();
          if (detach !== 'detach in the same delivery') {
            await $.nextTick();
            expect(model.subscriberCount()).toBe(1);
          }

          document.body.append(input);
          input.remove();
          await $.nextTick();
          expect(input.form).toBeNull();
          expect(model.subscriberCount()).toBe(0);

          model.value = { field: 'should not write' };
          label.value = 'independent binding';
          await $.nextTick();
          expect(input.value).toBe('bound');
          expect(input.getAttribute('aria-label')).toBe('independent binding');
        } finally {
          $field.atomUnbind();
          $form.atomUnbind();
          $.initAEJ();
        }
      }
    );

    it('honors an external detach requested by an earlier teardown in the same delivery', async () => {
      $.initAEJ({ autoCleanup: false });
      const $form = appendToBody('<form id="detach-during-teardown">');
      const $first = appendToBody('<input name="first" form="detach-during-teardown">');
      const $second = appendToBody('<input name="second" form="detach-during-teardown">');
      const first = $first.get(0) as HTMLInputElement;
      const second = $second.get(0) as HTMLInputElement;
      const nativeSetter = first.setCustomValidity;
      first.setCustomValidity = function (message) {
        nativeSetter.call(this, message);
        if (message === '') $second.detach();
      };
      const model = $.atom({ first: 'first', second: 'second' });
      try {
        $form.atomForm(model, { validation: { first: () => false } });
        first.remove();
        second.remove();
        await $.nextTick();

        expect(model.subscriberCount()).toBe(1);
        model.value = { first: 'released', second: 'retained' };
        await $.nextTick();
        expect(first.value).toBe('first');
        expect(second.value).toBe('retained');
      } finally {
        $form.atomUnbind();
        $.initAEJ();
      }
    });

    it('reconciles explicit ownership on insertion and form reattachment', async () => {
      const $form = appendToBody('<form id="external-dynamic-owner">');
      const form = $form.get(0) as HTMLFormElement;
      const model = $.atom({ field: 'bound' });
      $form.atomForm(model);
      const $field = appendToBody(
        '<div><input name="field" form="external-dynamic-owner"></div>'
      ).find<HTMLInputElement>('input');
      const field = $field.get(0) as HTMLInputElement;
      await $.nextTick();
      expect(field.form).toBe(form);
      expect(field.value).toBe('bound');

      $form.detach();
      await $.nextTick();
      expect(field.form).toBeNull();
      $field.val('unowned').trigger('input');
      expect(model.value.field).toBe('bound');

      document.body.append(form);
      await $.nextTick();
      expect(field.value).toBe('bound');
      $field.val('owned again').trigger('input');
      expect(model.value.field).toBe('owned again');
    });

    it.each(['form', 'ancestor'] as const)(
      'preserves external field bindings when the %s is detached without auto-cleanup',
      async (target) => {
        $.initAEJ({ autoCleanup: false });
        const $wrapper = appendToBody('<div><form id="detached-external-owner"></form></div>');
        const $form = $wrapper.find<HTMLFormElement>('form');
        const form = $form.get(0) as HTMLFormElement;
        const $target = target === 'form' ? $form : $wrapper;
        const $field = appendToBody('<input name="field" form="detached-external-owner">');
        const field = $field.get(0) as HTMLInputElement;
        const model = $.atom({ field: 'original' });
        $form.atomForm(model, { debounce: 0, validation: { field: () => 'Invalid field' } });
        await $.nextTick();

        try {
          model.value = { field: 'queued before detach' };
          $target.detach();
          expect(field.form).toBeNull();
          refreshFormBinding(form);
          await $.nextTick();
          expect(model.subscriberCount()).toBe(2);
          expect(field.value).toBe('queued before detach');
          expect(field.validity.customError).toBe(true);

          $field.val('ignored').trigger('input');
          expect(model.value.field).toBe('queued before detach');
          model.value = { field: 'still subscribed' };
          await $.nextTick();
          expect(field.value).toBe('still subscribed');

          document.body.append($target.get(0) as HTMLElement);
          await $.nextTick();
          $field.val('accepted').trigger('input');
          expect(model.value.field).toBe('accepted');
        } finally {
          $form.atomUnbind();
        }
      }
    );

    it('releases the external binding when a detached form is reinserted and then removed natively', async () => {
      $.initAEJ({ autoCleanup: false });
      const $form = appendToBody('<form id="removed-external-owner">');
      const form = $form.get(0) as HTMLFormElement;
      const $field = appendToBody('<input name="field" form="removed-external-owner">');
      const model = $.atom({ field: 'original' });
      $form.atomForm(model);
      await $.nextTick();

      try {
        $form.detach();
        await $.nextTick();
        expect(model.subscriberCount()).toBe(1);

        document.body.append(form);
        form.remove();
        await $.nextTick();
        expect(model.subscriberCount()).toBe(0);
        model.value = { field: 'no longer subscribed' };
        await $.nextTick();
        expect($field.val()).toBe('original');
      } finally {
        $form.atomUnbind();
      }
    });

    it('transfers a suspended external control when it acquires a different owner', async () => {
      const $first = appendToBody('<form id="suspended-owner">');
      const $second = appendToBody('<form id="next-owner">');
      const $field = appendToBody('<input name="field" form="suspended-owner">');
      const first = $.atom({ field: 'first' });
      const second = $.atom({ field: 'second' });
      $first.atomForm(first, { debounce: 0 });
      $second.atomForm(second, { debounce: 0 });
      await $.nextTick();

      try {
        $first.detach();
        await $.nextTick();
        expect(first.subscriberCount()).toBe(1);
        $field.attr('form', 'next-owner');
        await $.nextTick();
        expect(first.subscriberCount()).toBe(0);
        expect($field.val()).toBe('second');
        $field.val('edited').trigger('input');
        expect(first.value.field).toBe('first');
        expect(second.value.field).toBe('edited');
      } finally {
        $first.atomUnbind();
      }
    });

    it('binds existing external controls when a detached shadow host connects', async () => {
      const host = document.createElement('div');
      const shadow = host.attachShadow({ mode: 'closed' });
      const $form = $('<form id="connecting-owner">').appendTo(shadow);
      const $field = $('<input name="field" form="connecting-owner">').appendTo(shadow);
      const model = $.atom({ field: 'bound' });

      try {
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();
        expect($field.prop('form')).toBeNull();
        expect(model.subscriberCount()).toBe(0);

        appendToBody(host);
        await $.nextTick();
        expect($field.prop('form')).toBe($form.get(0));
        expect($field.val()).toBe('bound');
        $field.val('edited').trigger('input');
        expect(model.value.field).toBe('edited');
      } finally {
        $form.atomUnbind();
      }
    });

    it('follows a bound form between the document and a closed shadow root', async () => {
      const $wrapper = appendToBody('<div><form id="moving-owner"></form></div>');
      const wrapper = $wrapper.get(0) as HTMLElement;
      const $form = $wrapper.find('form');
      const form = $form.get(0) as HTMLFormElement;
      const host = appendToBody('<section>').get(0) as HTMLElement;
      const shadow = host.attachShadow({ mode: 'closed' });
      const $documentField = appendToBody('<input name="first" form="moving-owner">');
      const $existing = $('<input name="first" form="moving-owner">');
      shadow.append($existing.get(0) as HTMLElement);
      const model = $.atom({ first: 'initial', second: 'second', third: 'third' });
      $form.atomForm(model);

      shadow.append(wrapper);
      await $.nextTick();
      expect($existing.prop('form')).toBe(form);
      expect($existing.val()).toBe('initial');
      $documentField.val('unowned').trigger('input');
      expect(model.value.first).toBe('initial');

      const $added = $('<input name="second" form="moving-owner">');
      shadow.append($added.get(0) as HTMLElement);
      await $.nextTick();
      expect($added.val()).toBe('second');
      $added.val('edited in shadow').trigger('input');
      expect(model.value.second).toBe('edited in shadow');

      document.body.append(wrapper);
      await $.nextTick();
      expect($documentField.val()).toBe('initial');
      $added.val('no longer owned').trigger('input');
      expect(model.value.second).toBe('edited in shadow');
      const $newDocumentField = appendToBody('<input name="third" form="moving-owner">');
      await $.nextTick();
      expect($newDocumentField.val()).toBe('third');
    });

    it.each(['same document', 'another document'] as const)(
      'binds external fields when a nested host from %s connects inside an observed shadow root',
      async (origin) => {
        const outerHost = appendToBody('<div>').get(0) as HTMLElement;
        const outerRoot = outerHost.attachShadow({ mode: 'open' });
        const $outerForm = $('<form>').appendTo(outerRoot);
        $outerForm.atomForm($.atom({ other: '' }));

        const ownerDocument =
          origin === 'same document' ? document : document.implementation.createHTMLDocument();
        const wrapper = ownerDocument.createElement('div');
        const host = wrapper.appendChild(ownerDocument.createElement('div'));
        const root = host.attachShadow({ mode: 'closed' });
        const $form = $('<form id="nested-observed-form">').appendTo(root);
        const $field = $('<input name="field" form="nested-observed-form">').appendTo(root);
        const model = $.atom({ field: 'bound' });
        try {
          $form.atomForm(model, { debounce: 0 });
          await $.nextTick();
          expect($field.prop('form')).toBeNull();

          outerRoot.append(wrapper);
          await $.nextTick();
          expect($field.prop('form')).toBe($form.get(0));
          expect($field.val()).toBe('bound');
          $field.val('edited').trigger('input');
          expect(model.value.field).toBe('edited');
        } finally {
          $form.atomUnbind();
          $outerForm.atomUnbind();
        }
      }
    );

    it('refreshes external fields when a host connects inside an unobserved shadow root', async () => {
      const outerHost = appendToBody('<div>').get(0) as HTMLElement;
      const outerRoot = outerHost.attachShadow({ mode: 'open' });
      const host = document.createElement('div');
      const root = host.attachShadow({ mode: 'closed' });
      const form = root.appendChild(document.createElement('form'));
      form.id = 'nested-shadow-form';
      const input = root.appendChild(document.createElement('input'));
      input.name = 'field';
      input.setAttribute('form', form.id);
      const model = $.atom({ field: 'bound' });
      $(form).atomForm(model);
      try {
        expect(input.form).toBeNull();
        outerRoot.append(host);
        expect(input.form).toBe(form);
        refreshFormBinding(form);
        expect(input.value).toBe('bound');
        $(input).val('edited').trigger('input');
        expect(model.value.field).toBe('edited');
      } finally {
        $(form).atomUnbind();
      }
    });

    it('refreshes an existing binding after reattachment to an unobserved shadow root', async () => {
      const $form = appendToBody('<form id="refreshed-owner"><input name="internal"></form>');
      const form = $form.get(0) as HTMLFormElement;
      const host = appendToBody('<div>').get(0) as HTMLElement;
      const shadow = host.attachShadow({ mode: 'closed' });
      const model = $.atom({ internal: 'internal value', field: 'initial' });
      $form.atomForm(model);
      $form.detach();
      await $.nextTick();
      shadow.append(form);
      await $.nextTick();

      const $existing = $('<input name="field" form="refreshed-owner">');
      shadow.append($existing.get(0) as HTMLElement);
      refreshFormBinding(form);
      expect($existing.prop('form')).toBe(form);
      expect($existing.val()).toBe('initial');
      expect(model.subscriberCount()).toBe(2);

      const $added = $('<input name="field" form="refreshed-owner">');
      shadow.append($added.get(0) as HTMLElement);
      await $.nextTick();
      expect($added.val()).toBe('initial');
      $added.val('edited').trigger('input');
      expect(model.value.field).toBe('edited');

      $form.detach();
      await $.nextTick();
      const $external = appendToBody('<input name="field" form="refreshed-owner">');
      document.body.append(form);
      await $.nextTick();
      expect($external.val()).toBe('edited');
      $existing.val('stale').trigger('input');
      expect(model.value.field).toBe('edited');
    });

    it('observes a foreign shadow root after refreshing a form moved into an iframe', async () => {
      const frame = appendToBody('<iframe>').get(0) as HTMLIFrameElement;
      const frameDocument = frame.contentDocument as Document;
      const host = frameDocument.body.appendChild(frameDocument.createElement('div'));
      const shadow = host.attachShadow({ mode: 'closed' });
      const $form = appendToBody('<form id="iframe-owner">');
      const form = $form.get(0) as HTMLFormElement;
      const model = $.atom({ field: 'bound' });

      try {
        $form.atomForm(model, { debounce: 0 }).detach();
        await $.nextTick();
        shadow.append(form);
        refreshFormBinding(form);

        const field = frameDocument.createElement('input');
        field.name = 'field';
        field.setAttribute('form', 'iframe-owner');
        shadow.append(field);
        await $.nextTick();
        expect(field.form).toBe(form);
        expect(field.value).toBe('bound');
        $(field).val('edited').trigger('input');
        expect(model.value.field).toBe('edited');
      } finally {
        $form.atomUnbind();
      }
    });

    it('refreshes forms with a control named elements', async () => {
      const $form = appendToBody('<form><input name="field"></form>');
      const form = $form.get(0) as HTMLFormElement;
      const $field = $form.find('input');
      const model = $.atom({ field: 'original', elements: 'renamed' });
      $form.atomForm(model);

      $field.attr('name', 'elements');
      await $.nextTick();
      expect($field.val()).toBe('renamed');

      $field.atomUnbind();
      refreshFormBinding(form);
      expect(model.subscriberCount()).toBe(1);
    });

    it('transfers a custom control whose form owner is exposed only through ElementInternals', async () => {
      const tag = 'aej-internals-owner';
      class InternalsControl extends HTMLElement {
        static formAssociated = true;
        readonly internals = this.attachInternals();
        value = '';
      }
      customElements.define(tag, InternalsControl);
      const $first = appendToBody(
        `<form id="internals-first"><${tag} name="field"></${tag}></form>`
      );
      const $second = appendToBody('<form id="internals-second">');
      const control = $first.find<InternalsControl>(tag).get(0) as InternalsControl;
      const first = $.atom({ field: 'first' });
      const second = $.atom({ field: 'second' });
      $first.atomForm(first);
      $second.atomForm(second);
      expect(control.value).toBe('first');

      control.setAttribute('form', 'internals-second');
      await $.nextTick();
      expect(control.internals.form).toBe($second.get(0));
      expect(control.value).toBe('second');
      control.value = 'edited';
      $(control).trigger('input');
      expect(first.value.field).toBe('first');
      expect(second.value.field).toBe('edited');

      control.setAttribute('form', 'missing-owner');
      await $.nextTick();
      expect(control.internals.form).toBeNull();
      control.value = 'unowned';
      $(control).trigger('input');
      expect(second.value.field).toBe('edited');
    });

    it.each(['truthy', 'changed'] as const)(
      'binds a browser-associated external custom control when its static flag is %s',
      async (flag) => {
        const tag = `aej-external-internals-${flag}`;
        class ExternalControl extends HTMLElement {
          static formAssociated: boolean | number = flag === 'truthy' ? 1 : true;
          readonly internals = this.attachInternals();
          value = '';
        }
        customElements.define(tag, ExternalControl);
        if (flag === 'changed') ExternalControl.formAssociated = false;
        const $form = appendToBody('<form id="external-internals-owner">');
        const $control = appendToBody(`<${tag} name="field" form="external-internals-owner">`);
        const control = $control.get(0) as ExternalControl;
        const model = $.atom({ field: 'original' });
        expect(control.internals.form).toBe($form.get(0));

        $form.atomForm(model, { debounce: 0 });
        expect(control.value).toBe('original');
        control.value = 'edited';
        $control.trigger('input');
        expect(model.value.field).toBe('edited');

        // A browser-associated control with no owner must not fall back to its ancestor.
        $form.append($control);
        $control.attr('form', 'missing-owner');
        await $.nextTick();
        expect(control.internals.form).toBeNull();
        expect(model.subscriberCount()).toBe(0);
        control.value = 'ignored';
        $control.trigger('input');
        expect(model.value.field).toBe('edited');
      }
    );

    it('transfers an external control to its new owner and follows its name', async () => {
      const $first = appendToBody('<form id="external-owner-first">');
      const $second = appendToBody('<form id="external-owner-second">');
      const $field = appendToBody('<input name="field" form="external-owner-first">');
      const first = $.atom({ field: 'first' });
      const second = $.atom({ field: 'second', renamed: 'renamed' });
      $first.atomForm(first);
      $second.atomForm(second);
      await $.nextTick();
      expect($field.val()).toBe('first');

      $field.attr('form', 'external-owner-second');
      await $.nextTick();
      expect($field.val()).toBe('second');
      expect(first.subscriberCount()).toBe(0);

      $field.attr('name', 'renamed');
      await $.nextTick();
      expect($field.val()).toBe('renamed');
      $field.val('edited').trigger('input');
      expect(first.value.field).toBe('first');
      expect(second.value).toEqual({ field: 'second', renamed: 'edited' });

      $field.removeAttr('form');
      await $.nextTick();
      $field.val('unowned').trigger('input');
      expect(second.value.renamed).toBe('edited');
      expect(registry.hasBind($field[0] as Element)).toBe(false);
    });

    it.each(['owner', 'name', 'transform', 'checkbox'] as const)(
      'does not commit an input to a stale field after %s changes its association',
      async (changed) => {
        const $first = appendToBody('<form id="commit-first">');
        const $second = appendToBody('<form id="commit-second">');
        const $field = appendToBody('<input name="field" form="commit-first">');
        if (changed === 'checkbox') $field.attr('type', 'checkbox');
        const first = $.atom({
          field: changed === 'checkbox' ? false : 'first',
          renamed: 'first renamed',
        });
        const second = $.atom({ field: changed === 'checkbox' ? false : 'second' });
        const onChange = vi.fn();
        $first.atomForm(first, {
          onChange,
          transform(_name, value) {
            if (changed === 'transform') $field.attr('form', 'commit-second');
            return value;
          },
        });
        $second.atomForm(second);
        await $.nextTick();

        if (changed === 'name') $field.attr('name', 'renamed');
        else if (changed !== 'transform') $field.attr('form', 'commit-second');
        // There must be no observer delivery between the mutation and the event.
        if (changed === 'checkbox') $field.prop('checked', true).trigger('change');
        else $field.val('stale edit').trigger('input');
        expect(first.value).toEqual({
          field: changed === 'checkbox' ? false : 'first',
          renamed: 'first renamed',
        });
        expect(onChange).not.toHaveBeenCalled();

        await $.nextTick();
        if (changed === 'checkbox') $field.prop('checked', true).trigger('change');
        else $field.val('current edit').trigger('input');
        if (changed === 'name') expect(first.value.renamed).toBe('current edit');
        else expect(second.value.field).toBe(changed === 'checkbox' ? true : 'current edit');
      }
    );

    it.each(['before blur', 'during formatting'] as const)(
      'does not overwrite the input when it loses its form owner %s',
      async (when) => {
        const $form = appendToBody('<form><input name="field"></form>');
        const $destination = appendToBody('<div>');
        const $input = $form.find<HTMLInputElement>('input');
        const input = $input.get(0) as HTMLInputElement;
        const model = $.atom({ field: 'model' });
        let blurring = false;
        $form.atomForm(model, {
          debounce: 0,
          transform: (_name, value) => (when === 'during formatting' ? 'model' : value),
          format(value) {
            if (when === 'during formatting' && blurring) $destination.append(input);
            return String(value).toUpperCase();
          },
        });
        await $.nextTick();

        const edit = 'new edit';
        if (when === 'before blur') $destination.append(input);
        blurring = true;
        $input.val(edit).trigger('blur');
        expect(input.form).toBeNull();
        expect(model.value.field).toBe('model');
        expect(input.value).toBe(edit);

        await $.nextTick();
        expect(input.value).toBe(edit);
      }
    );

    it.each(['owner', 'name'])(
      'binds using the current %s after the previous owner tears down',
      async (changed) => {
        const $first = appendToBody('<form id="teardown-owner-first">');
        const $second = appendToBody('<form id="teardown-owner-second">');
        const $field = appendToBody('<input name="field" form="teardown-owner-first">');
        const input = $field.get(0) as HTMLInputElement;
        const nativeSetter = input.setCustomValidity;
        input.setCustomValidity = function (message) {
          nativeSetter.call(this, message);
          if (message) return;
          if (changed === 'owner') this.removeAttribute('form');
          else this.name = 'renamed';
        };
        const format = vi.fn((value: unknown) => String(value));
        $first.atomForm($.atom({ field: 'first' }), { validation: { field: () => false } });
        $second.atomForm($.atom({ field: 'second', renamed: 'renamed' }), { format });
        await $.nextTick();
        expect(input.value).toBe('first');

        input.setAttribute('form', 'teardown-owner-second');
        await $.nextTick();

        expect(input.form).toBe(changed === 'owner' ? null : $second.get(0));
        expect(input.value).toBe(changed === 'owner' ? 'first' : 'renamed');
        expect(format).not.toHaveBeenCalledWith('second');
      }
    );

    it.each(['descendant', 'external'])(
      'does not undo explicit unbind when a %s control has a queued rename',
      async (location) => {
        const $form = appendToBody('<form id="unbind-renamed-owner">');
        const $field = $('<input name="first">');
        if (location === 'external') {
          appendToBody($field.attr('form', 'unbind-renamed-owner').get(0) as HTMLElement);
        } else {
          $form.append($field);
        }
        const model = $.atom({ first: 'original', second: 'renamed', third: 'latest' });
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();
        expect($field.val()).toBe('original');

        $field.attr('name', 'second').atomUnbind();
        await $.nextTick();
        expect(model.subscriberCount()).toBe(0);
        expect($field.val()).toBe('original');
        $field.val('ignored').trigger('input');
        expect(model.value.second).toBe('renamed');

        $field.attr('name', 'first');
        await $.nextTick();
        expect($field.val()).toBe('original');

        $field.attr('name', 'second').atomUnbind().attr('name', 'third');
        await $.nextTick();
        expect($field.val()).toBe('latest');
        $field.val('edited').trigger('input');
        expect(model.value.third).toBe('edited');
      }
    );

    it('keeps a field explicitly unbound after reparenting within the same form', async () => {
      const $form = appendToBody('<form><input name="field"><div></div></form>');
      const $field = $form.find<HTMLInputElement>('input');
      const field = $field.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'original', renamed: 'renamed' });
      $form.atomForm(model, { debounce: 0 });
      await $.nextTick();

      $field.atomUnbind();
      $form.find('div').append($field);
      await $.nextTick();
      expect(field.form).toBe($form.get(0));
      expect(model.subscriberCount()).toBe(0);
      model.value = { field: 'new model value', renamed: 'renamed' };
      await $.nextTick();
      expect(field.value).toBe('original');
      $field.val('ignored').trigger('input');
      expect(model.value.field).toBe('new model value');

      $field.attr('name', 'renamed');
      await $.nextTick();
      expect(field.value).toBe('renamed');
    });

    it('keeps an external field explicitly unbound when only its form moves', async () => {
      const $form = appendToBody('<form id="moving-owner">');
      const $field = appendToBody('<input name="field" form="moving-owner">');
      const $destination = appendToBody('<div>');
      const model = $.atom({ field: 'initial', renamed: 'renamed' });
      $form.atomForm(model);
      $field.atomUnbind();
      await $.nextTick();
      expect(model.subscriberCount()).toBe(0);

      model.value = { field: 'changed', renamed: 'renamed' };
      $destination.append($form);
      await $.nextTick();
      expect(($field.get(0) as HTMLInputElement).form).toBe($form.get(0));
      expect(model.subscriberCount()).toBe(0);
      expect($field.val()).toBe('initial');

      $field.attr('name', 'renamed');
      await $.nextTick();
      expect($field.val()).toBe('renamed');
      $field.val('current edit').trigger('input');
      expect(model.value.renamed).toBe('current edit');
    });

    it('binds an external control after an ownership change made after explicit unbind', async () => {
      const $first = appendToBody('<form id="unbound-first-owner">');
      const $second = appendToBody('<form id="unbound-second-owner">');
      const $field = appendToBody('<input name="field" form="unbound-first-owner">');
      const first = $.atom({ field: 'first', renamed: 'renamed' });
      const second = $.atom({ renamed: 'second' });
      $first.atomForm(first, { debounce: 0 });
      $second.atomForm(second, { debounce: 0 });
      await $.nextTick();

      $field.attr('name', 'renamed').atomUnbind().attr('form', 'unbound-second-owner');
      await $.nextTick();
      expect(first.subscriberCount()).toBe(0);
      expect($field.val()).toBe('second');
      $field.val('edited').trigger('input');
      expect(second.value.renamed).toBe('edited');
    });

    it('observes external controls when a field is named ownerDocument', async () => {
      const $form = appendToBody(
        '<form id="owner-document-form"><input name="ownerDocument"></form>'
      );
      const model = $.atom({ ownerDocument: 'internal', external: 'external' });
      $form.atomForm(model, { debounce: 0 });
      await $.nextTick();

      const $external = appendToBody('<input name="external" form="owner-document-form">');
      await $.nextTick();

      expect($external.val()).toBe('external');
      $external.val('edited').trigger('input');
      expect(model.value).toEqual({ ownerDocument: 'internal', external: 'edited' });
    });

    it.each(['querySelectorAll', 'ownerDocument'])(
      'transfers ownership when a form is named %s',
      async (name) => {
        const $first = appendToBody('<form id="named-document-owner">');
        const $second = appendToBody('<form>').attr('name', name);
        const input = appendToBody('<input name="field" form="named-document-owner">').get(
          0
        ) as HTMLInputElement;
        const first = $.atom({ field: 'first' });
        const second = $.atom({ field: 'second' });
        $first.atomForm(first);
        $second.atomForm(second);
        await $.nextTick();
        expect(input.value).toBe('first');

        $first.removeAttr('id');
        $second.attr('id', 'named-document-owner');
        // Ensure this also exercises the tree walker, not just ID mutations.
        appendToBody('<span>');
        await $.nextTick();

        expect(input.form).toBe($second.get(0));
        expect(input.value).toBe('second');
        expect(first.subscriberCount()).toBe(0);
      }
    );

    it.each(['localName', 'namespaceURI'])(
      'observes new controls when a form has a field named %s',
      async (name) => {
        const $form = appendToBody(`<form id="named-control-owner"><input name="${name}"></form>`);
        const model = $.atom({ [name]: 'initial', internal: 'inside', external: 'outside' });
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();

        const $internal = $('<input name="internal">').appendTo($form);
        const $external = appendToBody('<input name="external" form="named-control-owner">');
        await $.nextTick();

        expect($internal.val()).toBe('inside');
        expect($external.val()).toBe('outside');
        $external.val('edited').trigger('input');
        expect(model.value.external).toBe('edited');
      }
    );

    it('visits overlapping moved subtrees only once per delivery', async () => {
      const host = appendToBody('<div>').get(0) as HTMLElement;
      const shadow = host.attachShadow({ mode: 'open' });
      const $form = $('<form id="overlapping-moves">').appendTo(shadow);
      const moved = new Set<Element>();
      const nativeGetAttribute = Element.prototype.getAttribute;
      let visits = 0;
      const spy = vi.spyOn(Element.prototype, 'getAttribute').mockImplementation(function (
        this: Element,
        name
      ) {
        if (name === 'id' && moved.has(this)) visits++;
        return nativeGetAttribute.call(this, name);
      });
      try {
        $form.atomForm($.atom({ field: 'bound' }));
        await $.nextTick();
        let parent: ShadowRoot | Element = shadow;
        for (let i = 0; i < 20; i++) {
          const child = document.createElement('div');
          child.id = `moved-${i}`;
          moved.add(child);
          parent.append(child);
          parent = child;
        }
        const $field = $('<input name="field" form="overlapping-moves">').appendTo(parent);
        await $.nextTick();

        expect($field.val()).toBe('bound');
        expect(visits).toBe(moved.size);
      } finally {
        $form.atomUnbind();
        spy.mockRestore();
      }
    });

    it('follows the native owner when a referenced form ID changes', async () => {
      const $container = appendToBody('<form>');
      const $first = appendToBody('<form id="tracked-owner">');
      const $second = appendToBody('<form>');
      const container = $.atom({ field: 'container' });
      const first = $.atom({ field: 'first' });
      const second = $.atom({ field: 'second' });
      $container.atomForm(container);
      $first.atomForm(first);
      $second.atomForm(second);
      const $field = $('<input name="field" form="tracked-owner">').appendTo($container);
      await $.nextTick();
      expect($field.val()).toBe('first');

      $first.removeAttr('id');
      await $.nextTick();
      $field.val('unowned').trigger('input');
      expect(first.value.field).toBe('first');
      expect(container.value.field).toBe('container');

      $second.attr('id', 'tracked-owner');
      await $.nextTick();
      expect($field.val()).toBe('second');
      $field.val('edited').trigger('input');
      expect(second.value.field).toBe('edited');
      expect(first.value.field).toBe('first');
    });

    it('releases and rebinds an external field when a matching ID enters and leaves the tree', async () => {
      const $form = appendToBody('<form id="colliding-owner">');
      const form = $form.get(0) as HTMLFormElement;
      const $field = appendToBody('<input name="field" form="colliding-owner">');
      const field = $field.get(0) as HTMLInputElement;
      const model = $.atom({ field: 'bound' });
      $form.atomForm(model);
      await $.nextTick();
      expect(field.value).toBe('bound');

      const blocker = appendToBody('<div><span id="colliding-owner"></span></div>').get(
        0
      ) as HTMLElement;
      form.before(blocker);
      await $.nextTick();
      expect(field.form).toBeNull();
      $field.val('unowned edit').trigger('input');
      expect(model.value.field).toBe('bound');
      expect(model.subscriberCount()).toBe(0);

      blocker.remove();
      await $.nextTick();
      expect(field.form).toBe(form);
      expect(field.value).toBe('bound');
      $field.val('owned edit').trigger('input');
      expect(model.value.field).toBe('owned edit');
    });

    it('rolls back a field whose validation setup fails and still binds its sibling', async () => {
      const $form = appendToBody('<form id="validation-setup-owner">');
      const fields = appendToBody('<div>').get(0) as HTMLElement;
      const model = $.atom({ invalid: 'initial', sibling: 'bound' });
      $form.atomForm(model, { validation: { invalid: () => false } });
      const invalid = document.createElement('input');
      const sibling = document.createElement('input');
      invalid.name = 'invalid';
      sibling.name = 'sibling';
      for (const field of [invalid, sibling]) field.setAttribute('form', 'validation-setup-owner');

      const failure = new Error('validation setup failed');
      Object.defineProperty(invalid, 'setCustomValidity', {
        get() {
          throw failure;
        },
      });
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        fields.append(invalid, sibling);
        await $.nextTick();
        expect(log).toHaveBeenCalledWith(expect.any(String), failure);
        expect(sibling.value).toBe('bound');
        expect(registry.hasBind(invalid)).toBe(false);

        $form.atomUnbind();
        $(invalid).val('edit after unbind').trigger('input');
        expect(model.value.invalid).toBe('initial');
        expect(model.subscriberCount()).toBe(0);
      } finally {
        log.mockRestore();
        $(invalid).atomUnbind();
      }
    });

    it('does not resurrect a control removed after reinsertion in the same observer delivery', async () => {
      const $form = appendToBody('<form><input name="name" /></form>');
      const source = $.atom({ name: 'First' });
      $form.atomForm(source);
      const $input = $form.find('input').detach();
      await $.nextTick();
      $form.append($input);
      $input[0]?.remove();
      await $.nextTick();

      expect(source.subscriberCount()).toBe(0);
      source.value = { name: 'Changed' };
      await $.nextTick();
      expect($input.val()).toBe('First');
    });

    it('rebinds every field even if one control throws while clearing validation', async () => {
      const $form = appendToBody('<form><input name="first"><input name="second"></form>');
      const $first = $form.find<HTMLInputElement>('[name="first"]');
      const $second = $form.find('[name="second"]');
      const previous = $.atom({ first: 'old first', second: 'old second' });
      const next = $.atom({ first: 'new first', second: 'new second' });
      const validity = vi.spyOn($first[0] as HTMLInputElement, 'setCustomValidity');
      $form.atomForm(previous, { validation: { first: () => false } });
      await $.nextTick();

      const failure = new Error('custom validation cleanup failed');
      validity.mockImplementationOnce(() => {
        throw failure;
      });
      const log = vi.spyOn($.debug, 'error').mockImplementation(() => {});
      try {
        $form.atomForm(next);
        expect(log).toHaveBeenCalledWith(expect.any(String), expect.any(String), failure);
        expect(previous.subscriberCount()).toBe(0);
        expect($second.val()).toBe('new second');
        $second.val('edited').trigger('input');
        expect(previous.value.second).toBe('old second');
        expect(next.value.second).toBe('edited');
      } finally {
        validity.mockRestore();
        log.mockRestore();
        $form.atomUnbind();
      }
    });

    it('cleans up previous child bindings when re-binding a form to a second atom', async () => {
      const atomA = $.atom({ name: 'Alpha' });
      const atomB = $.atom({ name: 'Beta' });
      const $form = appendToBody('<form><input name="name" /></form>');

      $form.atomForm(atomA);
      await $.nextTick();
      const input = $form.find('input')[0] as HTMLInputElement;
      expect(input.value).toBe('Alpha');

      // Re-bind to atomB
      $form.atomForm(atomB);
      await $.nextTick();
      expect(input.value).toBe('Beta');

      // Modifying atomA should not affect input
      atomA.value = { name: 'Alpha2' };
      await $.nextTick();
      expect(input.value).toBe('Beta');

      // Modifying atomB should update input
      atomB.value = { name: 'Beta2' };
      await $.nextTick();
      expect(input.value).toBe('Beta2');
    });

    it.each(['removed', 'renamed'] as const)(
      'disposes formerly suspended external controls when a detached document form reconnects with its id %s',
      async (idChange) => {
        const $form = appendToBody('<form id="f">');
        const form = $form.get(0) as HTMLFormElement;
        const $field = appendToBody('<input name="field" form="f">');
        const field = $field.get(0) as HTMLInputElement;
        const model = $.atom({ field: 'initial' });
        $form.atomForm(model, { validation: { field: () => 'Invalid' } });
        await $.nextTick();
        expect(model.subscriberCount()).toBe(2);
        expect(field.validity.customError).toBe(true);

        $form.detach();
        await $.nextTick();
        expect(model.subscriberCount()).toBe(2);

        if (idChange === 'removed') form.removeAttribute('id');
        else form.id = 'renamed';
        document.body.append(form);
        await $.nextTick();

        expect(field.form).toBeNull();
        expect(model.subscriberCount()).toBe(0);
        expect(field.validity.customError).toBe(false);
        expect(field.checkValidity()).toBe(true);
      }
    );

    it('reconciles external controls on insertion, shadow move, and removal of a form with a field named nodeType', async () => {
      const $form = $('<form id="clobbered"><input name="nodeType"></form>');
      const form = $form.get(0) as HTMLFormElement;
      const $ext = appendToBody('<input name="ext" form="clobbered">');
      const ext = $ext.get(0) as HTMLInputElement;
      const host = appendToBody('<div>').get(0) as HTMLElement;
      const shadow = host.attachShadow({ mode: 'open' });
      const $shadowExt = $('<input name="shadowExt" form="clobbered">').appendTo(shadow);
      const shadowExt = $shadowExt.get(0) as HTMLInputElement;
      const model = $.atom({ nodeType: 'internal', ext: 'external', shadowExt: 'shadow' });

      try {
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();

        document.body.append(form);
        await $.nextTick();
        expect(ext.form).toBe(form);
        expect(ext.value).toBe('external');
        $ext.val('updated').trigger('input');
        expect(model.value.ext).toBe('updated');

        shadow.append(form);
        await $.nextTick();
        expect(ext.form).toBeNull();
        expect(registry.hasBind(ext)).toBe(false);
        $ext.val('stale').trigger('input');
        expect(model.value.ext).toBe('updated');
        expect(shadowExt.form).toBe(form);
        expect(shadowExt.value).toBe('shadow');
        $shadowExt.val('shadow-edited').trigger('input');
        expect(model.value.shadowExt).toBe('shadow-edited');

        document.body.append(form);
        await $.nextTick();
        expect(registry.hasBind(shadowExt)).toBe(false);
        expect(ext.value).toBe('updated');

        form.remove();
        await $.nextTick();
        expect(ext.form).toBeNull();
        expect(registry.hasBind(ext)).toBe(false);
        $ext.val('after-remove').trigger('input');
        expect(model.value.ext).toBe('updated');

        document.body.append(form);
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();
        expect(registry.hasBind(form)).toBe(true);
        expect(model.subscriberCount()).toBe(2);
        $form.atomUnbind();
        expect(registry.hasBind(form)).toBe(false);
        expect(registry.hasBind(ext)).toBe(false);
        expect(model.subscriberCount()).toBe(0);
      } finally {
        $form.atomUnbind();
        form.remove();
      }
    });

    it('preserves suspended external controls when an empty-descendant bound form is detached via parentless form or detached wrapper', async () => {
      $.initAEJ({ autoCleanup: false });
      const $form = appendToBody('<form id="empty-parentless-owner"></form>');
      const form = $form.get(0) as HTMLFormElement;
      const $field = appendToBody('<input name="field" form="empty-parentless-owner">');
      const model = $.atom({ field: 'bound' });
      const $wrapper = appendToBody('<div><form id="empty-wrapper-owner"></form></div>');
      const wrapper = $wrapper.get(0) as HTMLElement;
      const $wrappedForm = $wrapper.find<HTMLFormElement>('form');
      const $wrappedField = appendToBody('<input name="field" form="empty-wrapper-owner">');
      const wrapperModel = $.atom({ field: 'wrapper-bound' });

      try {
        $form.atomForm(model, { debounce: 0 });
        $wrappedForm.atomForm(wrapperModel, { debounce: 0 });
        await $.nextTick();
        expect(model.subscriberCount()).toBe(1);
        expect(wrapperModel.subscriberCount()).toBe(1);

        form.remove();
        $form.detach();
        await $.nextTick();
        expect(model.subscriberCount()).toBe(1);

        document.body.append(form);
        await $.nextTick();
        $field.val('edited').trigger('input');
        expect(model.value.field).toBe('edited');

        wrapper.remove();
        $wrapper.detach();
        await $.nextTick();
        expect(wrapperModel.subscriberCount()).toBe(1);

        const detachedContainer = document.createElement('div');
        document.body.append(wrapper);
        await $.nextTick();
        detachedContainer.append(wrapper);
        $wrapper.detach();
        await $.nextTick();
        expect(wrapperModel.subscriberCount()).toBe(1);

        document.body.append(wrapper);
        await $.nextTick();
        $wrappedField.val('wrapper-edited').trigger('input');
        expect(wrapperModel.value.field).toBe('wrapper-edited');
      } finally {
        $form.atomUnbind();
        $wrappedForm.atomUnbind();
        $.initAEJ();
      }
    });

    it('binds external fields when a foreign-document shadow host connects to an observed document', async () => {
      appendToBody('<form>').atomForm($.atom({ other: '' }));
      const foreignDoc = document.implementation.createHTMLDocument();
      const host = foreignDoc.createElement('div');
      const shadow = host.attachShadow({ mode: 'closed' });
      const $form = $('<form id="foreign-doc-shadow-form">').appendTo(shadow);
      const $field = $('<input name="field" form="foreign-doc-shadow-form">').appendTo(shadow);
      const model = $.atom({ field: 'bound' });
      try {
        $form.atomForm(model, { debounce: 0 });
        await $.nextTick();
        expect($field.prop('form')).toBeNull();
        expect(model.subscriberCount()).toBe(0);

        document.body.append(host);
        await $.nextTick();
        expect($field.prop('form')).toBe($form.get(0));
        expect($field.val()).toBe('bound');
        expect(model.subscriberCount()).toBe(1);
        $field.val('edited').trigger('input');
        expect(model.value.field).toBe('edited');
      } finally {
        $form.atomUnbind();
      }
    });

    it('preserves another detached form’s suspended external control when reparented inside a second bound form', async () => {
      const $container = appendToBody(
        '<form id="reparent-container"><div></div><input name="field" form="reparent-owner"></form>'
      );
      const $owner = appendToBody('<form id="reparent-owner">');
      const containerModel = $.atom({ field: 'container' });
      const ownerModel = $.atom({ field: 'owner' });
      $container.atomForm(containerModel, { debounce: 0 });
      $owner.atomForm(ownerModel, { debounce: 0 });
      await $.nextTick();

      const $input = $container.find<HTMLInputElement>('input');
      expect($input.val()).toBe('owner');
      expect(containerModel.subscriberCount()).toBe(0);
      expect(ownerModel.subscriberCount()).toBe(1);

      $owner.detach();
      await $.nextTick();
      expect(ownerModel.subscriberCount()).toBe(1);

      $container.find('div').append($input);
      await $.nextTick();
      expect(ownerModel.subscriberCount()).toBe(1);
      expect(containerModel.subscriberCount()).toBe(0);

      ownerModel.value = { field: 'updated while suspended' };
      await $.nextTick();
      expect($input.val()).toBe('updated while suspended');

      document.body.append($owner.get(0) as HTMLFormElement);
      await $.nextTick();
      $input.val('edited after reattach').trigger('input');
      expect(ownerModel.value.field).toBe('edited after reattach');
    });
  });
});
