import { describe, expect, it } from 'vitest';
import $, { registry } from '@/index';

describe('Form Binding (atomForm)', () => {
  it('should sync various data paths and handle initial state efficiently', async () => {
    const data = $.atom({
      user: { name: 'Alice', profile: { age: 30 } },
      items: [{ text: 'item0' }, { text: 'item1' }],
      status: 'active',
    });

    // Track set counts for efficiency check
    let setCount = 0;
    const proto = Object.getPrototypeOf(data);
    const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value')!;
    Object.defineProperty(data, 'value', {
      get: () => originalDescriptor.get!.call(data),
      set: (v) => {
        setCount++;
        originalDescriptor.set!.call(data, v);
      },
      configurable: true,
    });

    const $form = $(`
      <form>
        <input name="user.name">
        <input name="user.profile.age">
        <input name="items[0].text">
        <input name="status">
      </form>
    `).appendTo(document.body);

    $form.atomForm(data);
    await $.nextTick();

    // Initial Sync
    expect($form.find('[name="user.name"]').val()).toBe('Alice');
    expect($form.find('[name="items[0].text"]').val()).toBe('item0');
    // Efficiency: no premature write to atom if values match
    expect(setCount).toBe(0);

    // DOM -> Atom (Deep Path)
    $form.find('[name="user.profile.age"]').val('31').trigger('input');
    await $.nextTick();
    expect(data.value.user.profile.age).toBe('31');

    // Atom -> DOM (Bulk)
    data.value = { ...data.value, status: 'inactive' };
    await $.nextTick();
    expect($form.find('[name="status"]').val()).toBe('inactive');

    $form.remove();
  });

  it('should support radio and checkbox groups with partial lifecycle', async () => {
    const data = $.atom({ gender: 'male', hobbies: ['coding'] });
    const $form = $(`
      <form>
        <input type="radio" name="gender" value="male" id="r-male">
        <input type="radio" name="gender" value="female" id="r-female">
        <input type="checkbox" name="hobbies" value="coding">
        <input type="checkbox" name="hobbies" value="music">
      </form>
    `).appendTo(document.body);

    $form.atomForm(data);
    await $.nextTick();

    // Radio: DOM -> Atom
    $form.find('#r-female').prop('checked', true).trigger('change');
    await $.nextTick();
    expect(data.value.gender).toBe('female');

    // Radio: Partial removal check
    $form.find('#r-male').remove();
    await new Promise((r) => setTimeout(r, 10));
    data.value = { ...data.value, gender: 'male' };
    await $.nextTick();
    expect($form.find('#r-female').prop('checked')).toBe(false);

    // Checkbox Group: DOM -> Atom
    $form.find('[value="music"]').prop('checked', true).trigger('change');
    await $.nextTick();
    expect(data.value.hobbies).toEqual(['coding', 'music']);

    $form.remove();
  });

  it('should handle complex dynamic lifecycle (add/remove/rename)', async () => {
    const data = $.atom({ a: '1', b: '2', c: '3' });
    const $form = $('<form><input name="a" id="id-a"></form>').appendTo(document.body);

    $form.atomForm(data);
    await $.nextTick();

    // 1. Dynamic Addition (including nested to verify observer depth)
    $form.append('<div><input name="b" id="id-b"></div>');
    await new Promise((r) => setTimeout(r, 20));
    expect($form.find('#id-b').val()).toBe('2');

    // 2. Dynamic Renaming (including Double Release & Rapid change check)
    const $inputA = $form.find('#id-a');
    $inputA.attr('name', 'c');
    await new Promise((r) => setTimeout(r, 20));
    expect($inputA.val()).toBe('3');

    // Verify it still works after rename
    $inputA.val('new-3').trigger('input');
    await $.nextTick();
    expect(data.value.c).toBe('new-3');

    // 3. Removal & Ref-counting
    $inputA.remove();
    await new Promise((r) => setTimeout(r, 20));
    data.value = { ...data.value, b: 'changed-b' };
    await $.nextTick();
    expect($form.find('#id-b').val()).toBe('changed-b');

    $form.remove();
  });

  it('should support binding via atomBind options', async () => {
    const data = $.atom({ title: 'Hello' });
    const $form = $('<form><input name="title"></form>').appendTo(document.body);
    $form.atomBind({ form: data });
    await $.nextTick();

    expect($form.find('[name="title"]').val()).toBe('Hello');
    $form.find('[name="title"]').val('World').trigger('input');
    await $.nextTick();
    expect(data.value.title).toBe('World');

    $form.remove();
  });

  it('should support configuration options (debounce, transform, onChange)', async () => {
    const data = $.atom({ text: 'init', age: 0 });
    let lastPath = '';
    const $form = $(`
      <form>
        <input name="text">
        <input name="age">
      </form>
    `).appendTo(document.body);

    $form.atomForm(data, {
      debounce: 50,
      transform: (p, v) => (p === 'age' ? Number(v) : v),
      onChange: (p) => {
        lastPath = p;
      },
    });
    await $.nextTick();

    // Transform & onChange (Wait for debounce)
    $form.find('[name="age"]').val('25').trigger('input');
    await new Promise((r) => setTimeout(r, 60));
    await $.nextTick();
    expect(data.value.age).toBe(25);
    expect(lastPath).toBe('age');

    // Debounce
    $form.find('[name="text"]').val('delayed').trigger('input');
    expect(data.value.text).toBe('init');
    await new Promise((r) => setTimeout(r, 60));
    await $.nextTick();
    expect(data.value.text).toBe('delayed');

    $form.remove();
  });

  it('should prevent infinite loops via Echo protection flag', async () => {
    const data = $.atom({ info: { count: 1 } });
    const $form = $('<form><input name="info.count"></form>').appendTo(document.body);

    let rootUpdateCount = 0;
    const proto = Object.getPrototypeOf(data);
    const originalDescriptor = Object.getOwnPropertyDescriptor(proto, 'value')!;
    Object.defineProperty(data, 'value', {
      get: () => originalDescriptor.get!.call(data),
      set: (v) => {
        rootUpdateCount++;
        originalDescriptor.set!.call(data, v);
      },
      configurable: true,
    });

    $form.atomForm(data);
    await $.nextTick();

    $form.find('[name="info.count"]').val('2').trigger('input');
    await $.nextTick();

    expect(data.value.info.count).toBe('2');
    expect(rootUpdateCount).toBe(1);

    $form.remove();
  });

  it('should only track root dispatcher in registry and cleanup on removal', async () => {
    const data = $.atom({ a: '1', b: '2' });
    const $form = $('<form><input name="a"><input name="b"></form>').appendTo(document.body);
    $form.atomForm(data);
    await $.nextTick();

    const formEl = $form[0] as HTMLFormElement;
    const record = (
      registry as unknown as { records: WeakMap<Element, { effects: unknown[] }> }
    ).records.get(formEl);
    expect(record?.effects.length).toBe(1);

    $form.remove();
    expect(
      (registry as unknown as { records: WeakMap<Element, unknown> }).records.get(formEl)
    ).toBeUndefined();
  });
});
