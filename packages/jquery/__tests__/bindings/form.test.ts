import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '@/index';

describe('Form Binding (atomForm)', () => {
  it('should sync entire form with an atom via name attributes', async () => {
    const user = $.atom({
      name: 'Alice',
      email: 'alice@example.com',
      active: true,
      role: 'admin',
    });

    const $form = $(`
      <form>
        <input type="text" name="name">
        <input type="email" name="email">
        <input type="checkbox" name="active">
        <select name="role">
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>
      </form>
    `).appendTo(document.body);

    // This method doesn't exist yet - TDD Phase 1
    $form.atomForm(user);
    await $.nextTick();

    // Initial sync: Atom -> DOM
    expect($form.find('[name="name"]').val()).toBe('Alice');
    expect($form.find('[name="email"]').val()).toBe('alice@example.com');
    expect($form.find('[name="active"]').prop('checked')).toBe(true);
    expect($form.find('[name="role"]').val()).toBe('admin');

    // DOM -> Atom: Text input
    $form.find('[name="name"]').val('Bob').trigger('input');
    await $.nextTick();
    expect(user.value.name).toBe('Bob');

    // DOM -> Atom: Checkbox
    $form.find('[name="active"]').prop('checked', false).trigger('change');
    await $.nextTick();
    expect(user.value.active).toBe(false);

    // Atom -> DOM: Bulk update
    user.value = {
      name: 'Charlie',
      email: 'charlie@example.com',
      active: true,
      role: 'user',
    };
    await $.nextTick();
    expect($form.find('[name="name"]').val()).toBe('Charlie');
    expect($form.find('[name="active"]').prop('checked')).toBe(true);
    expect($form.find('[name="role"]').val()).toBe('user');

    $form.remove();
  });

  it('should handle nested property paths (optional/future)', async () => {
    // Basic implementation might not support this yet, but good to have as a target
    const data = $.atom({
      profile: { firstName: 'John' },
    });

    const $form = $(`
      <form>
        <input type="text" name="profile.firstName">
      </form>
    `).appendTo(document.body);

    // If we decide to support dots, this should work
    $form.atomForm(data);
    await $.nextTick();

    expect($form.find('[name="profile.firstName"]').val()).toBe('John');

    $form.find('[name="profile.firstName"]').val('Doe').trigger('input');
    await $.nextTick();
    expect(data.value.profile.firstName).toBe('Doe');

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
});
