/**
 * @fileoverview Micro-benchmarks for reactive effect factory (registerReactiveEffect / registerMapEffect).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Effect Factory: Binding Initialization', () => {
  const run = (name: string, fn: ($c: JQuery) => void | Promise<void>, opts = microBenchOptions) =>
    bench(name, withContainer(fn), opts);

  run('Single reactive binding setup (atomText x 100)', ($c) => {
    const val = $.atom('text');
    for (let i = 0; i < 100; i++) {
      $('<span></span>').appendTo($c).atomText(val);
    }
  });

  run('Map reactive binding setup (atomClass with 5 keys x 20 elements)', ($c) => {
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
  });

  run('Synchronous path updates (10 elements x 50 updates)', ($c) => {
    const val = $.atom('sync-value');
    for (let i = 0; i < 10; i++) {
      $('<span></span>').appendTo($c).atomText(val);
    }
    for (let i = 0; i < 50; i++) {
      val.value = `sync-${i}`;
    }
  });

  run(
    'Asynchronous path updates (10 elements x 50 updates)',
    async ($c) => {
      const val = $.atom<string | Promise<string>>('async-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($c).atomText(val);
      }
      for (let i = 0; i < 50; i++) {
        val.value = Promise.resolve(`async-${i}`);
      }
      await $.nextTick();
    },
    { ...microBenchOptions, iterations: 50 }
  );
});
