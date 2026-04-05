/**
 * @fileoverview Consolidated macro-benchmarks for atom-effect-jquery
 * @description Real-world scenario simulations: Todo App, Dashboard, and Form scaling.
 */

import { afterAll, bench, describe } from 'vitest';
import $ from '@/index';
import { cleanupContainer, createContainer, macroBenchOptions } from '../utils/setup';

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

describe('Macro: Todo App Scenarios', () => {
  bench(
    'full workflow: add(20) → toggle(10) → filter(active) → delete(5) → all',
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

      const totalCount = $.computed(() => todos.value.length);
      const completedCount = $.computed(() => todos.value.filter((t) => t.completed).length);

      const $list = $('<ul></ul>').appendTo($c);
      const $stats = $('<div class="stats"></div>').appendTo($c);
      $stats.atomText($.computed(() => `${completedCount.value}/${totalCount.value} completed`));

      $list.atomList(filtered, {
        key: 'id',
        render: (todo) => `<li class="${todo.completed ? 'done' : ''}">${todo.text}</li>`,
      });

      // 1. Add 20
      todos.value = Array.from({ length: 20 }, (_, i) => createTodo(`Task ${i}`));
      // 2. Toggle 10
      todos.value = todos.value.map((t, i) => (i < 10 ? { ...t, completed: true } : t));
      // 3. Filter
      filter.value = 'active';
      // 4. Delete 5
      todos.value = todos.value.slice(5);
      // 5. Back to all
      filter.value = 'all';

      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'stats auto-update: 100 items with rate (toFixed)',
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

      todos.value = Array.from({ length: 100 }, (_, i) => ({
        ...createTodo(`I${i}`),
        completed: i % 2 === 0,
      }));
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
    '20 widgets batch update (50 rounds)',
    () => {
      const $c = createContainer();
      const widgets = Array.from({ length: 20 }, (_, i) => ({
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
    'mount/unmount 20 components (10 cycles)',
    () => {
      const $c = createContainer();
      for (let cycle = 0; cycle < 10; cycle++) {
        const slots: JQuery[] = [];
        for (let i = 0; i < 20; i++) {
          const $slot = $('<div class="slot"></div>').appendTo($c);
          $slot.atomMount(($el) => {
            const count = $.atom(cycle * 20 + i);
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
    'deep propagation: 5-level chain → 20 DOM widgets (100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom(0);
      const c1 = $.computed(() => source.value * 2);
      const c2 = $.computed(() => c1.value + 1);
      const c3 = $.computed(() => c2.value * 3);
      const c4 = $.computed(() => c3.value - 10);
      const c5 = $.computed(() => `Result: ${c4.value}`);

      for (let i = 0; i < 20; i++) $('<span></span>').appendTo($c).atomText(c5);
      for (let i = 0; i < 100; i++) source.value = i;
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'fan-out: 1 atom → 20 computed → 20 DOM bindings',
    () => {
      const $c = createContainer();
      const source = $.atom(0);
      for (let i = 0; i < 20; i++) {
        const derived = $.computed(() => `W${i}: ${source.value}`);
        $('<span></span>').appendTo($c).atomText(derived);
      }
      for (let i = 0; i < 100; i++) source.value = i;
      cleanupContainer($c);
    },
    macroBenchOptions
  );

  bench(
    'fan-in: 20 atoms → 1 computed → 1 DOM binding',
    () => {
      const $c = createContainer();
      const atoms = Array.from({ length: 20 }, (_, i) => $.atom(i));
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

  const createForm = (count: number) => {
    const $form = $('<form></form>').appendTo($c);
    const initial: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      const n = `f${i}`;
      $(`<input name="${n}" />`).appendTo($form);
      initial[n] = `v${i}`;
    }
    const formAtom = $.atom(initial);
    $form.atomForm(formAtom);
    return { formAtom };
  };

  const f10 = createForm(10);
  const f100 = createForm(100);

  const createUpdater = (fa: { formAtom: any }) => {
    const refA = { ...fa.formAtom.peek() };
    const refB = { ...fa.formAtom.peek() };
    let toggle = true;
    return (i: number) => {
      const t = toggle ? refA : refB;
      t.f0 = `v${i}`;
      fa.formAtom.value = t;
      toggle = !toggle;
    };
  };

  const u10 = createUpdater(f10);
  const u100 = createUpdater(f100);

  bench(
    'Update 1 field in 10-field form (x100)',
    () => {
      for (let i = 0; i < 100; i++) u10(i);
    },
    macroBenchOptions
  );

  bench(
    'Update 1 field in 100-field form (O(1) test, x100)',
    () => {
      for (let i = 0; i < 100; i++) u100(i);
    },
    macroBenchOptions
  );
});
