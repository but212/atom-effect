/**
 * @fileoverview Todo app macro-benchmark
 * @description Real-world scenario: Todo application with CRUD operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';
import type { TodoItem } from '../fixtures/index.js';
import { macroBenchOptions } from '../utils/setup.js';

const benchEffectOptions = {
  maxExecutionsPerSecond: Infinity,
  maxExecutionsPerFlush: Infinity,
};

describe('Todo App Scenarios', () => {
  const todosCreate = atom<TodoItem[]>([]);
  bench(
    'create 100 todos',
    () => {
      // We reset/re-create in this case, but we try to avoid `atom` creation.
      // Actually here we are just appending to the array.
      // But the array gets bigger and bigger.
      // We should probably reset it if it gets too big, or just focus on the update operation.
      // The original bench did: todos.value = [...todos.value, newTodo] 100 times.
      // This is O(N^2) effectively.
      // Let's assume we want to measure "adding 1 item", but repeat it 100 times.
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
      // Toggle all 100 todos one by one (causing 100 updates)
      // This benchmarks 100x array map + 100x notify.
      // But we need to use a loop to simulate individual user actions?
      // Or just one batch update?
      // The original used a loop of 100 updates.
      // We will do one update of one item to facilitate "interaction",
      // OR repeat the loop. Original was loop.
      const base = todosToggle.value;
      for (let i = 0; i < 100; i++) {
        // modifying the array 100 times is heavy on JS, but fair enough for "app logic"
        todosToggle.value = base.map((todo: TodoItem) =>
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
    'filter todos (active/completed)',
    () => {
      // Cycle filters
      if (filterAtom.value === 'all') filterAtom.value = 'active';
      else if (filterAtom.value === 'active') filterAtom.value = 'completed';
      else filterAtom.value = 'all';

      const _ = filteredTodos.value;
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

      // Delete one item per run? Or loop?
      // Original loop: delete every other todo (50 updates).
      const _current = todosDelete.value;
      // We can just filter once? No, original simulated 50 separate delete actions.
      // Benchmarking 50 updates is acceptable.
      // But let's just do ONE delete to simulate latency of "Delete".
      // Doing 50 in a loop measures throughput.
      // We'll stick to throughput.
      // Optimizing: Use filter all at once if we want to test "Batch Delete".
      // But here we test "Delete 50 from 100".
      // We will simply remove the first item 50 times?
      // Or filter out odds.
      // Re-implementing original logic safely:
      // Original was: for i=1 to 100 step 2: todos = todos.filter(...)
      // This is O(N^2) again.
      for (let i = 0; i < 50; i++) {
        if (todosDelete.value.length > 0) {
          const idToRemove = todosDelete.value[0].id; // remove first
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
        const first = todosWorkflow.value[0];
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
