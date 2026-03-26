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

  it('should correctly filter and map subscription values', async () => {
    const store = $.atom({ profile: { name: 'Alice', age: 25 } });
    const nameLens = $.atomLens(store, 'profile.name');

    let callCount = 0;
    let lastValue: string | undefined;
    let oldVal: string | undefined;

    nameLens.subscribe((v, o) => {
      callCount++;
      lastValue = v as string;
      oldVal = o as string;
    });

    // 1. Update unrelated sibling property in parent atom
    store.value = { ...store.value, profile: { ...store.value.profile, age: 26 } };
    expect(callCount).toBe(0); // Should NOT notify because 'name' didn't change

    // 2. Update the lensed property directly
    nameLens.value = 'Bob';
    await $.nextTick();
    expect(callCount).toBe(1);
    expect(lastValue).toBe('Bob');
    expect(oldVal).toBe('Alice');

    // 3. Update parent atom with same lensed value
    store.value = { ...store.value, profile: { ...store.value.profile, name: 'Bob' } };
    await $.nextTick();
    expect(callCount).toBe(1); // Should NOT notify (Object.is check)
  });

  it('should maintain array type when property path traverses an array', () => {
    const store = $.atom({
      items: [
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' },
      ],
    });

    const secondTextLens = $.atomLens(store, 'items.1.text');
    expect(secondTextLens.value).toBe('Second');

    secondTextLens.value = 'Updated Second';

    expect(Array.isArray(store.value.items)).toBe(true);
    expect(store.value.items[1]!.text).toBe('Updated Second');
    expect(store.value.items[0]!.id).toBe(1); // Structural sharing check
  });

  it('should compose two lenses', async () => {
    const store = $.atom({ user: { profile: { name: 'Alice' } } });
    const userLens = $.atomLens(store, 'user');
    const nameLens = $.composeLens(userLens, 'profile.name');

    expect(nameLens.value).toBe('Alice');

    nameLens.value = 'Bob';
    await $.nextTick();
    expect(store.value.user.profile.name).toBe('Bob');

    userLens.value = { profile: { name: 'Charlie' } };
    await $.nextTick();
    expect(nameLens.value).toBe('Charlie');
  });

  it('should compose lenses multi-tier', async () => {
    const store = $.atom({ a: { b: { c: { d: 11 } } } });
    const ab = $.atomLens(store, 'a.b');
    const abc = $.composeLens(ab, 'c');
    const abcd = $.composeLens(abc, 'd');

    expect(abcd.value).toBe(11);
    abcd.value = 22;
    await $.nextTick();
    expect(store.value.a.b.c.d).toBe(22);
    expect(abc.value.d).toBe(22);
    expect(ab.value.c.d).toBe(22);
  });

  it('should compose with array indexing', async () => {
    const store = $.atom({
      items: [
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' },
      ],
    });
    const itemsLens = $.atomLens(store, 'items');
    const firstTextLens = $.composeLens(itemsLens, '0.text');

    expect(firstTextLens.value).toBe('First');

    firstTextLens.value = 'Updated First';
    await $.nextTick();
    expect(store.value.items[0]!.text).toBe('Updated First');
  });

  it('should clean up subscriptions on dispose', async () => {
    const store = $.atom({ name: 'Alice' });
    const lens = $.atomLens(store, 'name');

    let callCount = 0;
    lens.subscribe(() => {
      callCount++;
    });

    // Initial update
    store.value = { name: 'Bob' };
    await $.nextTick();
    expect(callCount).toBe(1);

    // Dispose and update
    lens.dispose();
    store.value = { name: 'Charlie' };
    await $.nextTick();
    expect(callCount).toBe(1); // Should not increase
  });

  it('should return its own subscriber count', () => {
    const store = $.atom({ name: 'Alice' });
    const lens = $.atomLens(store, 'name');

    expect(lens.subscriberCount()).toBe(0);
    expect(store.subscriberCount()).toBe(0); // Lens doesn't subscribe until it has its own subscribers

    const unsub = lens.subscribe(() => {});
    expect(lens.subscriberCount()).toBe(1);
    expect(store.subscriberCount()).toBe(1); // Now lens is subscribed to parent

    unsub();
    expect(lens.subscriberCount()).toBe(0);
    expect(store.subscriberCount()).toBe(0); // Lens unsubscribed from parent
  });
});
