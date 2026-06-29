/**
 * @fileoverview Consolidated macro-benchmarks for atom-effect-jquery
 * @description Real-world scenario simulations: Todo App, Dashboard, and Form scaling.
 */

import { bench, describe } from 'vitest';
import type { WritableAtom } from '../../dist';
import $ from '../../dist';
import {
  cleanupContainer,
  createContainer,
  macroBenchOptions,
  REPEATS,
  withContainer,
} from '../utils/setup';

// ============================================================================
// 1. Todo App: Comprehensive Workflow (CRUD + Stats)
// ============================================================================

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

const createTodo = (id: number, completed = false): Todo => ({
  id,
  text: `Task ${id}`,
  completed,
});

const runTodoWorkflow = (itemCount: number, toggleCount: number, deleteCount: number) =>
  withContainer(($container) => {
    const todos = $.atom<Todo[]>([]);
    const filter = $.atom<'all' | 'active' | 'completed'>('all');
    const filtered = $.computed(() => {
      const filterValue = filter.value;
      return filterValue === 'all'
        ? todos.value
        : todos.value.filter((todo) => todo.completed === (filterValue === 'completed'));
    });

    const $list = $('<ul></ul>').appendTo($container);
    $('<div class="stats"></div>')
      .appendTo($container)
      .atomText(
        $.computed(() => {
          const list = todos.value;
          return `${list.filter((todo) => todo.completed).length}/${list.length} completed`;
        })
      );

    $list.atomList(filtered, {
      key: 'id',
      render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
    });

    // 1. Add
    todos.value = Array.from({ length: itemCount }, (_, index) => createTodo(index + 1));
    // 2. Toggle
    todos.value = todos.value.map((todo, index) =>
      index < toggleCount ? { ...todo, completed: true } : todo
    );
    // 3. Filter
    filter.value = 'active';
    // 4. Delete
    todos.value = todos.value.slice(deleteCount);
    // 5. Back to all
    filter.value = 'all';
  });

describe('Macro: Todo App Scenarios', () => {
  bench(
    'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all',
    runTodoWorkflow(20, 10, 5),
    macroBenchOptions
  );

  bench(
    'full workflow (large): add(100) → toggle(50) → filter(active) → delete(25) → all',
    runTodoWorkflow(100, 50, 25),
    macroBenchOptions
  );

  bench(
    'full workflow (massive): add(500) → toggle(250) → filter(active) → delete(125) → all',
    runTodoWorkflow(500, 250, 125),
    macroBenchOptions
  );

  bench(
    'batch deletion: 500 items -> delete 250 items at once',
    withContainer(($container) => {
      const todos = $.atom(Array.from({ length: 500 }, (_, index) => createTodo(index + 1)));
      $('<ul></ul>')
        .appendTo($container)
        .atomList(todos, {
          key: 'id',
          render: (todo) => `<li>${todo.text}</li>`,
        });

      // Delete 250
      todos.value = todos.value.slice(250);
    }),
    macroBenchOptions
  );

  bench(
    'filter toggling: 500 items -> toggle active/completed/all (10 times)',
    withContainer(($container) => {
      const todos = $.atom(
        Array.from({ length: 500 }, (_, index) => createTodo(index + 1, index % 2 === 0))
      );
      const filter = $.atom<'all' | 'active' | 'completed'>('all');
      const filtered = $.computed(() => {
        const filterValue = filter.value;
        return filterValue === 'all'
          ? todos.value
          : todos.value.filter((todo) => todo.completed === (filterValue === 'completed'));
      });

      $('<ul></ul>')
        .appendTo($container)
        .atomList(filtered, {
          key: 'id',
          render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
        });

      for (let index = 0; index < 10; index++) {
        filter.value = 'active';
        filter.value = 'completed';
        filter.value = 'all';
      }
    }),
    macroBenchOptions
  );
});

// ============================================================================
// 2. Dashboard: Multi-Widget & Propagation Chain
// ============================================================================

