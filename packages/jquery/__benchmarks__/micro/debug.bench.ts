/**
 * @fileoverview Micro-benchmarks for AEJ Debug Diagnostics System ($.debug).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Debug Diagnostics: Runtime Overhead', () => {
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;

  const mockConsole = {
    setup() {
      originalLog = console.log;
      originalWarn = console.warn;
      originalError = console.error;
      console.log = () => {};
      console.warn = () => {};
      console.error = () => {};
    },
    teardown() {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    },
  };

  const runTest = (enabled: boolean) =>
    withContainer(($c) => {
      $.debug.enabled = enabled;
      const source = $.atom('val');
      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(source);
      }
      for (let i = 0; i < 20; i++) {
        source.value = `update-${i}`;
      }
    });

  bench('100 elements x 20 updates (Debug Disabled)', runTest(false), {
    ...microBenchOptions,
    ...mockConsole,
  });

  bench('100 elements x 20 updates (Debug Enabled - console mocked)', runTest(true), {
    ...microBenchOptions,
    ...mockConsole,
  });
});
