import { describe, expect, it } from 'vitest';
import { atom, batch, computed, effect } from '../src';

describe('Reactive Scenarios - Todo App', () => {
  it('should manage todo list logic', async () => {
    const todos = atom<any[]>([]);
    const filter = atom('all');

    const filtered = computed(() => {
      if (filter.value === 'active') return todos.value.filter((t) => !t.done);
      return todos.value;
    });

    const stats = computed(() => ({
      total: todos.value.length,
      active: todos.value.filter((t) => !t.done).length,
    }));

    batch(() => {
      todos.value = [
        { id: 1, text: 'Task 1', done: false },
        { id: 2, text: 'Task 2', done: true },
      ];
    });

    expect(stats.value.total).toBe(2);
    expect(stats.value.active).toBe(1);

    filter.value = 'active';
    expect(filtered.value.length).toBe(1);
  });
});

describe('Reactive Scenarios - Auth & App State', () => {
  it('should handle user session and derived permissions', async () => {
    const user = atom<any>(null);
    const isAdmin = computed(() => !!user.value?.email?.endsWith('@admin.com'));
    const greeting = computed(() => (user.value ? `Hello ${user.value.name}` : 'Guest'));

    expect(greeting.value).toBe('Guest');
    expect(isAdmin.value).toBe(false);

    user.value = { name: 'Admin', email: 'boss@admin.com' };
    await new Promise((r) => setTimeout(r, 0));
    expect(greeting.value).toBe('Hello Admin');
    expect(isAdmin.value).toBe(true);
  });

  it('should handle complex state with nested updates', async () => {
    const state = atom({ count: 0, multiplier: 1 });
    const result = computed(() => state.value.count * state.value.multiplier);
    const logs: number[] = [];

    effect(() => {
      logs.push(result.value);
    });
    await new Promise((r) => setTimeout(r, 0));

    batch(() => {
      state.value = { ...state.value, count: 10 };
      state.value = { ...state.value, multiplier: 2 };
    });

    await new Promise((r) => setTimeout(r, 0));
    expect(result.value).toBe(20);
    expect(logs[logs.length - 1]).toBe(20);
  });
});
