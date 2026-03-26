import $ from 'jquery';
import { describe, expect, it } from 'vitest';
import '@/index';

describe('$.atomLens', () => {
  it('should create a two-way lens for a single-level property', () => {
    const user = $.atom({ name: 'Alice', age: 25 });
    const nameLens = $.atomLens(user, 'name');

    // Read initial value
    expect(nameLens.value).toBe('Alice');

    // Update through lens
    nameLens.value = 'Bob';
    expect(user.value.name).toBe('Bob');
    expect(nameLens.value).toBe('Bob');

    // Update through parent atom
    user.value = { ...user.value, name: 'Charlie' };
    expect(nameLens.value).toBe('Charlie');
  });

  it('should create a two-way lens for deep nested properties', () => {
    const store = $.atom({
      settings: {
        theme: 'dark',
        notifications: {
          email: true,
          sms: false,
        },
      },
    });

    const emailLens = $.atomLens(store, 'settings.notifications.email');

    // Read initial value
    expect(emailLens.value).toBe(true);

    // Update through lens
    emailLens.value = false;
    expect(store.value.settings.notifications.email).toBe(false);
    expect(emailLens.value).toBe(false);

    // Structural Sharing check
    const originalSettings = store.value.settings;
    const originalNotifications = store.value.settings.notifications;

    emailLens.value = true;

    expect(store.value.settings).not.toBe(originalSettings);
    expect(store.value.settings.notifications).not.toBe(originalNotifications);
    expect(store.value.settings.theme).toBe('dark');
  });

  it('should maintain structural sharing for unchanged paths', () => {
    const store = $.atom({
      a: { val: 1 },
      b: { val: 2 },
    });

    const aLens = $.atomLens(store, 'a.val');
    const originalB = store.value.b;

    aLens.value = 10;

    expect(store.value.a.val).toBe(10);
    expect(store.value.b).toBe(originalB); // Reference to 'b' should be preserved
  });

  it('should not update the parent atom if the value is identical', () => {
    const store = $.atom({ profile: { name: 'Alice' } });
    const nameLens = $.atomLens(store, 'profile.name');

    let updateCount = 0;
    $.effect(() => {
      const _ = store.value;
      updateCount++;
      return undefined;
    });

    updateCount = 0;
    nameLens.value = 'Alice'; // Same value

    expect(updateCount).toBe(0);
  });

  it('should work with jQuery bindings like atomVal', async () => {
    const store = $.atom({ profile: { name: 'Alice' } });
    const nameLens = $.atomLens(store, 'profile.name');

    const $input = $('<input>').appendTo(document.body);
    $input.atomVal(nameLens);

    expect($input.val()).toBe('Alice');

    // Update from DOM
    $input.val('Bob').trigger('input');
    await $.nextTick();

    expect(store.value.profile.name).toBe('Bob');

    // Update from Atom
    nameLens.value = 'Charlie';
    await $.nextTick();
    expect($input.val()).toBe('Charlie');

    $input.remove();
  });
});
