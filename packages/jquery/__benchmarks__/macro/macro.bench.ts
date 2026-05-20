/**
 * @fileoverview Consolidated macro-benchmarks for atom-effect-jquery
 * @description Real-world scenario simulations: Todo App, Dashboard, and Form scaling.
 */

import { afterAll, bench, describe } from 'vitest';
import type { WritableAtom } from '../../dist';
import $ from '../../dist';
import { cleanupContainer, createContainer, macroBenchOptions, REPEATS } from '../utils/setup';

// ============================================================================
// 1. Todo App: Comprehensive Workflow (CRUD + Stats)
// ============================================================================

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

let nextId = 1;
function createTodo(text: string): Todo {
  return { id: nextId++, text, completed: false };
}

function runTodoWorkflow(itemCount: number, toggleCount: number, deleteCount: number): void {
  const $c = createContainer();
  const todos = $.atom<Todo[]>([]);
  const filter = $.atom<'all' | 'active' | 'completed'>('all');
  const filtered = $.computed(() => {
    const f = filter.value;
    if (f === 'all') return todos.value;
    if (f === 'active') return todos.value.filter((t) => !t.completed);
    return todos.value.filter((t) => t.completed);
  });

  const totalCount = $.computed(() => todos.value.length);
  const completedCount = $.computed(() => todos.value.filter((t) => t.completed).length);

  const $list = $('<ul></ul>').appendTo($c);
  const $stats = $('<div class="stats"></div>').appendTo($c);
  $stats.atomText($.computed(() => `${completedCount.value}/${totalCount.value} completed`));

  $list.atomList(filtered, {
    key: 'id',
    render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
  });

  // 1. Add
  todos.value = Array.from({ length: itemCount }, (_, i) => createTodo(`Task ${i}`));
  // 2. Toggle
  todos.value = todos.value.map((t, i) => (i < toggleCount ? { ...t, completed: true } : t));
  // 3. Filter
  filter.value = 'active';
  // 4. Delete
  todos.value = todos.value.slice(deleteCount);
  // 5. Back to all
  filter.value = 'all';

  cleanupContainer($c);
}

