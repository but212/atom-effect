/**
 * @fileoverview Micro-benchmarks for reactive effect factory (registerReactiveEffect / registerMapEffect).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Effect Factory: Binding Initialization', () => {
  const run = (
    name: string,
    benchmarkFunction: ($container: JQuery) => void | Promise<void>,
    options = microBenchOptions
  ) => bench(name, withContainer(benchmarkFunction), options);

  run('Single reactive binding setup (atomText x 100)', ($container) => {
    const value = $.atom('text');
    for (let i = 0; i < 100; i++) {
      $('<span></span>').appendTo($container).atomText(value);
    }
  });

  run('Map reactive binding setup (atomClass with 5 keys x 20 elements)', ($container) => {
    const classMap = {
      'cls-a': $.atom(true),
      'cls-b': $.atom(false),
      'cls-c': $.atom(true),
      'cls-d': $.atom(false),
      'cls-e': $.atom(true),
    };
    for (let i = 0; i < 20; i++) {
      $('<div></div>').appendTo($container).atomClass(classMap);
    }
  });

  run('Synchronous path updates (10 elements x 50 updates)', ($container) => {
    const value = $.atom('sync-value');
    for (let i = 0; i < 10; i++) {
      $('<span></span>').appendTo($container).atomText(value);
    }
    for (let i = 0; i < 50; i++) {
      value.value = `sync-${i}`;
    }
  });

  run(
    'Asynchronous path updates (10 elements x 50 updates)',
    async ($container) => {
      const value = $.atom<string | Promise<string>>('async-value');
      for (let i = 0; i < 10; i++) {
        $('<span></span>').appendTo($container).atomText(value);
      }
      for (let i = 0; i < 50; i++) {
        value.value = Promise.resolve(`async-${i}`);
      }
      await $.nextTick();
    },
    { ...microBenchOptions, iterations: 50 }
  );
});
