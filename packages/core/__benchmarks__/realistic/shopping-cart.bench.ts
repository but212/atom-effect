import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';
import { benchEffectOptions } from '../utils/setup.js';

describe('Shopping Cart - Realistic', () => {
  interface Item {
    id: number;
    price: number;
    qty: number;
    name: string;
  }

  interface User {
    id: number;
    isPremium: boolean;
  }

  // Setup state outside the benchmark loop
  const cart = atom<Item[]>([]);
  const user = atom<User | null>(null);

  const subtotal = computed(() =>
    cart.value.reduce((sum: number, item: Item) => sum + item.price * item.qty, 0)
  );
  const discount = computed(() => (user.value?.isPremium ? subtotal.value * 0.1 : 0));
  const tax = computed(() => (subtotal.value - discount.value) * 0.08);
  const total = computed(() => subtotal.value - discount.value + tax.value);

  let _lastTotal = 0;
  effect(() => {
    _lastTotal = total.value;
  }, benchEffectOptions);

  // Pre-generate data to avoid allocation overhead in loop
  const createNewItems = () => {
    const items: Item[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: i,
        price: (i + 1) * 10,
        qty: 1,
        name: `Item ${i}`,
      });
    }
    return items;
  };
  const initialItems = createNewItems();

  bench('E-commerce cart workflow', () => {
    // Simulate user session
    // 1. User logs in (Toggle to ensure change)
    user.value = user.value ? null : { id: 1, isPremium: true };

    // 2. Add items (or reset)
    // We toggle between empty and full to simulate activity
    if (cart.value.length === 0) {
      cart.value = initialItems;
    } else {
      // 3. Update quantities
      // Simulate typical user interaction: modify an item and trigger reactivity
      const currentItems = [...cart.value];
      // modify first item
      if (currentItems.length > 0) {
        const first = currentItems[0];
        currentItems[0] = { ...first, qty: first.qty + 1 };
        cart.value = currentItems;
      }

      // 4. Remove items logic (start over if we get too big or just toggle back to empty)
      // Let's just reset to empty to complete the cycle in the next run or here.
      cart.value = [];
    }
  });
});
