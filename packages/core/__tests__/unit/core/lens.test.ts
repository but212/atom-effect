import { describe, expect, it } from 'vitest';
import {
  aeNextTick,
  atom,
  atomLens,
  composeLens,
  lensFor,
  mergeLenses,
  type WritableAtom,
} from '@/index';

describe('Lens System', () => {
  describe('State Composition: mergeLenses', () => {
    it('should unify multiple object-based lenses into a single intersected lens', () => {
      const user = atom({
        profile: { name: 'Alice' },
        settings: { age: 25 },
        city: 'Seoul',
      });
      const profileLens = atomLens(user, 'profile');
      const settingsLens = atomLens(user, 'settings');

      const combined = mergeLenses(profileLens, settingsLens);

      // Verify merged read
      expect(combined.value).toEqual({ name: 'Alice', age: 25 });

      // Verify unified write (Two-way binding)
      combined.value = { name: 'Bob', age: 30 };
      expect(user.value.profile.name).toBe('Bob');
      expect(user.value.settings.age).toBe(30);
      expect(user.value.city).toBe('Seoul'); // Unrelated field preserved
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

      // Update via root
      user.value = { ...user.value, profile: { name: 'Bob' } };
      await aeNextTick();
      expect(callCount).toBe(1);
      expect(combined.value.name).toBe('Bob');

      // Update via sibling lens
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
      // Each source lens subscribes to the root
      expect(user.subscriberCount()).toBe(2);

      combined.dispose();
      expect(user.subscriberCount()).toBe(0);
    });
  });

  describe('Path-based Access: atomLens', () => {
    describe('Basic & Deep Nesting', () => {
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
        expect(store.value.data).toBe(originalData); // Structural sharing preserved
      });

      it('should not auto-vivify paths through null values', () => {
        const store = atom<{ profile: { name: string } | null }>({ profile: null });
        const nameLens = atomLens(store, 'profile.name');

        nameLens.value = 'Bob';
        expect(store.value.profile).toBeNull(); // Should fail gracefully
      });
    });

    describe('Collection Support (Array & Map)', () => {
      it('should support array indices in paths', () => {
        const store = atom({ items: [{ text: 'A' }, { text: 'B' }] });
        const lens = atomLens(store, 'items.1.text');

        expect(lens.value).toBe('B');
        lens.value = 'C';
        expect(Array.isArray(store.value.items)).toBe(true);
        expect(store.value.items[1]!.text).toBe('C');
      });

      it('should handle Map instances via dot-notation keys', () => {
        const store = atom({
          registry: new Map([['user_1', { name: 'Alice' }]]),
        });
        // Cast for testing arbitrary paths
        const nameLens = (
          atomLens as unknown as (a: typeof store, p: string) => WritableAtom<string>
        )(store, 'registry.user_1.name');

        expect(nameLens.value).toBe('Alice');
        nameLens.value = 'Bob';
        expect(store.value.registry.get('user_1')?.name).toBe('Bob');
      });
    });
  });

  describe('Reactive Lifecycle & Optimization', () => {
    it('should share a single root subscription for multiple lens listeners', () => {
      const store = atom({ x: 1 });
      const lens = atomLens(store, 'x');

      expect(store.subscriberCount()).toBe(0);

      const unsub1 = lens.subscribe(() => {});
      const unsub2 = lens.subscribe(() => {});

      expect(lens.subscriberCount()).toBe(2);
      expect(store.subscriberCount()).toBe(1); // Shared root subscription

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

      // Update unrelated property
      store.value = { ...store.value, b: 3 };
      await aeNextTick();
      expect(callCount).toBe(0);

      // Update targeted property with identical value
      aLens.value = 1;
      await aeNextTick();
      expect(callCount).toBe(0);

      // Legit update
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
  });

  describe('Advanced Patterns & Composition', () => {
    it('should support multi-tier composition via composeLens', async () => {
      const store = atom({ a: { b: { c: 1 } } });
      const ab = atomLens(store, 'a.b');
      const abc = composeLens(ab, 'c');

      expect(abc.value).toBe(1);
      abc.value = 100;
      expect(store.value.a.b.c).toBe(100);
    });

    it('should provide a lens factory via lensFor', () => {
      const store = atom({ profile: { name: 'Alice' } });
      const l = lensFor(store);
      const nameLens = l('profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(store.value.profile.name).toBe('Bob');
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
      expect((store.value.user as User).greet()).toBe('Hi Bob');
    });
  });

  describe('Robustness & Security', () => {
    it('should block prototype pollution attempts', () => {
      const store = atom({ data: {} }) as unknown as WritableAtom<Record<string, unknown>>;
      const malicious = ['__proto__.polluted', 'constructor.prototype.polluted'];

      for (const path of malicious) {
        const l = (atomLens as unknown as (a: unknown, p: string) => WritableAtom<unknown>)(
          store,
          path
        );
        l.value = 'evil';
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      }
    });

    it('should prevent reading dangerous internal properties', () => {
      const store = atom({ data: 'initial' });
      const l = (atomLens as unknown as (a: unknown, p: string) => WritableAtom<unknown>)(
        store,
        '__proto__'
      );
      expect(l.value).toBeUndefined();
    });
  });
});
