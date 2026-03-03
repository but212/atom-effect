/**
 * @fileoverview Dashboard macro-benchmark
 * @description Simulates a dashboard with multiple widgets, batch updates, and mount/unmount cycles
 */

import { bench, describe } from 'vitest';
import $ from '@/index';
import { cleanupContainer, createContainer, macroBenchOptions } from '../utils/setup';

describe('Dashboard — Multi-Widget Binding', () => {
  bench(
    '20 widgets with atomText + atomCss (creation)',
    () => {
      const $c = createContainer();
      for (let i = 0; i < 20; i++) {
        const value = $.atom(`Widget ${i}`);
        const width = $.atom(100 + i * 10);
        const $w = $('<div class="widget"><span class="label"></span></div>').appendTo($c);
        $w.find('.label').atomText(value);
        $w.atomCss('width', width, 'px');
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );

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
});

describe('Dashboard — Mount/Unmount Cycles', () => {
  bench(
    'mount and unmount 20 components (10 cycles)',
    () => {
      const $c = createContainer();

      for (let cycle = 0; cycle < 10; cycle++) {
        // Mount 20 components
        const slots: JQuery[] = [];
        for (let i = 0; i < 20; i++) {
          const $slot = $('<div class="slot"></div>').appendTo($c);
          $slot.atomMount(($el) => {
            const count = $.atom(0);
            $el.html('<span class="count"></span>');
            $el.find('.count').atomText(count);
            count.value = cycle * 20 + i;
            return () => {};
          });
          slots.push($slot);
        }

        // Unmount all
        for (const $slot of slots) {
          $slot.atomUnmount();
          $slot.remove();
        }
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );
});

describe('Dashboard — Computed → DOM Chain', () => {
  bench(
    'deep computed chain (5 levels) → atomText (20 widgets)',
    () => {
      const $c = createContainer();
      const source = $.atom(0);

      // 5-level computed chain
      const c1 = $.computed(() => source.value * 2);
      const c2 = $.computed(() => c1.value + 1);
      const c3 = $.computed(() => c2.value * 3);
      const c4 = $.computed(() => c3.value - 10);
      const c5 = $.computed(() => `Result: ${c4.value}`);

      for (let i = 0; i < 20; i++) {
        $('<span></span>').appendTo($c).atomText(c5);
      }

      for (let i = 0; i < 100; i++) {
        source.value = i;
      }
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

      for (let i = 0; i < 100; i++) {
        source.value = i;
      }
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
          for (const a of atoms) {
            a.value = round;
          }
        });
      }
      cleanupContainer($c);
    },
    macroBenchOptions
  );
});
