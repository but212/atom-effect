/**
 * @fileoverview Two-way binding micro-benchmarks
 * @description Measures atomVal and atomChecked binding overhead
 */

import { bench, describe } from 'vitest';
import $ from '@/index';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('atomVal Binding', () => {
  bench(
    'create 100 input val bindings',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) {
        $('<input type="text">').appendTo($c).atomVal(source);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom → DOM propagation (100 inputs x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) {
        $('<input type="text">').appendTo($c).atomVal(source);
      }
      for (let i = 0; i < 100; i++) {
        source.value = `value-${i}`;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'DOM → atom propagation (trigger input event 100 times)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      const $input = $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) {
        $input.val(`typed-${i}`);
        $input.trigger('input');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomChecked Binding', () => {
  bench(
    'create 100 checkbox bindings',
    () => {
      const $c = createContainer();
      const checked = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'toggle checkbox 100 times (atom → DOM)',
    () => {
      const $c = createContainer();
      const checked = $.atom(false);
      for (let i = 0; i < 100; i++) {
        $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      }
      for (let i = 0; i < 100; i++) {
        checked.value = !checked.value;
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'toggle checkbox via DOM event 100 times',
    () => {
      const $c = createContainer();
      const checked = $.atom(false);
      const $cb = $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      for (let i = 0; i < 100; i++) {
        $cb.prop('checked', !$cb.prop('checked'));
        $cb.trigger('change');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomVal with Debounce', () => {
  bench(
    'without debounce (baseline)',
    () => {
      const $c = createContainer();
      const source = $.atom('');
      const $input = $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) {
        $input.val(`v${i}`);
        $input.trigger('input');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'with debounce option',
    () => {
      const $c = createContainer();
      const source = $.atom('');
      const $input = $('<input type="text">').appendTo($c).atomVal(source, { debounce: 100 });
      for (let i = 0; i < 100; i++) {
        $input.val(`v${i}`);
        $input.trigger('input');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