describe('Macro: Todo App Scenarios', () => {
  bench(
    'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all',
    () => {
      runTodoWorkflow(20, 10, 5);
    },
    macroBenchOptions
  );

  bench(
    'full workflow (large): add(100) → toggle(50) → filter(active) → delete(25) → all',
    () => {
      runTodoWorkflow(100, 50, 25);
    },
    macroBenchOptions
  );

  bench(
    'full workflow (massive): add(500) → toggle(250) → filter(active) → delete(125) → all',
    () => {
      runTodoWorkflow(500, 250, 125);
    },
    macroBenchOptions
  );

  bench(
    'batch deletion: 500 items -> delete 250 items at once',
    () => {
      const $c = createContainer();
      const todos = $.atom<Todo[]>(Array.from({ length: 500 }, (_, i) => createTodo(`Task ${i}`)));
      const $list = $('<ul></ul>').appendTo($c);
      $list.atomList(todos, {
        key: 'id',
        render: (todo) => `<li>${todo.text}</li>`,
      });

      // Delete 250
      todos.value = todos.value.slice(250);

      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'filter toggling: 500 items -> toggle active/completed/all (10 times)',
    () => {
      const $c = createContainer();
      const todos = $.atom<Todo[]>(
        Array.from({ length: 500 }, (_, i) => ({
          ...createTodo(`Task ${i}`),
          completed: i % 2 === 0,
        }))
      );
      const filter = $.atom<'all' | 'active' | 'completed'>('all');
      const filtered = $.computed(() => {
        const f = filter.value;
        if (f === 'all') return todos.value;
        if (f === 'active') return todos.value.filter((t) => !t.completed);
        return todos.value.filter((t) => t.completed);
      });

      const $list = $('<ul></ul>').appendTo($c);
      $list.atomList(filtered, {
        key: 'id',
        render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
      });

      for (let i = 0; i < 10; i++) {
        filter.value = 'active';
        filter.value = 'completed';
        filter.value = 'all';
      }

      cleanupContainer($c);
    },
    macroBenchOptions
  );
});

// ============================================================================
// 2. Dashboard: Multi-Widget & Propagation Chain
// ============================================================================

describe('Macro: Dashboard & Reactive Topology', () => {
  bench(
    '100 widgets batch update (50 rounds)',
    () => {
      const $c = createContainer();
      const widgets = Array.from({ length: 100 }, (_, i) => ({
        value: $.atom(`Widget ${i}`),
        width: $.atom(100),
      }));

      for (const w of widgets) {
        const $w = $('<div class="widget"><span class="label"></span></div>').appendTo($c);
        $w.find('.label').atomText(w.value);
        $w.atomCss('width', w.width, 'px');
      }

      for (let round = 0; round < 50; round++) {
        $.batch(() => {
          for (const w of widgets) {
            w.value.value = `Update ${round}`;
            w.width.value = 100 + round;
          }
        });
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'mount/unmount 100 components (10 cycles)',
    () => {
      const $c = createContainer();
      for (let cycle = 0; cycle < 10; cycle++) {
        const slots: JQuery[] = [];
        for (let i = 0; i < 100; i++) {
          const $slot = $('<div class="slot"></div>').appendTo($c);
          $slot.atomMount(($el) => {
            const count = $.atom(cycle * 100 + i);
            $el.html('<span class="count"></span>').find('.count').atomText(count);
            return () => {};
          });
          slots.push($slot);
        }
        for (const $s of slots) {
          $s.atomUnmount();
          $s.remove();
        }
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'deep propagation: 10-level chain → 100 DOM widgets (50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom(0);
      const c1 = $.computed(() => source.value * 2);
      const c2 = $.computed(() => c1.value + 1);
      const c3 = $.computed(() => c2.value * 3);
      const c4 = $.computed(() => c3.value - 10);
      const c5 = $.computed(() => c4.value + 5);
      const c6 = $.computed(() => c5.value * 2);
      const c7 = $.computed(() => c6.value - 1);
      const c8 = $.computed(() => c7.value + 100);
      const c9 = $.computed(() => c8.value / 2);
      const c10 = $.computed(() => `Result: ${c9.value}`);

      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($c).atomText(c10);
      for (let i = 0; i < 50; i++) source.value = i;
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'fan-out: 1 atom → 100 computed → 100 DOM bindings',
    () => {
      const $c = createContainer();
      const source = $.atom(0);
      for (let i = 0; i < 100; i++) {
        const derived = $.computed(() => `W${i}: ${source.value}`);
        $('<span></span>').appendTo($c).atomText(derived);
      }
      for (let i = 0; i < 100; i++) source.value = i;
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'fan-in: 100 atoms → 1 computed → 1 DOM binding',
    () => {
      const $c = createContainer();
      const atoms = Array.from({ length: 100 }, (_, i) => $.atom(i));
      const sum = $.computed(() => {
        let s = 0;
        for (const a of atoms) s += a.value;
        return s;
      });
      $('<span></span>').appendTo($c).atomText(sum);
      for (let round = 0; round < 50; round++) {
        $.batch(() => {
          for (const a of atoms) a.value = round;
        });
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );
});

// ============================================================================
// 3. Form Scaling: atomForm O(1) Verification
// ============================================================================

describe('Macro: atomForm O(1) Scaling', () => {
  const $c = createContainer();
  afterAll(() => cleanupContainer($c));

  interface FormState {
    [key: string]: string;
  }

  const createForm = (count: number) => {
    const $form = $('<form></form>').appendTo($c);
    const initial: FormState = {};
    for (let i = 0; i < count; i++) {
      const n = `f${i}`;
      $(`<input name="${n}" />`).appendTo($form);
      initial[n] = `v${i}`;
    }
    const formAtom = $.atom<FormState>(initial);
    $form.atomForm(formAtom);
    return { formAtom };
  };

  const f10 = createForm(10);
  const f100 = createForm(100);
  const f1000 = createForm(1000);

  const createUpdater = (fa: { formAtom: WritableAtom<FormState> }) => {
    const refA = { ...fa.formAtom.peek() };
    const refB = { ...fa.formAtom.peek() };
    let toggle = true;
    return (i: number) => {
      const t = toggle ? refA : refB;
      t.f0 = `v${i}`;
      fa.formAtom.value = { ...t };
      toggle = !toggle;
    };
  };

  const u10 = createUpdater(f10);
  const u100 = createUpdater(f100);
  const u1000 = createUpdater(f1000);

  bench(
    `Update 1 field in 10-field form (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) u10(i);
    },
    macroBenchOptions
  );

  bench(
    `Update 1 field in 100-field form (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) u100(i);
    },
    macroBenchOptions
  );

  bench(
    `Update 1 field in 1000-field form (O(1) validation, x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) u1000(i);
    },
    macroBenchOptions
  );
});
