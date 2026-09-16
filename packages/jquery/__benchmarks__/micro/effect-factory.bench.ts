/**
 * @fileoverview Micro-benchmarks for reactive effect factory (registerReactiveEffect / registerMapEffect).
 */

import { describe, test } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Effect Factory: Binding Initialization', () => {
  test('synchronous binding initialization comparison', async ({ bench }) => {
    await bench.compare(
      bench(
        'Single reactive binding setup (atomText x 100)',
        withContainer(($container) => {
          const value = $.atom('text');
          for (let i = 0; i < 100; i++) {
            $('<span></span>').appendTo($container).atomText(value);
          }
        })
      ),
      bench(
        'Map reactive binding setup (atomClass with 5 keys x 20 elements)',
        withContainer(($container) => {
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
        })
      ),
      bench(
        'Synchronous path updates (10 elements x 50 updates)',
        withContainer(($container) => {
          const value = $.atom('sync-value');
          for (let i = 0; i < 10; i++) {
            $('<span></span>').appendTo($container).atomText(value);
          }
          for (let i = 0; i < 50; i++) {
            value.value = `sync-${i}`;
          }
        })
      ),
      microBenchOptions
    );
  });

  test('asynchronous path updates', async ({ bench }) => {
    await bench(
      'Asynchronous path updates (10 elements x 50 updates)',
      withContainer(async ($container) => {
        const value = $.atom<string | Promise<string>>('async-value');
        for (let i = 0; i < 10; i++) {
          $('<span></span>').appendTo($container).atomText(value);
        }
        for (let i = 0; i < 50; i++) {
          value.value = Promise.resolve(`async-${i}`);
        }
        await $.nextTick();
      })
    ).run({ ...microBenchOptions, iterations: 50 });
  });
});
