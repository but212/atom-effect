import { describe, expect, it, vi } from 'vitest';
import $ from '@/index';

describe('Form Binding (atomForm)', () => {
  it('should synchronize various input types and deep paths (Two-way Binding)', async () => {
    const data = $.atom({
      user: { name: 'Alice' },
      gender: 'male',
      hobbies: ['coding'],
      status: 'active',
    });

    const $form = $(`
      <form>
        <input name="user.name">
        <input type="radio" name="gender" value="male" id="r-male">
        <input type="radio" name="gender" value="female" id="r-female">
        <input type="checkbox" name="hobbies" value="coding">
        <input type="checkbox" name="hobbies" value="music">
        <input name="status">
      </form>
    `).appendTo(document.body);

    $form.atomBind({ form: data });
    await $.nextTick();

    // 1. Initial Sync
    expect($form.find('[name="user.name"]').val()).toBe('Alice');
    expect($form.find('#r-male').prop('checked')).toBe(true);
    expect($form.find('[value="coding"]').prop('checked')).toBe(true);

    // 2. DOM -> Atom (Deep & Group)
    $form.find('[name="user.name"]').val('Bob').trigger('input');
    $form.find('#r-female').prop('checked', true).trigger('change');
    $form.find('[value="music"]').prop('checked', true).trigger('change');
    await $.nextTick();

    expect(data.value.user.name).toBe('Bob');
    expect(data.value.gender).toBe('female');
    expect(data.value.hobbies).toEqual(['coding', 'music']);

    // 3. Atom -> DOM (Bulk Update)
    data.value = { ...data.value, status: 'inactive' };
    await $.nextTick();
    expect($form.find('[name="status"]').val()).toBe('inactive');

    $form.remove();
  });

  it('should handle dynamic lifecycle (MutationObserver logic)', async () => {
    const data = $.atom({ a: '1', b: '2', c: '3' });
    const $form = $('<form><input name="a" id="id-a"></form>').appendTo(document.body);
    $form.atomForm(data);
    await $.nextTick();

    // 1. Dynamic Addition
    $form.append('<div><input name="b" id="id-b"></div>');
    await new Promise((r) => setTimeout(r, 20)); // Wait for MutationObserver
    expect($form.find('#id-b').val()).toBe('2');

    // 2. Dynamic Renaming
    const $inputA = $form.find('#id-a');
    $inputA.attr('name', 'c');
    await new Promise((r) => setTimeout(r, 20));
    expect($inputA.val()).toBe('3');

    // 3. Removal & Ref-counting Check
    $inputA.remove();
    await new Promise((r) => setTimeout(r, 20));
    data.value = { ...data.value, b: 'changed-b' };
    await $.nextTick();
    expect($form.find('#id-b').val()).toBe('changed-b');

    $form.remove();
  });

  it('should apply configuration options (debounce, transform, onChange)', async () => {
    const data = $.atom({ age: 20, text: 'init', ids: [1] });
    const onChange = vi.fn();
    const $form = $(`
      <form>
        <input name="age">
        <input name="text">
        <input type="checkbox" name="ids" value="2" id="id-2">
      </form>
    `).appendTo(document.body);

    $form.atomForm(data, {
      debounce: 30,
      transform: (p: string, v: unknown) => {
        if (p === 'age') return Number(v);
        if (p === 'ids' && Array.isArray(v)) return v.map(Number);
        return v;
      },
      onChange,
    });
    await $.nextTick();

    // 1. Transform & OnChange
    $form.find('[name="age"]').val('25').trigger('input');
    await new Promise((r) => setTimeout(r, 50));
    expect(data.value.age).toBe(25);
    expect(onChange).toHaveBeenCalledWith('age', 25);

    // 2. Debounce
    $form.find('[name="text"]').val('delayed').trigger('input');
    expect(data.value.text).toBe('init');
    await new Promise((r) => setTimeout(r, 50));
    expect(data.value.text).toBe('delayed');

    // 3. Checkbox Group + Transform (Merged case)
    $form.find('#id-2').prop('checked', true).trigger('change');
    await new Promise((r) => setTimeout(r, 50));
    expect(data.value.ids).toEqual([1, 2]);

    $form.remove();
  });

  it('should prevent infinite loops and co-exist with other bindings', async () => {
    const data = $.atom({ text: 'val' });
    const active = $.atom(true);
    const $form = $('<form><input name="text"></form>').appendTo(document.body);
    const $input = $form.find('input');

    $input.atomClass('active', active);
    $form.atomForm(data);
    await $.nextTick();

    // 1. Echo protection (no redundant sets)
    let updateCount = 0;
    data.subscribe(() => updateCount++);

    $input.val('new').trigger('input');
    await $.nextTick();
    expect(data.value.text).toBe('new');
    expect(updateCount).toBe(1); // Should only update once despite being a two-way bind

    // 2. Interaction check (Interop)
    active.value = false;
    await $.nextTick();
    expect($input.hasClass('active')).toBe(false);
    expect($input.val()).toBe('new');

    $form.remove();
  });
});
