/**
 * @fileoverview Micro-benchmarks for jQuery overrides (html, text patches).
 */

import { bench, describe } from 'vitest';
import $, { initAEJ } from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Patch: jQuery method overrides overhead', () => {
  const cases = [
    {
      name: 'text() - Patch disabled (Native jQuery, 1000 calls)',
      patch: false,
      run: ($el: JQuery) => {
        for (let i = 0; i < 1000; i++) $el.text(`val-${i}`);
      },
    },
    {
      name: 'text() - Patch enabled (Reactive jQuery, 1000 calls)',
      patch: true,
      run: ($el: JQuery) => {
        for (let i = 0; i < 1000; i++) $el.text(`val-${i}`);
      },
    },
    {
      name: 'html() - Patch disabled (Native jQuery, 1000 calls)',
      patch: false,
      html: true,
      run: ($el: JQuery) => {
        for (let i = 0; i < 1000; i++) $el.html(`<span>val-${i}</span>`);
      },
    },
    {
      name: 'html() - Patch enabled (Reactive jQuery, 1000 calls)',
      patch: true,
      html: true,
      run: ($el: JQuery) => {
        for (let i = 0; i < 1000; i++) $el.html(`<span>val-${i}</span>`);
      },
    },
  ];

  for (const { name, patch, html, run } of cases) {
    bench(
      name,
      withContainer(($c) => {
        initAEJ({ patch, autoCleanup: false });
        const $el = $(html ? '<div></div>' : '<span></span>').appendTo($c);
        run($el);
      }),
      microBenchOptions
    );
  }
});
