import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';

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

  bench('E-commerce cart workflow', () => {
    const cart = atom<Item[]>([]);
    const user = atom<User | null>(null);

    const subtotal = computed(() =>
      cart.value.reduce((sum, item) => sum + item.price * item.qty, 0)
    );
    const discount = computed(() => (user.value?.isPremium ? subtotal.value * 0.1 : 0));
    const tax = computed(() => (subtotal.value - discount.value) * 0.08);
    const total = computed(() => subtotal.value - discount.value + tax.value);

    let _lastTotal = 0;
    effect(() => {
      _lastTotal = total.value;
    });

    // Simulate user session
    // 1. User logs in
    user.value = { id: 1, isPremium: true };

    // 2. Add items
    const newItems: Item[] = [];
    for (let i = 0; i < 50; i++) {
      newItems.push({
        id: i,
        price: (i + 1) * 10,
        qty: 1,
        name: `Item ${i}`,
      });
    }
    cart.value = newItems;

    // 3. Update quantities
    const currentItems = [...cart.value];
    for (let i = 0; i < 20; i++) {
      const index = i % currentItems.length;
      const item = currentItems[index];
      // Immutable update for item in array
      currentItems[index] = { ...item, qty: item.qty + 1 };
    }
    cart.value = currentItems;

    // 4. Remove items
    cart.value = cart.value.slice(0, 40);

    // 5. Logout
    user.value = null;
  });
});
