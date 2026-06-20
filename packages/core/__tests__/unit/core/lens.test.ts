import { describe, expect, it, vi } from 'vitest';
import {
  aeNextTick,
  atom,
  atomLens,
  BRAND,
  BrandFlags,
  composeLens,
  getPathValue,
  lensFor,
  mergeLenses,
  type WritableAtom,
} from '@/index';

function unsafeAtomLens<T extends object, V = unknown>(
  atom: WritableAtom<T>,
  path: string
): WritableAtom<V> {
  return atomLens(atom, path as never) as WritableAtom<V>;
}

function setupReentrantSubscription<T, U>(source: WritableAtom<T>, subscribeTo: WritableAtom<U>) {
  const originalSubscribe = source.subscribe.bind(source);
  let nestedUnsub: (() => void) | null = null;
  let reentered = false;

  source.subscribe = (listener) => {
    const unsubscribeCallback = originalSubscribe(listener);
    return () => {
      if (!reentered) {
        reentered = true;
        nestedUnsub = subscribeTo.subscribe(() => {});
      }
      unsubscribeCallback();
    };
  };

  return {
    cleanup: () => {
      if (nestedUnsub) {
        nestedUnsub();
      }
    },
  };
}

describe('Lens System', () => {
  describe('mergeLenses()', () => {
    it('should unify multiple object-based lenses into a single intersected lens', () => {
      const user = atom({
        profile: { name: 'Alice' },
        settings: { age: 25 },
        city: 'Seoul',
      });
      const profileLens = atomLens(user, 'profile');
      const settingsLens = atomLens(user, 'settings');

      const combined = mergeLenses(profileLens, settingsLens);

      expect(combined.value).toEqual({ name: 'Alice', age: 25 });

      combined.value = { name: 'Bob', age: 30 };
      expect(user.value.profile.name).toBe('Bob');
      expect(user.value.settings.age).toBe(30);
      expect(user.value.city).toBe('Seoul');
    });

    it('should maintain reactivity across all source lenses', async () => {
      const user = atom({
        profile: { name: 'Alice' },
        settings: { age: 25 },
      });
      const profileLens = atomLens(user, 'profile');
      const settingsLens = atomLens(user, 'settings');
      const combined = mergeLenses(profileLens, settingsLens);

      let callCount = 0;
      combined.subscribe(() => {
        callCount++;
      });

      user.value = { ...user.value, profile: { name: 'Bob' } };
      await aeNextTick();
      expect(callCount).toBe(1);
      expect(combined.value.name).toBe('Bob');

      settingsLens.value = { age: 30 };
      await aeNextTick();
      expect(callCount).toBe(2);
      expect(combined.value.age).toBe(30);
    });

    it('should manage lifecycle and subscriptions correctly', () => {
      const user = atom({ a: { x: 1 }, b: { y: 2 } });
      const aLens = atomLens(user, 'a');
      const bLens = atomLens(user, 'b');
      const combined = mergeLenses(aLens, bLens);

      combined.subscribe(() => {});
      expect(user.subscriberCount()).toBe(2);

      combined.dispose();
      expect(user.subscriberCount()).toBe(0);
    });
  });

  describe('atomLens()', () => {
    describe('basic & deep nesting', () => {
      it('should handle single-level property access', () => {
        const store = atom({ count: 0 });
        const lens = atomLens(store, 'count');

        lens.value = 10;
        expect(store.value.count).toBe(10);
      });

      it('should traverse deep nested structures with structural sharing', () => {
        const store = atom({
          ui: { theme: 'dark', sidebar: { collapsed: false } },
          data: { list: [] },
        });

        const collapsedLens = atomLens(store, 'ui.sidebar.collapsed');
        const originalData = store.value.data;

        collapsedLens.value = true;
        expect(store.value.ui.sidebar.collapsed).toBe(true);
        expect(store.value.data).toBe(originalData);
      });

      it('should not auto-vivify paths through null values', () => {
        const store = atom<{ profile: { name: string } | null }>({ profile: null });
        const nameLens = atomLens(store, 'profile.name');

        nameLens.value = 'Bob';
        expect(store.value.profile).toBeNull();
      });
    });

    describe('collection support (Array & Map)', () => {
      it('should support array indices in paths', () => {
        const store = atom({ items: [{ text: 'A' }, { text: 'B' }] });
        const lens = atomLens(store, 'items.1.text');

        expect(lens.value).toBe('B');
        lens.value = 'C';
        expect(Array.isArray(store.value.items)).toBe(true);
        expect(store.value.items[1]?.text).toBe('C');
      });

      it('should handle Map instances via dot-notation keys', () => {
        const store = atom({
          registry: new Map([['user_1', { name: 'Alice' }]]),
        });
        const nameLens = unsafeAtomLens(store, 'registry.user_1.name');

        expect(nameLens.value).toBe('Alice');
        nameLens.value = 'Bob';
        expect(store.value.registry.get('user_1')?.name).toBe('Bob');
      });
    });
  });

  describe('composeLens()', () => {
    it('should support multi-tier composition', async () => {
      const store = atom({ a: { b: { c: 1 } } });
      const ab = atomLens(store, 'a.b');
      const abc = composeLens(ab, 'c');

      expect(abc.value).toBe(1);
      abc.value = 100;
      expect(store.value.a.b.c).toBe(100);
    });
  });

  describe('lensFor()', () => {
    it('should provide a lens factory', () => {
      const store = atom({ profile: { name: 'Alice' } });
      const l = lensFor(store);
      const nameLens = l('profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(store.value.profile.name).toBe('Bob');
    });
  });

  describe('getPathValue()', () => {
    it('should retrieve properties from standard objects', () => {
      expect(getPathValue({ a: { b: 42 } }, ['a', 'b'])).toBe(42);
    });

    it('should retrieve properties from Map instances', () => {
      const map = new Map<string, unknown>([['key', 'map-value']]);
      expect(getPathValue(map, ['key'])).toBe('map-value');
    });

    it('should retrieve properties from functions', () => {
      const func = Object.assign(() => {}, { customProp: 'hello-func' });
      expect(getPathValue(func, ['customProp'])).toBe('hello-func');
    });

    it('should retrieve prototype properties from primitives', () => {
      expect(getPathValue('hello', ['length'])).toBe(5);
      expect(getPathValue(true, ['toString'])).toBeTypeOf('function');
    });

    it('should return undefined for nullish values or missing paths', () => {
      expect(getPathValue(null, ['a'])).toBeUndefined();
      expect(getPathValue(undefined, ['a'])).toBeUndefined();
      expect(getPathValue({}, ['a'])).toBeUndefined();
      expect(getPathValue('hello', ['invalidProp'])).toBeUndefined();
    });

    it('should block and return undefined for forbidden keys', () => {
      const obj = {};
      expect(getPathValue(obj, ['__proto__'])).toBeUndefined();
      expect(getPathValue(obj, ['constructor'])).toBeUndefined();
      expect(getPathValue(obj, ['prototype'])).toBeUndefined();
    });
  });

  describe('reactivity & lifecycle', () => {
    it('should share a single root subscription for multiple lens listeners', () => {
      const store = atom({ x: 1 });
      const lens = atomLens(store, 'x');

      expect(store.subscriberCount()).toBe(0);

      const unsub1 = lens.subscribe(() => {});
      const unsub2 = lens.subscribe(() => {});

      expect(lens.subscriberCount()).toBe(2);
      expect(store.subscriberCount()).toBe(1);

      unsub1();
      unsub2();
      expect(store.subscriberCount()).toBe(0);
    });

    it('should filter noise and avoid redundant notifications', async () => {
      const store = atom({ a: 1, b: 2 });
      const aLens = atomLens(store, 'a');

      let callCount = 0;
      aLens.subscribe(() => {
        callCount++;
      });

      store.value = { ...store.value, b: 3 };
      await aeNextTick();
      expect(callCount).toBe(0);

      aLens.value = 1;
      await aeNextTick();
      expect(callCount).toBe(0);

      aLens.value = 10;
      await aeNextTick();
      expect(callCount).toBe(1);
    });

    it('should handle NaN correctly in noise filtering', async () => {
      const store = atom({ val: NaN });
      const lens = atomLens(store, 'val');

      let callCount = 0;
      lens.subscribe(() => {
        callCount++;
      });

      lens.value = NaN;
      await aeNextTick();
      expect(callCount).toBe(0);
    });

    it('should clear internal references in unsubscribe returned closure to prevent memory leaks', () => {
      const store = atom({ x: 1, y: 2 });
      const lens = atomLens(store, 'x');
      const spy = vi.fn();
      const unsubscribeCallback = lens.subscribe(spy);

      expect(lens.subscriberCount()).toBe(1);
      unsubscribeCallback();
      expect(lens.subscriberCount()).toBe(0);
      expect(() => unsubscribeCallback()).not.toThrow();

      const l1 = atomLens(store, 'x');
      const l2 = atomLens(store, 'y');
      const merged = mergeLenses(l1, l2);
      const mergedSpy = vi.fn();
      const mergedUnsub = merged.subscribe(mergedSpy);

      expect(merged.subscriberCount()).toBe(1);
      mergedUnsub();
      expect(merged.subscriberCount()).toBe(0);
      expect(() => mergedUnsub()).not.toThrow();
    });

    it('should handle re-entrant subscription safely in LensImpl', () => {
      const store = atom({ x: 1 });
      const lens = atomLens(store, 'x');

      const tracker = setupReentrantSubscription(store, lens);

      const unsubLens = lens.subscribe(() => {});
      expect(store.subscriberCount()).toBe(1);

      unsubLens();

      expect(store.subscriberCount()).toBe(1);
      expect(lens.subscriberCount()).toBe(1);

      tracker.cleanup();
      expect(store.subscriberCount()).toBe(0);
      expect(lens.subscriberCount()).toBe(0);
    });

    it('should handle re-entrant subscription safely in MergedLensImpl', () => {
      const store = atom({ x: 1, y: 2 });
      const l1 = atomLens(store, 'x');
      const l2 = atomLens(store, 'y');
      const merged = mergeLenses(l1, l2);

      const tracker = setupReentrantSubscription(l1, merged);

      const unsubMerged = merged.subscribe(() => {});
      expect(l1.subscriberCount()).toBe(1);

      unsubMerged();

      expect(merged.subscriberCount()).toBe(1);

      tracker.cleanup();
      expect(l1.subscriberCount()).toBe(0);
      expect(l2.subscriberCount()).toBe(0);
      expect(merged.subscriberCount()).toBe(0);
    });

    it('should preserve prototype of class instances', () => {
      class User {
        constructor(public name: string) {}
        greet() {
          return `Hi ${this.name}`;
        }
      }
      const store = atom({ user: new User('Alice') });
      const nameLens = atomLens(store, 'user.name');

      nameLens.value = 'Bob';
      expect(store.value.user).toBeInstanceOf(User);
      expect(store.value.user.greet()).toBe('Hi Bob');
    });

    it('should not throw or leak memory due to redundant _subscriberSlots declarations on subclass', () => {
      const store = atom({ x: 1, y: 2 });
      const myLens = atomLens(store, 'x');

      const unsubscribeCallback = myLens.subscribe(() => {});
      expect(myLens.subscriberCount()).toBe(1);

      myLens.value = 2;

      unsubscribeCallback();
      expect(myLens.subscriberCount()).toBe(0);

      const l1 = atomLens(store, 'x');
      const l2 = atomLens(store, 'y');
      const merged = mergeLenses(l1, l2);

      const mergedunsubscribeCallback = merged.subscribe(() => {});
      expect(merged.subscriberCount()).toBe(1);

      Reflect.set(merged, 'value', { x: 3, y: 4 });

      mergedunsubscribeCallback();
      expect(merged.subscriberCount()).toBe(0);
    });
  });

  describe('disposed lens behavior', () => {
    it('should set isDisposed to true when dispose is called on LensImpl/MergedLensImpl', () => {
      const store = atom({ x: 1, y: 2 });
      const lens = atomLens(store, 'x');
      const merged = mergeLenses(lens);

      expect(Reflect.get(lens, 'isDisposed')).toBe(false);
      expect(Reflect.get(merged, 'isDisposed')).toBe(false);

      lens.dispose();
      merged.dispose();

      expect(Reflect.get(lens, 'isDisposed')).toBe(true);
      expect(Reflect.get(merged, 'isDisposed')).toBe(true);
    });

    it('should immediately return no-op unsubscribe when subscribing to a disposed LensImpl', () => {
      const store = atom({ x: 1 });
      const lens = atomLens(store, 'x');

      lens.dispose();

      const unsubscribeCallback = lens.subscribe(() => {});
      expect(store.subscriberCount()).toBe(0);
      expect(lens.subscriberCount()).toBe(0);

      expect(() => unsubscribeCallback()).not.toThrow();
    });

    it('should immediately return no-op unsubscribe when subscribing to a disposed MergedLensImpl', () => {
      const store = atom({ x: 1, y: 2 });
      const l1 = atomLens(store, 'x');
      const l2 = atomLens(store, 'y');
      const merged = mergeLenses(l1, l2);

      merged.dispose();

      const unsubscribeCallback = merged.subscribe(() => {});
      expect(l1.subscriberCount()).toBe(0);
      expect(l2.subscriberCount()).toBe(0);
      expect(merged.subscriberCount()).toBe(0);

      expect(() => unsubscribeCallback()).not.toThrow();
    });
  });

  describe('security & prototype pollution', () => {
    it('should block prototype pollution attempts', () => {
      const store = atom({ data: {} });
      const malicious = ['__proto__.polluted', 'constructor.prototype.polluted'];

      for (const path of malicious) {
        const l = unsafeAtomLens(store, path);
        l.value = 'evil';
        expect(Reflect.get({}, 'polluted')).toBeUndefined();
      }
    });

    it('should prevent reading dangerous internal properties', () => {
      const store = atom({ data: 'initial' });
      const l = unsafeAtomLens(store, '__proto__');
      expect(l.value).toBeUndefined();
    });
  });

  describe('JSDoc examples validation', () => {
    it('should verify the JSDoc example for atomLens', () => {
      const user = atom({ profile: { name: 'Alice', age: 25 } });
      const nameLens = atomLens(user, 'profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(user.value.profile.name).toBe('Bob');
    });

    it('should verify the JSDoc example for mergeLenses', () => {
      const profile = atom({ name: 'Alice' });
      const preferences = atom({ theme: 'dark' });

      const formState = mergeLenses(profile, preferences);

      expect(formState.value).toEqual({ name: 'Alice', theme: 'dark' });

      formState.value = { name: 'Bob', theme: 'light' };

      expect(profile.value).toEqual({ name: 'Bob', theme: 'light' });
      expect(preferences.value).toEqual({ name: 'Bob', theme: 'light' });
    });

    it('should verify the JSDoc example for lensFor', () => {
      const user = atom({ profile: { name: 'Alice', age: 25 } });
      const userLens = lensFor(user);

      const nameLens = userLens('profile.name');
      const ageLens = userLens('profile.age');

      expect(nameLens.value).toBe('Alice');
      expect(ageLens.value).toBe(25);

      nameLens.value = 'Bob';
      ageLens.value = 30;

      expect(user.value.profile.name).toBe('Bob');
      expect(user.value.profile.age).toBe(30);
    });
  });

  describe('MergedWritableLensImpl mechanics', () => {
    it('should expose the correct BRAND value', () => {
      const a = atom({ x: 1 });
      const b = atom({ y: 2 });
      const merged = mergeLenses(a, b);
      expect(merged[BRAND]).toBe(BrandFlags.Atom | BrandFlags.Writable);
    });
  });
});
