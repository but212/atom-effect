/**
 * @fileoverview Micro-benchmarks for reactive list rendering (atomList).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

interface ListItem {
  id: number;
  text: string;
}

const listOptions = {
  key: 'id' as const,
  render: (item: ListItem) => `<div class="item">${item.text}</div>`,
};

const makeItems = (count: number, offset = 0): ListItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: i + 1 + offset,
    text: `Item ${i + 1 + offset}`,
  }));

// ============================================================================
// 1. Initial List Rendering
// ============================================================================

describe('List Rendering: Initial Render (1000 items)', () => {
  bench(
    'jQuery: manual render 1000 items',
    () => {
      const $c = createContainer();
      const items = makeItems(1000);
      let html = '';
      for (let i = 0; i < 1000; i++) {
        html += `<div class="item">${items[i]!.text}</div>`;
      }
      $c.html(html);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: atomList render 1000 items',
    () => {
      const $c = createContainer();
      const items = $.atom<ListItem[]>(makeItems(1000));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atom-effect: atomList render 1000 items (with bind callback)',
    () => {
      const $c = createContainer();
      const items = $.atom<ListItem[]>(makeItems(1000));
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
// 2. Reconciliation & Dynamic Mutation
// ============================================================================

describe('List Rendering: Reconciliation (Base 100 items)', () => {
  bench(
    'append 10 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom<ListItem[]>(base);
      $c.atomList(items, listOptions);

      // Append mutation
      items.value = [...base, ...makeItems(10, 100)];

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'prepend 10 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom<ListItem[]>(base);
      $c.atomList(items, listOptions);

      // Prepend mutation
      items.value = [...makeItems(10, 100), ...base];

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: full shuffle 100 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom<ListItem[]>(base);
      $c.atomList(items, listOptions);

      // Shuffle mutation
      items.value = [...base].sort(() => Math.random() - 0.5);

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'reconciliation: remove 50 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom<ListItem[]>(base);
      $c.atomList(items, listOptions);

      // Slices off half of the items
      items.value = base.slice(0, 50);

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
