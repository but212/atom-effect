import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { effect } from '@/core/effect';
import { atomLens, composeLens, lensFor } from '@/core/lens';
import { nextTick } from '../../utils/test-helpers';

describe('atomLens', () => {
  describe('Basic Operations', () => {
    it('should support bidirectional access and maintain structural sharing', () => {
      const store = atom({
        user: { name: 'Alice', age: 25 },
        other: { data: 1 },
      });
      const nameLens = atomLens(store, 'user.name');
      const originalOther = store.value.other;

      // Read & Write
      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(store.value.user.name).toBe('Bob');

      // Structural sharing: 'user' should change, 'other' should remain identical
      expect(store.value.other).toBe(originalOther);
    });

    it('should maintain array integrity when traversing indices', () => {
      const store = atom({ items: [{ text: 'A' }, { text: 'B' }] });
      const secondItemLens = atomLens(store, 'items.1.text');

      secondItemLens.value = 'Updated';

      expect(Array.isArray(store.value.items)).toBe(true);
      expect(store.value.items[1]?.text).toBe('Updated');
    });

    it('should avoid redundant updates when value is unchanged', () => {
      const store = atom({ a: 1 });
      const aLens = atomLens(store, 'a');

      let updateCount = 0;
      effect(() => {
        void store.value;
        updateCount++;
      });

      updateCount = 0;
      aLens.value = 1; // Same value
      expect(updateCount).toBe(0);
    });
  });

  describe('Reactivity', () => {
    it('should notify subscribers only when the specific path changes', async () => {
      const store = atom({ profile: { name: 'Alice', age: 25 } });
      const nameLens = atomLens(store, 'profile.name');

      let callCount = 0;
      nameLens.subscribe(() => callCount++);

      // 1. Unrelated change
      store.value = { ...store.value, profile: { ...store.value.profile, age: 26 } };
      expect(callCount).toBe(0);

      // 2. Related change
      nameLens.value = 'Bob';
      await nextTick();
      expect(callCount).toBe(1);
    });

    it('should provide fine-grained reactivity in effects', async () => {
      const root = atom({ a: 1, b: 2 });
      const aLens = atomLens(root, 'a');

      let effectCount = 0;
      effect(() => {
        void aLens.value;
        effectCount++;
      });

      await nextTick();
      effectCount = 0;

      // Update unrelated 'b' -> should not re-run effect
      root.value = { a: 1, b: 3 };
      await nextTick();
      expect(effectCount).toBe(0);

      // Update lensed 'a' -> should re-run
      root.value = { a: 2, b: 3 };
      await nextTick();
      expect(effectCount).toBe(1);
    });
  });

  describe('Composition', () => {
    it('should support flattened multi-tier composition including arrays', async () => {
      const store = atom({ root: { items: [{ val: 10 }] } });
      const itemsLens = atomLens(store, 'root.items');
      const valLens = composeLens(itemsLens, '0.val');

      expect(valLens.value).toBe(10);
      valLens.value = 20;
      await nextTick();

      expect(store.value.root.items[0]?.val).toBe(20);
    });

    it('should support factory creation via lensFor', () => {
      const user = atom({ profile: { name: 'Alice' } });
      const lens = lensFor(user);
      const nameLens = lens('profile.name');

      expect(nameLens.value).toBe('Alice');
      nameLens.value = 'Bob';
      expect(user.value.profile.name).toBe('Bob');
    });
  });

  describe('Lifecycle & Engine Contract', () => {
    it('should track subscriber counts accurately for both manual and reactive hooks', async () => {
      const store = atom({ name: 'Alice' });
      const lens = atomLens(store, 'name');

      expect(lens.subscriberCount()).toBe(0);

      // Manual
      const unsub = lens.subscribe(() => {});
      expect(lens.subscriberCount()).toBe(1);
      expect(store.subscriberCount()).toBe(1);

      // Reactive
      const stop = effect(() => void lens.value);
      await nextTick();
      expect(lens.subscriberCount()).toBe(2);

      unsub();
      stop.dispose();
      await nextTick();
      expect(lens.subscriberCount()).toBe(0);
      expect(store.subscriberCount()).toBe(0);
    });

    it('should handle disposal correctly by cleaning up and blocking updates', () => {
      const store = atom({ name: 'Alice' });
      const lens = atomLens(store, 'name');

      let callCount = 0;
      lens.subscribe(() => callCount++);

      lens.dispose();

      // 1. Should not notify after disposal
      store.value = { name: 'Bob' };
      expect(callCount).toBe(0);

      // 2. Should block updates through the lens
      lens.value = 'Charlie';
      expect(store.value.name).toBe('Bob'); // Stayed 'Bob'
    });
  });
});
