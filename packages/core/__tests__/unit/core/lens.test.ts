import { describe, expect, it } from 'vitest';
import { aeNextTick, atom, atomLens, composeLens, effect, lensFor } from '@/index';

describe('atomLens', () => {
  it('should create a two-way lens for a single-level property', () => {
    const user = atom({ name: 'Alice', age: 25 });
    const nameLens = atomLens(user, 'name');

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
    const store = atom({
      settings: {
        theme: 'dark',
        notifications: {
          email: true,
          sms: false,
        },
      },
    });

    const emailLens = atomLens(store, 'settings.notifications.email');

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
    const store = atom({
      a: { val: 1 },
      b: { val: 2 },
    });

    const aLens = atomLens(store, 'a.val');
    const originalB = store.value.b;

    aLens.value = 10;

    expect(store.value.a.val).toBe(10);
    expect(store.value.b).toBe(originalB); // Reference to 'b' should be preserved
  });

  it('should not update the parent atom if the value is identical', () => {
    const store = atom({ profile: { name: 'Alice' } });
    const nameLens = atomLens(store, 'profile.name');

    let updateCount = 0;
    effect(() => {
      const _ = store.value;
      updateCount++;
      return undefined;
    });

    updateCount = 0;
    nameLens.value = 'Alice'; // Same value

    expect(updateCount).toBe(0);
  });

  it('should correctly filter and map subscription values', async () => {
    const store = atom({ profile: { name: 'Alice', age: 25 } });
    const nameLens = atomLens(store, 'profile.name');

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
    await aeNextTick();
    expect(callCount).toBe(1);
    expect(lastValue).toBe('Bob');
    expect(oldVal).toBe('Alice');

    // 3. Update parent atom with same lensed value
    store.value = { ...store.value, profile: { ...store.value.profile, name: 'Bob' } };
    await aeNextTick();
    expect(callCount).toBe(1); // Should NOT notify (Object.is check)
  });

  it('should maintain array type when property path traverses an array', () => {
    const store = atom({
      items: [
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' },
      ],
    });

    const secondTextLens = atomLens(store, 'items.1.text');
    expect(secondTextLens.value).toBe('Second');

    secondTextLens.value = 'Updated Second';

    expect(Array.isArray(store.value.items)).toBe(true);
    expect(store.value.items[1]!.text).toBe('Updated Second');
    expect(store.value.items[0]!.id).toBe(1); // Structural sharing check
  });

  it('should compose two lenses', async () => {
    const store = atom({ user: { profile: { name: 'Alice' } } });
    const userLens = atomLens(store, 'user');
    const nameLens = composeLens(userLens, 'profile.name');

    expect(nameLens.value).toBe('Alice');

    nameLens.value = 'Bob';
    await aeNextTick();
    expect(store.value.user.profile.name).toBe('Bob');

    userLens.value = { profile: { name: 'Charlie' } };
    await aeNextTick();
    expect(nameLens.value).toBe('Charlie');
  });

  it('should compose lenses multi-tier', async () => {
    const store = atom({ a: { b: { c: { d: 11 } } } });
    const ab = atomLens(store, 'a.b');
    const abc = composeLens(ab, 'c');
    const abcd = composeLens(abc, 'd');

    expect(abcd.value).toBe(11);
    abcd.value = 22;
    await aeNextTick();
    expect(store.value.a.b.c.d).toBe(22);
    expect(abc.value.d).toBe(22);
    expect(ab.value.c.d).toBe(22);
  });

  it('should compose with array indexing', async () => {
    const store = atom({
      items: [
        { id: 1, text: 'First' },
        { id: 2, text: 'Second' },
      ],
    });
    const itemsLens = atomLens(store, 'items');
    const firstTextLens = composeLens(itemsLens, '0.text');

    expect(firstTextLens.value).toBe('First');

    firstTextLens.value = 'Updated First';
    await aeNextTick();
    expect(store.value.items[0]!.text).toBe('Updated First');
  });

  it('should clean up subscriptions on dispose', async () => {
    const store = atom({ name: 'Alice' });
    const lens = atomLens(store, 'name');

    let callCount = 0;
    lens.subscribe(() => {
      callCount++;
    });

    // Initial update
    store.value = { name: 'Bob' };
    await aeNextTick();
    expect(callCount).toBe(1);

    // Dispose and update
    lens.dispose();
    store.value = { name: 'Charlie' };
    await aeNextTick();
    expect(callCount).toBe(1); // Should not increase
  });

  it('should return its own subscriber count', () => {
    const store = atom({ name: 'Alice' });
    const lens = atomLens(store, 'name');

    expect(lens.subscriberCount()).toBe(0);
    expect(store.subscriberCount()).toBe(0); // Lens doesn't subscribe until it has its own subscribers

    const unsub = lens.subscribe(() => {});
    expect(lens.subscriberCount()).toBe(1);
    expect(store.subscriberCount()).toBe(1); // Now lens is subscribed to parent

    unsub();
    expect(lens.subscriberCount()).toBe(0);
    expect(store.subscriberCount()).toBe(0); // Lens unsubscribed from parent
  });

  it('should create a factory using lensFor', () => {
    const user = atom({ profile: { name: 'Alice', email: 'alice@example.com' } });
    const lens = lensFor(user);

    const nameLens = lens('profile.name');
    const emailLens = lens('profile.email');

    expect(nameLens.value).toBe('Alice');
    expect(emailLens.value).toBe('alice@example.com');

    nameLens.value = 'Bob';
    expect(user.value.profile.name).toBe('Bob');
    expect(nameLens.value).toBe('Bob');
  });

  describe('Security: Prototype Pollution & Member Access', () => {
    it('should block prototype pollution through malicious paths', () => {
      // biome-ignore lint/suspicious/noExplicitAny: Intentional for security test
      const store = atom({ data: 'initial' }) as any;

      // 1. Direct __proto__ access via path
      // @ts-expect-error: Invalid path for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const protoLens = atomLens(store, '__proto__.polluted' as any);
      // @ts-expect-error: Invalid value for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious value for security testing
      protoLens.value = 'evil' as any;

      // Verify global prototype is NOT polluted
      // biome-ignore lint/suspicious/noExplicitAny: Explicit access to check for global pollution
      expect(({} as any).polluted).toBeUndefined();
      // Parent atom should remain unchanged as the key was blocked
      expect(store.value.data).toBe('initial');

      // 2. constructor.prototype access
      // @ts-expect-error: Invalid path for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const constProtoLens = atomLens(store, 'constructor.prototype.polluted' as any);
      // @ts-expect-error: Invalid value for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious value for security testing
      constProtoLens.value = 'evil' as any;
      // biome-ignore lint/suspicious/noExplicitAny: Explicit access to check for global pollution
      expect(({} as any).polluted).toBeUndefined();

      // 3. Nested pollution attempt
      // @ts-expect-error: Invalid path for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const nestedPollution = atomLens(store, 'data.__proto__.polluted' as any);
      // @ts-expect-error: Invalid value for lens type
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious value for security testing
      nestedPollution.value = 'evil' as any;
      // biome-ignore lint/suspicious/noExplicitAny: Explicit access to check for global pollution
      expect(({} as any).polluted).toBeUndefined();
    });

    it('should block reading from dangerous properties in getPathValue', () => {
      const store = atom({ data: 'initial' });

      // Attempt to read prototype or constructor
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const protoLens = atomLens(store, '__proto__' as any);
      expect(protoLens.value).toBeUndefined();

      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const constructorLens = atomLens(store, 'constructor' as any);
      expect(constructorLens.value).toBeUndefined();
    });

    it('should treat blocked keys as undefined for both get and set', () => {
      const store = atom({ a: { b: 1 } });
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious path for security testing
      const maliciousLens = atomLens(store, 'a.__proto__.b' as any);

      // Get should return undefined
      expect(maliciousLens.value).toBeUndefined();

      // Set should be a no-op (return original object)
      const originalValue = store.value;
      // biome-ignore lint/suspicious/noExplicitAny: Intentional malicious value for security testing
      maliciousLens.value = 100 as any;
      expect(store.value).toBe(originalValue);
    });
  });
});
