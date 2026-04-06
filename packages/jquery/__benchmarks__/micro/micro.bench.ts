/**
 * @fileoverview Consolidated micro-benchmarks for atom-effect-jquery
 * @description Standardized performance metrics for bindings, inputs, lists, and sanitization.
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { sanitizeHtml } from '@/utils/sanitize';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

// ============================================================================
// 1. One-way Bindings
// ============================================================================

describe('Bindings: One-way Propagation', () => {
  bench(
    'create 100 text bindings',
    () => {
      const $c = createContainer();
      const source = $.atom('hello');
      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($c).atomText(source);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update text (100 elements x 50 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) $('<span></span>').appendTo($c).atomText(source);
      for (let i = 0; i < 50; i++) source.value = `update-${i}`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'update html (100 elements x 20 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('<em>initial</em>');
      for (let i = 0; i < 100; i++) $('<div></div>').appendTo($c).atomHtml(source);
      for (let i = 0; i < 20; i++) source.value = `<strong>update-${i}</strong>`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'toggle class (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const condition = $.atom(false);
      for (let i = 0; i < 100; i++) $('<div></div>').appendTo($c).atomClass('active', condition);
      for (let i = 0; i < 100; i++) condition.value = !condition.value;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'composite binding (text+class+css+show) creation x 100',
    () => {
      const $c = createContainer();
      const text = $.atom('hello');
      const isActive = $.atom(true);
      const width = $.atom(100);
      for (let i = 0; i < 100; i++) {
        $('<div></div>')
          .appendTo($c)
          .atomBind({
            text,
            class: { active: isActive },
            css: { width: [width, 'px'] },
            show: isActive,
          });
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Two-way Bindings (Inputs)
// ============================================================================

describe('Bindings: Two-way (Input/Checked)', () => {
  bench(
    'atom → DOM: input val (100 inputs x 100 updates)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      for (let i = 0; i < 100; i++) $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) source.value = `value-${i}`;
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'DOM → atom: input val (trigger 100 events)',
    () => {
      const $c = createContainer();
      const source = $.atom('initial');
      const $input = $('<input type="text">').appendTo($c).atomVal(source);
      for (let i = 0; i < 100; i++) {
        $input.val(`typed-${i}`);
        $input.trigger('input');
      }
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'checkbox toggle (100 elements x 100 toggles)',
    () => {
      const $c = createContainer();
      const checked = $.atom(false);
      for (let i = 0; i < 100; i++) $('<input type="checkbox">').appendTo($c).atomChecked(checked);
      for (let i = 0; i < 100; i++) checked.value = !checked.value;
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 3. List Rendering (atomList)
// ============================================================================

describe('List Rendering: atomList', () => {
  const listOptions = {
    key: 'id' as const,
    render: (item: any) => `<div class="item">${item.text}</div>`,
  };

  const makeItems = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: i + 1, text: `Item ${i + 1}` }));

  bench(
    'initial render: 1000 items',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(1000));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: append 10 items to 100',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      items.value = [
        ...base,
        ...Array.from({ length: 10 }, (_, i) => ({ id: 101 + i, text: `New ${101 + i}` })),
      ];
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: full shuffle 100 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      items.value = [...base].sort(() => Math.random() - 0.5);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'render 100 items with bind callback',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(100));
      $c.atomList(items, {
        key: 'id',
        render: () => '<div class="item"><span class="label"></span></div>',
        bind: ($el, item) => {
          $el.find('.label').atomText($.atom(item.text));
          $el.atomClass('even', $.atom(item.id % 2 === 0));
        },
      });
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

// ============================================================================
// 4. HTML Sanitization
// ============================================================================

describe('Sanitization: sanitizeHtml', () => {
  const HTML_CLEAN_LARGE = `<article>${Array.from({ length: 20 }, (_, i) => `<p class="p-${i}">Text ${i}</p>`).join('')}</article>`;
  const HTML_MIXED_ATTRS = `<div id="r" onmouseover="e()"><a href="javascript:e()">XSS</a><p style="color:red">Safe</p></div>`;

  bench(
    'clean large (50+ nodes)',
    () => {
      sanitizeHtml(HTML_CLEAN_LARGE);
    },
    microBenchOptions
  );

  bench(
    'mixed dangerous attributes removal',
    () => {
      sanitizeHtml(HTML_MIXED_ATTRS);
    },
    microBenchOptions
  );

  bench(
    'batch throughput (100 × mixed profile)',
    () => {
      for (let i = 0; i < 100; i++) sanitizeHtml(HTML_MIXED_ATTRS);
    },
    microBenchOptions
  );
});
