/**
 * @fileoverview Micro-benchmarks for AEJ Debug Diagnostics System ($.debug).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('Debug Diagnostics: Runtime Overhead', () => {
  // Capture original console methods to prevent spamming test outputs and avoid I/O bottlenecks
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  const mockConsole = (): void => {
    console.log = (): void => {};
    console.warn = (): void => {};
    console.error = (): void => {};
  };

  const restoreConsole = (): void => {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  };

  bench(
    '100 elements x 20 updates (Debug Disabled)',
    () => {
      mockConsole();
      $.debug.enabled = false;

      const $c = createContainer();
      const source = $.atom('val');

      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(source);
      }

      for (let i = 0; i < 20; i++) {
        source.value = `update-${i}`;
      }

      cleanupContainer($c);
      restoreConsole();
    },
    microBenchOptions
  );

  bench(
    '100 elements x 20 updates (Debug Enabled - console mocked)',
    () => {
      mockConsole();
      $.debug.enabled = true;

      const $c = createContainer();
      const source = $.atom('val');

      for (let i = 0; i < 100; i++) {
        $('<span></span>').appendTo($c).atomText(source);
      }

      for (let i = 0; i < 20; i++) {
        source.value = `update-${i}`;
      }

      cleanupContainer($c);
      restoreConsole();
    },
    microBenchOptions
  );
});
