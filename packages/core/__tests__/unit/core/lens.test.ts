import { describe, expect, it } from 'vitest';
import {
  aeNextTick,
  atom,
  atomLens,
  composeLens,
  effect,
  lensFor,
  type WritableAtom,
} from '@/index';

describe('atomLens', () => {
  describe('Basic Property Access', () => {
    it('should create a two-way lens for a single-level property', () => {
      const user = atom({ name: 'Alice', age: 25 });
      const nameLens = atomLens(user, 'name');

      expect(nameLens.value).toBe('Alice');

      nameLens.value = 'Bob';
      expect(user.value.name).toBe('Bob');
      expect(nameLens.value).toBe('Bob');

      user.value = { ...user.value, name: 'Charlie' };
      expect(nameLens.value).toBe('Charlie');
    });

    it('should create a two-way lens for deep nested properties', () => {
      const store = atom({
        settings: {
          theme: 'dark',
          notifications: { email: true, sms: false },
        },
      });

      const emailLens = atomLens(store, 'settings.notifications.email');

      expect(emailLens.value).toBe(true);

      emailLens.value = false;
      expect(store.value.settings.notifications.email).toBe(false);

      const originalSettings = store.value.settings;
      emailLens.value = true;
      expect(store.value.settings).not.toBe(originalSettings);
      expect(store.value.settings.theme).toBe('dark');
    });

    it('should maintain structural sharing for unchanged sibling branches', () => {
      const store = atom({
        a: { val: 1 },
        b: { val: 2 },
      });

      const aLens = atomLens(store, 'a.val');
      const originalB = store.value.b;

      aLens.value = 10;
      expect(store.value.a.val).toBe(10);
      expect(store.value.b).toBe(originalB);
    });

    it('should optimize plain object updates while maintaining structural sharing', () => {
      const store = atom({
        a: { x: 1 },
        b: { y: 2 },
      });
      const xLens = atomLens(store, 'a.x');
      const originalB = store.value.b;

      xLens.value = 10;
      expect(store.value.a.x).toBe(10);
      expect(store.value.b).toBe(originalB);
    });
  });

  describe('Collection Support', () => {
    describe('Arrays', () => {
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
      });
    });

    describe('Maps', () => {
      it('should support Map instances with dot-notation', () => {
        const store = atom({
          data: new Map([['key', 'value']]),
        });
        const lens = (atomLens as unknown as (a: typeof store, p: string) => WritableAtom<unknown>)(
          store,
          'data.key'
        );

        expect(lens.value).toBe('value');
        lens.value = 'new value';
        expect(store.value.data).toBeInstanceOf(Map);
        expect(store.value.data.get('key')).toBe('new value');
      });

      it('should correctly update nested objects inside a Map', () => {
        const store = atom({
          data: new Map([['user', { name: 'Alice', details: { city: 'Seoul' } }]]),
        });
        const cityLens = (
          atomLens as unknown as (a: typeof store, p: string) => WritableAtom<string>
        )(store, 'data.user.details.city');

        cityLens.value = 'Busan';
        const user = store.value.data.get('user')!;
        expect(user.details.city).toBe('Busan');
        expect(user.name).toBe('Alice'); // Structural sharing check
      });
    });
  });

  describe('Reactivity & Optimization', () => {
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
      nameLens.value = 'Alice';
      expect(updateCount).toBe(0);
    });

    it('should correctly filter subscription notifications (noise filtering)', async () => {
      const store = atom({ profile: { name: 'Alice', age: 25 } });
      const nameLens = atomLens(store, 'profile.name');

      let callCount = 0;
      let lastValue: string | undefined;

      nameLens.subscribe((v) => {
        callCount++;
        lastValue = v as string;
      });

      // Update unrelated property
      store.value = { ...store.value, profile: { ...store.value.profile, age: 26 } };
      expect(callCount).toBe(0);

      // Update targeted property
      nameLens.value = 'Bob';
      await aeNextTick();
      expect(callCount).toBe(1);
      expect(lastValue).toBe('Bob');
    });

    it('should be reactive when the leaf value is legitimately undefined', async () => {
      const store = atom<{ profile: { name: string | undefined } }>({
        profile: { name: 'Alice' },
      });
      const nameLens = atomLens(store, 'profile.name');

      let lastValue: string | undefined = 'Alice';
      nameLens.subscribe((v) => {
        lastValue = v;
      });

      store.value = { profile: { name: undefined } };
      await aeNextTick();
      expect(lastValue).toBeUndefined();

      store.value = { profile: { name: 'Bob' } };
      await aeNextTick();
      expect(lastValue).toBe('Bob');
    });

    it('should share a single root subscription for multiple lens listeners (lazy logic)', () => {
      const store = atom({ a: 1 });
      const lens = atomLens(store, 'a');

      expect(store.subscriberCount()).toBe(0);

      const unsub1 = lens.subscribe(() => {});
      const unsub2 = lens.subscribe(() => {});

      expect(lens.subscriberCount()).toBe(2);
      expect(store.subscriberCount()).toBe(1); // Shared root subscription

      unsub1();
      expect(store.subscriberCount()).toBe(1);

      unsub2();
      expect(store.subscriberCount()).toBe(0);
    });

    it('should clean up subscriptions and release root atom on dispose', async () => {
      const store = atom({ name: 'Alice' });
      const lens = atomLens(store, 'name');

      let callCount = 0;
      lens.subscribe(() => {
        callCount++;
      });

      store.value = { name: 'Bob' };
      await aeNextTick();
      expect(callCount).toBe(1);

      lens.dispose();
      store.value = { name: 'Charlie' };
      await aeNextTick();
      expect(callCount).toBe(1); // No more updates after dispose
    });
  });

  describe('Composition & Factories', () => {
    it('should support lens composition', async () => {
      const store = atom({ user: { profile: { name: 'Alice' } } });
      const userLens = atomLens(store, 'user');
      const nameLens = composeLens(userLens, 'profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      await aeNextTick();
      expect(store.value.user.profile.name).toBe('Bob');
    });

    it('should support multi-tier composition', async () => {
      const store = atom({ a: { b: { c: { d: 11 } } } });
      const ab = atomLens(store, 'a.b');
      const abc = composeLens(ab, 'c');
      const abcd = composeLens(abc, 'd');

      expect(abcd.value).toBe(11);
      abcd.value = 22;
      await aeNextTick();
      expect(store.value.a.b.c.d).toBe(22);
    });

    it('should support factory creation using lensFor', () => {
      const user = atom({ profile: { name: 'Alice', email: 'alice@example.com' } });
      const lens = lensFor(user);
      const nameLens = lens('profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(user.value.profile.name).toBe('Bob');
    });
  });

  describe('Advanced Objects', () => {
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
      expect((store.value.user as User).greet()).toBe('Hi Bob');
    });

    it('should not auto-vivify intermediate null paths', () => {
      const store = atom<{ a: { b: number } | null }>({ a: null });
      const bLens = atomLens(store, 'a.b');

      bLens.value = 1;
      expect(store.value.a).toBeNull();
    });

    it('should consistently handle NaN comparisons during noise filtering', async () => {
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
  });

  describe('Security & Edge Cases', () => {
    it('should block prototype pollution via malicious path segments', () => {
      const store = atom({ data: 'initial' }) as unknown as WritableAtom<Record<string, unknown>>;

      const maliciousPaths = [
        '__proto__.polluted',
        'constructor.prototype.polluted',
        'data.__proto__.polluted',
      ];

      for (const path of maliciousPaths) {
        const lens = (atomLens as unknown as (a: unknown, p: string) => WritableAtom<unknown>)(
          store,
          path
        );
        lens.value = 'evil';
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      }
    });

    it('should block reading from dangerous internal properties', () => {
      const store = atom({ data: 'initial' });
      const lensFactory = atomLens as unknown as (a: unknown, p: string) => WritableAtom<unknown>;

      expect(lensFactory(store, '__proto__').value).toBeUndefined();
      expect(lensFactory(store, 'constructor').value).toBeUndefined();
    });
  });
});
