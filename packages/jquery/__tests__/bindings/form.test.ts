import { beforeEach, describe, expect, it, vi } from 'vitest';
import $ from '@/index';
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
    });
  });

  describe('Modern Web Standards Integration', () => {
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
  });
});
