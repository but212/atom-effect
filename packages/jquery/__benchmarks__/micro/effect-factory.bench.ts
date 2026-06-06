/**
 * @fileoverview Micro-benchmarks for reactive effect factory (registerReactiveEffect / registerMapEffect).
 * @description Measures single vs. map bindings overhead, and sync vs. async Promise runner performance.
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Effect Factory: Binding Initialization', () => {
  bench(
    'Single reactive binding setup (atomText x 100)',
    withContainer(($c) => {
      const val = $.atom('text');
      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }
    }),
    microBenchOptions
  );

  bench(
    'Map reactive binding setup (atomClass with 5 keys x 20 elements)',
    withContainer(($c) => {
      const classMap = {
        'cls-a': $.atom(true),
        'cls-b': $.atom(false),
        'cls-c': $.atom(true),
        'cls-d': $.atom(false),
        'cls-e': $.atom(true),
      };

      for (let i = 0; i < 20; i++) {
        $('<div></div>').appendTo($c).atomClass(classMap);
      }
    }),
    microBenchOptions
  );
});

describe('Effect Factory: Runner Synchronous vs Asynchronous', () => {
  bench(
    'Synchronous path updates (10 elements x 50 updates)',
    withContainer(($c) => {
      const val = $.atom('sync-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }

      for (let i = 0; i < 50; i++) {
        val.value = `sync-${i}`;
      }
    }),
    microBenchOptions
  );

  bench(
    'Asynchronous path updates (10 elements x 50 updates)',
    withContainer(async ($c) => {
      const val = $.atom<string | Promise<string>>('async-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }

      for (let i = 0; i < 50; i++) {
        val.value = Promise.resolve(`async-${i}`);
      }

      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });
    }),
    { ...microBenchOptions, iterations: 50 }
  );
});
