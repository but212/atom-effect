/**
 * @fileoverview Micro-benchmarks for jQuery overrides (html, text patches).
 */

import { bench, describe } from 'vitest';
import $, { initAEJ } from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('Patch: jQuery method overrides overhead', () => {
  bench(
    'text() - Patch disabled (Native jQuery, 1000 calls)',
    () => {
      initAEJ({ patch: false, autoCleanup: false });
      const $c = createContainer();
      const $el = $('<span></span>').appendTo($c);
      for (let i = 0; i < 1000; i++) {
        $el.text(`val-${i}`);
      }
      // Re-enable for safety of other benches
      initAEJ({ patch: true, autoCleanup: false });
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'text() - Patch enabled (Reactive jQuery, 1000 calls)',
    () => {
      initAEJ({ patch: true, autoCleanup: false });
      const $c = createContainer();
      const $el = $('<span></span>').appendTo($c);
      for (let i = 0; i < 1000; i++) {
        $el.text(`val-${i}`);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'html() - Patch disabled (Native jQuery, 1000 calls)',
    () => {
      initAEJ({ patch: false, autoCleanup: false });
      const $c = createContainer();
      const $el = $('<div></div>').appendTo($c);
      for (let i = 0; i < 1000; i++) {
        $el.html(`<span>val-${i}</span>`);
      }
      initAEJ({ patch: true, autoCleanup: false });
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'html() - Patch enabled (Reactive jQuery, 1000 calls)',
    () => {
      initAEJ({ patch: true, autoCleanup: false });
      const $c = createContainer();
      const $el = $('<div></div>').appendTo($c);
      for (let i = 0; i < 1000; i++) {
        $el.html(`<span>val-${i}</span>`);
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
