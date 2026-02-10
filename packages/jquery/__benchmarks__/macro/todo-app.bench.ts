/**
 * @fileoverview Todo app macro-benchmark
 * @description Real-world scenario: Todo CRUD with full DOM reflection via jQuery bindings
 */

import { bench, describe } from 'vitest';
import $ from '../../src/index';
import { cleanupContainer, createContainer, macroBenchOptions } from '../utils/setup';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

let nextId = 1;
function createTodo(text: string): Todo {
  return { id: nextId++, text, completed: false };
}

describe('Todo App — DOM Scenarios', () => {
  bench(
    'add 50 todos (atomList + render)',
    () => {
      const $c = createContainer();
      const todos = $.atom<Todo[]>([]);
      $c.atomList(todos, {
        key: 'id',
        render: (todo) =>
          `<li class="todo-item"><span class="text">${todo.text}</span><button class="delete">x</button></li>`,
      });

      for (let i = 0; i < 50; i++) {
        todos.value = [...todos.value, createTodo(`Task ${i}`)];
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'toggle 50 todos (update callback)',
    () => {
      const $c = createContainer();
      const initial = Array.from({ length: 50 }, (_, i) => createTodo(`Task ${i}`));
      const todos = $.atom<Todo[]>(initial);

      $c.atomList(todos, {
        key: 'id',
        render: (todo) =>
          `<li class="${todo.completed ? 'completed' : ''}"><span>${todo.text}</span></li>`,
        update: ($el, todo) => {
          $el.toggleClass('completed', todo.completed);
        },
      });

      // Toggle all
      todos.value = todos.value.map((t) => ({ ...t, completed: !t.completed }));
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'filter switch (computed → atomList re-render)',
    () => {
      const $c = createContainer();
      const allTodos = $.atom<Todo[]>(
        Array.from({ length: 100 }, (_, i) => ({
          ...createTodo(`Task ${i}`),
          completed: i % 3 === 0,
        }))
      );
      const filter = $.atom<'all' | 'active' | 'completed'>('all');
      const filtered = $.computed(() => {
        const f = filter.value;
        if (f === 'all') return allTodos.value;
        if (f === 'active') return allTodos.value.filter((t) => !t.completed);
        return allTodos.value.filter((t) => t.completed);
      });

      $c.atomList(filtered, {
        key: 'id',
        render: (todo) => `<li>${todo.text}</li>`,
      });

      // Cycle filters
      filter.value = 'active';
      filter.value = 'completed';
      filter.value = 'all';
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'full workflow: add → toggle → filter → delete',
    () => {
      const $c = createContainer();
      const todos = $.atom<Todo[]>([]);
      const filter = $.atom<'all' | 'active' | 'completed'>('all');
      const filtered = $.computed(() => {
        const f = filter.value;
        if (f === 'all') return todos.value;
        if (f === 'active') return todos.value.filter((t) => !t.completed);
        return todos.value.filter((t) => t.completed);
      });

      // Stats
      const totalCount = $.computed(() => todos.value.length);
      const completedCount = $.computed(() => todos.value.filter((t) => t.completed).length);

      // DOM
      const $list = $('<ul></ul>').appendTo($c);
      const $stats = $('<div class="stats"></div>').appendTo($c);
      $stats.atomText($.computed(() => `${completedCount.value}/${totalCount.value} completed`));

      $list.atomList(filtered, {
        key: 'id',
        render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
      });

      // 1. Add 20 todos
      for (let i = 0; i < 20; i++) {
        todos.value = [...todos.value, createTodo(`Task ${i}`)];
      }

      // 2. Toggle first 10
      todos.value = todos.value.map((t, i) => (i < 10 ? { ...t, completed: true } : t));

      // 3. Filter to active
      filter.value = 'active';

      // 4. Delete 5
      todos.value = todos.value.slice(5);

      // 5. Back to all
      filter.value = 'all';

      cleanupContainer($c);
    },
    macroBenchOptions
  );
});

describe('Todo App — Stats with Effects', () => {
  bench(
    'todo stats auto-update (add 100 items)',
    () => {
      const $c = createContainer();
      const todos = $.atom<Todo[]>([]);
      const total = $.computed(() => todos.value.length);
      const done = $.computed(() => todos.value.filter((t) => t.completed).length);
      const rate = $.computed(() => (total.value === 0 ? 0 : (done.value / total.value) * 100));

      $('<span class="total"></span>').appendTo($c).atomText(total);
      $('<span class="done"></span>').appendTo($c).atomText(done);
      $('<span class="rate"></span>')
        .appendTo($c)
        .atomText(rate, (v) => `${v.toFixed(1)}%`);

      for (let i = 0; i < 100; i++) {
        todos.value = [
          ...todos.value,
          { ...createTodo(`Item ${i}`), completed: Math.random() > 0.5 },
        ];
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );
});
