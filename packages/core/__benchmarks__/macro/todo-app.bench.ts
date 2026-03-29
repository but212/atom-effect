/**
 * @fileoverview Todo app macro-benchmark
 * @description Real-world scenario: Todo application with CRUD operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '@/index';
import type { TodoItem } from '../fixtures/index.js';
import { benchEffectOptions, macroBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Todo App Scenarios', () => {
  const todosCreate = atom<TodoItem[]>([]);
  bench(
    'create 100 todos',
    () => {
      if (todosCreate.value.length > 1000) todosCreate.value = [];
      const currentLen = todosCreate.value.length;
      todosCreate.value = [
        ...todosCreate.value,
        {
          id: currentLen + 1,
          text: `Todo ${currentLen + 1}`,
          completed: false,
          createdAt: new Date(),
        },
      ];
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
      for (let i = 0; i < 100; i++) {
        todosToggle.value = todosToggle.value.map((todo: TodoItem) =>
          todo.id === i + 1 ? { ...todo, completed: !todo.completed } : todo
        );
      }
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
    `filter todos (active/completed) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        // Cycle filters
        switch (filterAtom.value) {
          case 'all':
            filterAtom.value = 'active';
            break;
          case 'active':
            filterAtom.value = 'completed';
            break;
          case 'completed':
            filterAtom.value = 'all';
            break;
        }

        const _ = filteredTodos.value;
      }
    },
    macroBenchOptions
  );

  const todosDelete = atom<TodoItem[]>(
    Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      text: `Todo ${i + 1}`,
      completed: i % 2 === 0,
      createdAt: new Date(),
    }))
  );

  bench(
    'delete todos (remove 50 from 100)',
    () => {
      // Reset if empty
      if (todosDelete.value.length < 50) {
        todosDelete.value = Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          text: `Todo ${i + 1}`,
          completed: i % 2 === 0,
          createdAt: new Date(),
        }));
      }
      const _current = todosDelete.value;
      for (let i = 0; i < 50; i++) {
        if (todosDelete.value.length > 0) {
          const idToRemove = todosDelete.value[0]!.id; // remove first
          todosDelete.value = todosDelete.value.filter((t: TodoItem) => t.id !== idToRemove);
        }
      }
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
    'complete todo app workflow',
    () => {
      // Reset state periodically to keep it stable
      if (todosWorkflow.value.length > 1000) todosWorkflow.value = [];

      // 1. Add (Trigger Effect)
      todosWorkflow.value = [
        ...todosWorkflow.value,
        { id: Date.now(), text: 'New', completed: false, createdAt: new Date() },
      ];

      // 2. Toggle (Trigger Effect)
      if (todosWorkflow.value.length > 0) {
        const first = todosWorkflow.value[0]!;
        todosWorkflow.value = [
          { ...first, completed: !first.completed },
          ...todosWorkflow.value.slice(1),
        ];
      }

      // 3. Filter change (Trigger Effect)
      filterWorkflow.value = filterWorkflow.value === 'all' ? 'active' : 'all';
    },
    macroBenchOptions
  );
});

describe('Todo App with Effects', () => {
  const todosStats = atom<TodoItem[]>([]);
  const totalCount = computed(() => todosStats.value.length);
  const completedCount = computed(
    () => todosStats.value.filter((t: TodoItem) => t.completed).length
  );
  const completionRate = computed(() =>
    totalCount.value === 0 ? 0 : (completedCount.value / totalCount.value) * 100
  );

  let _statsUpdates = 0;
  effect(() => {
    _statsUpdates++;
    const _ = completionRate.value;
  }, benchEffectOptions);

  bench(
    'todo stats with auto-update',
    () => {
      // Simulate adding todos triggering stats updates
      if (todosStats.value.length > 1000) todosStats.value = [];
      todosStats.value = [
        ...todosStats.value,
        { id: Date.now(), text: 'Item', completed: Math.random() > 0.5, createdAt: new Date() },
      ];
    },
    macroBenchOptions
  );
});
