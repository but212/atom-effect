/**
 * @fileoverview Micro-benchmarks for AEJ Debug Diagnostics System ($.debug).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

console.log = (): void => {};
console.warn = (): void => {};
console.error = (): void => {};

describe('Debug Diagnostics: Runtime Overhead', () => {
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

  bench('100 elements x 20 updates (Debug Disabled)', runTest(false), microBenchOptions);
  bench(
    '100 elements x 20 updates (Debug Enabled - console mocked)',
    runTest(true),
    microBenchOptions
  );
});
