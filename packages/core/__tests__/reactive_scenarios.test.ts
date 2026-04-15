import { describe, expect, it } from 'vitest';
import { aeNextTick, atom, batch, computed } from '@/index';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

describe('Reactive Scenarios - Todo App', () => {
  it('should manage todo list logic', async () => {
    const todos = atom<Todo[]>([]);
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

interface User {
  name: string;
  email: string;
}

describe('Reactive Scenarios - Auth & App State', () => {
  it('should handle user session and derived permissions', async () => {
    const user = atom<User | null>(null);
    const isAdmin = computed(() => !!user.value?.email?.endsWith('@admin.com'));
    const greeting = computed(() => (user.value ? `Hello ${user.value.name}` : 'Guest'));

    expect(greeting.value).toBe('Guest');
    expect(isAdmin.value).toBe(false);

    user.value = { name: 'Admin', email: 'boss@admin.com' };
    await aeNextTick();
    expect(greeting.value).toBe('Hello Admin');
    expect(isAdmin.value).toBe(true);
  });
});