describe('Macro: Dashboard & Reactive Topology', () => {
  bench(
    '100 widgets batch update (50 rounds)',
    withContainer(($container) => {
      const widgets = Array.from({ length: 100 }, (_, index) => {
        const value = $.atom(`Widget ${index}`);
        const width = $.atom(100);
        $('<div class="widget"><span class="label"></span></div>')
          .appendTo($container)
          .atomCss('width', width, 'px')
          .find('.label')
          .atomText(value);
        return { value, width };
      });

      for (let round = 0; round < 50; round++) {
        $.batch(() => {
          for (const widget of widgets) {
            widget.value.value = `Update ${round}`;
            widget.width.value = 100 + round;
          }
        });
      }
    }),
    macroBenchOptions
  );

  bench(
    'mount/unmount 100 components (10 cycles)',
    withContainer(($container) => {
      for (let cycle = 0; cycle < 10; cycle++) {
        for (let index = 0; index < 100; index++) {
          $('<div class="slot"></div>')
            .appendTo($container)
            .atomMount(($element) => {
              const count = $.atom(cycle * 100 + index);
              $element.html('<span class="count"></span>').find('.count').atomText(count);
              return () => {};
            });
        }
        $container.children().atomUnmount().remove();
      }
    }),
    macroBenchOptions
  );

  bench(
    'deep propagation: 10-level chain → 100 DOM widgets (50 updates)',
    withContainer(($container) => {
      const source = $.atom(0);
      const ops = [
        (x: number) => x * 2,
        (x: number) => x + 1,
        (x: number) => x * 3,
        (x: number) => x - 10,
        (x: number) => x + 5,
        (x: number) => x * 2,
        (x: number) => x - 1,
        (x: number) => x + 100,
        (x: number) => x / 2,
      ];

      let current: { value: number } = source;
      for (const op of ops) {
        const prev = current;
        current = $.computed(() => op(prev.value));
      }
      const c10 = $.computed(() => `Result: ${current.value}`);

      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($container).atomText(c10);
      for (let i = 0; i < 50; i++) source.value = i;
    }),
    macroBenchOptions
  );

  bench(
    'fan-out: 1 atom → 100 computed → 100 DOM bindings',
    withContainer(($container) => {
      const source = $.atom(0);
      for (let i = 0; i < 100; i++) {
        $('<span></span>')
          .appendTo($container)
          .atomText($.computed(() => `W${i}: ${source.value}`));
      }
      for (let i = 0; i < 100; i++) source.value = i;
    }),
    macroBenchOptions
  );

  bench(
    'fan-in: 100 atoms → 1 computed → 1 DOM binding',
    withContainer(($container) => {
      const atoms = Array.from({ length: 100 }, (_, index) => $.atom(index));
      $('<span></span>')
        .appendTo($container)
        .atomText($.computed(() => atoms.reduce((acc, someAtom) => acc + someAtom.value, 0)));
      for (let round = 0; round < 50; round++) {
        $.batch(() => {
          for (const someAtom of atoms) someAtom.value = round;
        });
      }
    }),
    macroBenchOptions
  );
});

// ============================================================================
// 3. Form Scaling: atomForm O(1) Verification
// ============================================================================

describe('Macro: atomForm O(1) Scaling', () => {
  interface FormState {
    [key: string]: string;
  }

  const createFormInContainer = ($container: JQuery, count: number): WritableAtom<FormState> => {
    const $form = $('<form></form>').appendTo($container);
    const initial: FormState = Object.fromEntries(
      Array.from({ length: count }, (_, i) => {
        $(`<input name="f${i}" />`).appendTo($form);
        return [`f${i}`, `v${i}`];
      })
    );
    const formAtom = $.atom(initial);
    $form.atomForm(formAtom);
    return formAtom;
  };

  const createUpdater = (formAtom: WritableAtom<FormState>) => {
    const refA = { ...formAtom.peek() };
    const refB = { ...formAtom.peek() };
    let toggle = true;
    return (i: number) => {
      const t = toggle ? refA : refB;
      t.f0 = `v${i}`;
      formAtom.value = { ...t };
      toggle = !toggle;
    };
  };

  const cases = [
    { count: 10, name: `Update 1 field in 10-field form (x${REPEATS})` },
    { count: 100, name: `Update 1 field in 100-field form (x${REPEATS})` },
    { count: 1000, name: `Update 1 field in 1000-field form (O(1) validation, x${REPEATS})` },
  ];

  for (const { name, count } of cases) {
    let $container: JQuery;
    let updater: (index: number) => void;

    bench(
      name,
      () => {
        for (let i = 0; i < REPEATS; i++) updater(i);
      },
      {
        ...macroBenchOptions,
        setup() {
          $container = createContainer();
          const formAtom = createFormInContainer($container, count);
          updater = createUpdater(formAtom);
        },
        teardown() {
          cleanupContainer($container);
        },
      }
    );
  }
});
