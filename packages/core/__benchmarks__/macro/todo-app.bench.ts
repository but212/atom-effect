/**
 * @fileoverview Todo app macro-benchmark
 * @description Real-world scenario: Todo application with CRUD operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import type { TodoItem } from '../fixtures/index.js';
import { benchEffectOptions, macroBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Todo App Scenarios', () => {
  const todosCreate = atom<TodoItem[]>([]);
  bench(
    'create 100 todos (bulk update)',
    () => {
      const currentLen = todosCreate.value.length;
      if (currentLen > 5000) todosCreate.value = [];

      const newBatch: TodoItem[] = [...todosCreate.value];
      for (let i = 0; i < 100; i++) {
        const id = currentLen + i + 1;
        newBatch.push({
          id,
          text: `Todo ${id}`,
          completed: false,
          createdAt: new Date(),
        });
      }
      todosCreate.value = newBatch;
      return todosCreate.value as any;
    },
    macroBenchOptions
  );

  const todosToggle = atom<TodoItem[]>(
    Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      text: `Todo ${i + 1}`,
      completed: false,
      createdAt: new Date(),
    }))
  );

  bench(
    'toggle completion status (100 todos)',
    () => {
      // Toggle all items in the list
      todosToggle.value = todosToggle.value.map((todo: TodoItem) => ({
        ...todo,
        completed: !todo.completed,
      }));
      return todosToggle.value as any;
    },
    macroBenchOptions
  );

  const todosFilter = atom<TodoItem[]>(
    Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      text: `Todo ${i + 1}`,
      completed: i % 3 === 0,
      createdAt: new Date(),
    }))
  );
  const filterAtom = atom<'all' | 'active' | 'completed'>('all');
  const filteredTodos = computed(() => {
    const f = filterAtom.value;
    if (f === 'all') return todosFilter.value;
    if (f === 'active') return todosFilter.value.filter((t: TodoItem) => !t.completed);
    return todosFilter.value.filter((t: TodoItem) => t.completed);
  });

  bench(
    `filter switch (x${REPEATS})`,
    () => {
      let last1, last2, last3;
      for (let i = 0; i < REPEATS; i++) {
        // Cycle filters
        filterAtom.value = 'active';
        last1 = filteredTodos.value;
        filterAtom.value = 'completed';
        last2 = filteredTodos.value;
        filterAtom.value = 'all';
        last3 = filteredTodos.value;
      }
      return [last1, last2, last3] as any;
    },
    macroBenchOptions
  );

  const todosDelete = atom<TodoItem[]>([]);

  bench(
    'delete todos (50 items)',
    () => {
      // Reset to 100 items if we've deleted too many
      if (todosDelete.value.length < 50) {
        todosDelete.value = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          text: `Todo ${i + 1}`,
          completed: i % 2 === 0,
          createdAt: new Date(),
        }));
      }

      // Delete top 50
      todosDelete.value = todosDelete.value.slice(50);
      return todosDelete.value as any;
    },
    macroBenchOptions
  );

  const todosWorkflow = atom<TodoItem[]>([]);
  const filterWorkflow = atom<'all' | 'active' | 'completed'>('all');
  const filteredWorkflow = computed(() => {
    const f = filterWorkflow.value;
    if (f === 'all') return todosWorkflow.value;
    if (f === 'active') return todosWorkflow.value.filter((t: TodoItem) => !t.completed);
    return todosWorkflow.value.filter((t: TodoItem) => t.completed);
  });
  let _displayCount = 0;
  effect(() => {
    _displayCount = filteredWorkflow.value.length;
  }, benchEffectOptions);

  bench(
    'full workflow: add → toggle → filter → delete',
    () => {
      // 1. Reset
      todosWorkflow.value = [];
      filterWorkflow.value = 'all';

      // 2. Add 20
      const nextBatch: TodoItem[] = [];
      for (let i = 0; i < 20; i++) {
        nextBatch.push({ id: i, text: 'New', completed: false, createdAt: new Date() });
      }
      todosWorkflow.value = nextBatch;

      // 3. Toggle 10
      todosWorkflow.value = todosWorkflow.value.map((t, i) =>
        i < 10 ? { ...t, completed: true } : t
      );

      // 4. Filter
      filterWorkflow.value = 'active';

      // 5. Delete 5
      todosWorkflow.value = todosWorkflow.value.slice(5);

      // 6. Back to all
      filterWorkflow.value = 'all';
      return _displayCount as any;
    },
    macroBenchOptions
  );
});

describe('Todo App Stats Architecture', () => {
  const todosStats = atom<TodoItem[]>([]);
  const totalCount = computed(() => todosStats.value.length);
  const completedCount = computed(
    () => todosStats.value.filter((t: TodoItem) => t.completed).length
  );
  const completionRate = computed(() =>
    totalCount.value === 0 ? 0 : (completedCount.value / totalCount.value) * 100
  );

  let _rate = 0;
  effect(() => {
    _rate = completionRate.value;
  }, benchEffectOptions);

  bench(
    'stat propagation (add 100 items)',
    () => {
      const items: TodoItem[] = [];
      for (let i = 0; i < 100; i++) {
        items.push({ id: i + 1, text: 'Item', completed: i % 2 === 0, createdAt: new Date() });
      }
      todosStats.value = items;
      return _rate as any;
    },
    macroBenchOptions
  );
});
