/**
 * @fileoverview Todo app macro-benchmark
 * @description Real-world scenario: Todo application with CRUD operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';
import type { TodoItem } from '../fixtures/index.js';
import { macroBenchOptions } from '../utils/setup.js';

describe('Todo App Scenarios', () => {
  bench(
    'create 100 todos',
    () => {
      const todos = atom<TodoItem[]>([]);

      for (let i = 0; i < 100; i++) {
        todos.value = [
          ...todos.value,
          {
            id: i + 1,
            text: `Todo ${i + 1}`,
            completed: false,
            createdAt: new Date(),
          },
        ];
      }
    },
    macroBenchOptions
  );

  bench(
    'toggle completion status (100 todos)',
    () => {
      const todos = atom<TodoItem[]>(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          text: `Todo ${i + 1}`,
          completed: false,
          createdAt: new Date(),
        }))
      );

      // Toggle each todo
      for (let i = 0; i < 100; i++) {
        todos.value = todos.value.map((todo) =>
          todo.id === i + 1 ? { ...todo, completed: !todo.completed } : todo
        );
      }
    },
    macroBenchOptions
  );

  bench(
    'filter todos (active/completed)',
    () => {
      const todos = atom<TodoItem[]>(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          text: `Todo ${i + 1}`,
          completed: i % 3 === 0,
          createdAt: new Date(),
        }))
      );

      const filter = atom<'all' | 'active' | 'completed'>('all');

      const filteredTodos = computed(() => {
        const f = filter.value;
        if (f === 'all') return todos.value;
        if (f === 'active') return todos.value.filter((t) => !t.completed);
        return todos.value.filter((t) => t.completed);
      });

      // Test all filters
      const _ = filteredTodos.value;
      filter.value = 'active';
      const __ = filteredTodos.value;
      filter.value = 'completed';
      const ___ = filteredTodos.value;
    },
    macroBenchOptions
  );

  bench(
    'delete todos (remove 50 from 100)',
    () => {
      const todos = atom<TodoItem[]>(
        Array.from({ length: 100 }, (_, i) => ({
          id: i + 1,
          text: `Todo ${i + 1}`,
          completed: i % 2 === 0,
          createdAt: new Date(),
        }))
      );

      // Delete every other todo
      for (let i = 1; i <= 100; i += 2) {
        todos.value = todos.value.filter((t) => t.id !== i);
      }
    },
    macroBenchOptions
  );

  bench(
    'complete todo app workflow',
    () => {
      const todos = atom<TodoItem[]>([]);
      const filter = atom<'all' | 'active' | 'completed'>('all');

      const filteredTodos = computed(() => {
        const f = filter.value;
        if (f === 'all') return todos.value;
        if (f === 'active') return todos.value.filter((t) => !t.completed);
        return todos.value.filter((t) => t.completed);
      });

      const completedCount = computed(() => todos.value.filter((t) => t.completed).length);

      const activeCount = computed(() => todos.value.filter((t) => !t.completed).length);

      let displayCount = 0;
      const e = effect(() => {
        displayCount = filteredTodos.value.length;
      });

      // Create 50 todos
      for (let i = 0; i < 50; i++) {
        todos.value = [
          ...todos.value,
          {
            id: i + 1,
            text: `Todo ${i + 1}`,
            completed: false,
            createdAt: new Date(),
          },
        ];
      }

      // Toggle some todos
      for (let i = 1; i <= 25; i++) {
        todos.value = todos.value.map((todo) =>
          todo.id === i ? { ...todo, completed: true } : todo
        );
      }

      // Filter to completed
      filter.value = 'completed';
      const _ = filteredTodos.value;

      // Delete completed
      todos.value = todos.value.filter((t) => !t.completed);

      // Cleanup
      e.dispose();
    },
    macroBenchOptions
  );
});

describe('Todo App with Effects', () => {
  bench(
    'todo stats with auto-update',
    () => {
      const todos = atom<TodoItem[]>([]);

      const totalCount = computed(() => todos.value.length);
      const completedCount = computed(() => todos.value.filter((t) => t.completed).length);
      const activeCount = computed(() => todos.value.filter((t) => !t.completed).length);
      const completionRate = computed(() =>
        totalCount.value === 0 ? 0 : (completedCount.value / totalCount.value) * 100
      );

      let statsUpdates = 0;
      const e = effect(() => {
        // Simulate UI update
        statsUpdates++;
        const _ = completionRate.value;
      });

      // Add todos
      for (let i = 0; i < 50; i++) {
        todos.value = [
          ...todos.value,
          {
            id: i + 1,
            text: `Todo ${i + 1}`,
            completed: i % 4 === 0,
            createdAt: new Date(),
          },
        ];
      }

      e.dispose();
    },
    macroBenchOptions
  );
});
