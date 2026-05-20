/**
 * @fileoverview Micro-benchmarks for reactive effect factory (registerReactiveEffect / registerMapEffect).
 * @description Measures single vs. map bindings overhead, and sync vs. async Promise runner performance.
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('Effect Factory: Binding Initialization', () => {
  bench(
    'Single reactive binding setup (atomText x 100)',
    () => {
      const $c = createContainer();
      const val = $.atom('text');

      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Map reactive binding setup (atomClass with 5 keys x 20 elements)',
    () => {
      const $c = createContainer();
      const a = $.atom(true);
      const b = $.atom(false);
      const c = $.atom(true);
      const d = $.atom(false);
      const e = $.atom(true);

      const classMap = {
        'cls-a': a,
        'cls-b': b,
        'cls-c': c,
        'cls-d': d,
        'cls-e': e,
      };

      for (let i = 0; i < 20; i++) {
        $('<div></div>').appendTo($c).atomClass(classMap);
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('Effect Factory: Runner Synchronous vs Asynchronous', () => {
  bench(
    'Synchronous path updates (10 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const val = $.atom('sync-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }

      // 50 sync updates
      for (let i = 0; i < 50; i++) {
        val.value = `sync-${i}`;
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Asynchronous path updates (10 elements x 50 updates)',
    async () => {
      const $c = createContainer();
      const val = $.atom<string | Promise<string>>('async-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }

      // 50 async updates (using resolving promises)
      for (let i = 0; i < 50; i++) {
        val.value = Promise.resolve(`async-${i}`);
      }

      // Hand over execution to the event loop (macrotask) to allow async runners to process
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
      });

      cleanupContainer($c);
    },
    { ...microBenchOptions, iterations: 50 } // Smaller iterations because of async tasks
  );
});
