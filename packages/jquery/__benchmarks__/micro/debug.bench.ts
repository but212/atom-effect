/**
 * @fileoverview Micro-benchmarks for AEJ Debug Diagnostics System ($.debug).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Debug Diagnostics: Runtime Overhead', () => {
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const mockConsole = {
    setup: () => {
      console.log = console.warn = console.error = () => {};
    },
    teardown: () => {
      Object.assign(console, originals);
    },
  };

  const run = (name: string, enabled: boolean) =>
    bench(
      name,
      withContainer(($c) => {
        $.debug.enabled = enabled;
        const source = $.atom('value');
        for (let i = 0; i < 100; i++) {
          $('<span></span>').appendTo($c).atomText(source);
        }
        for (let i = 0; i < 20; i++) {
          source.value = `update-${i}`;
        }
      }),
      { ...microBenchOptions, ...mockConsole }
    );

  run('100 elements x 20 updates (Debug Disabled)', false);
  run('100 elements x 20 updates (Debug Enabled - console mocked)', true);
});
