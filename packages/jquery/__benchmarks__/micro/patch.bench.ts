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
      benchmarkAction: ($element: JQuery) => {
        for (let i = 0; i < 1000; i++) $element.text(`value-${i}`);
      },
    },
    {
      name: 'text() - Patch enabled (Reactive jQuery, 1000 calls)',
      patch: true,
      benchmarkAction: ($element: JQuery) => {
        for (let i = 0; i < 1000; i++) $element.text(`value-${i}`);
      },
    },
    {
      name: 'html() - Patch disabled (Native jQuery, 1000 calls)',
      patch: false,
      html: true,
      benchmarkAction: ($element: JQuery) => {
        for (let i = 0; i < 1000; i++) $element.html(`<span>value-${i}</span>`);
      },
    },
    {
      name: 'html() - Patch enabled (Reactive jQuery, 1000 calls)',
      patch: true,
      html: true,
      benchmarkAction: ($element: JQuery) => {
        for (let i = 0; i < 1000; i++) $element.html(`<span>value-${i}</span>`);
      },
    },
  ];

  for (const { name, patch, html, benchmarkAction } of cases) {
    bench(
      name,
      withContainer(($container) => {
        initAEJ({ patch, autoCleanup: false });
        benchmarkAction($(html ? '<div></div>' : '<span></span>').appendTo($container));
      }),
      microBenchOptions
    );
  }
});
