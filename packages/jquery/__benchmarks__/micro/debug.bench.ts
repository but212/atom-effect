/**
 * @fileoverview Micro-benchmarks for AEJ Debug Diagnostics System ($.debug).
 */

import { describe, test } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Debug Diagnostics: Runtime Overhead', () => {
  const originals = { log: console.log, warn: console.warn, error: console.error };
  const mockConsole = () => {
    console.log = console.warn = console.error = () => {};
  };
  const restoreConsole = () => {
    Object.assign(console, originals);
  };

  test('debug diagnostics overhead comparison', async ({ bench }) => {
    mockConsole();
    try {
      await bench.compare(
        bench(
          '100 elements x 20 updates (Debug Disabled)',
          withContainer(($container) => {
            $.debug.enabled = false;
            const source = $.atom('value');
            for (let i = 0; i < 100; i++) {
              $('<span></span>').appendTo($container).atomText(source);
            }
            for (let i = 0; i < 20; i++) {
              source.value = `update-${i}`;
            }
          })
        ),
        bench(
          '100 elements x 20 updates (Debug Enabled - console mocked)',
          withContainer(($container) => {
            $.debug.enabled = true;
            const source = $.atom('value');
            for (let i = 0; i < 100; i++) {
              $('<span></span>').appendTo($container).atomText(source);
            }
            for (let i = 0; i < 20; i++) {
              source.value = `update-${i}`;
            }
          })
        ),
        microBenchOptions
      );
    } finally {
      $.debug.enabled = false;
      restoreConsole();
    }
  });
});
