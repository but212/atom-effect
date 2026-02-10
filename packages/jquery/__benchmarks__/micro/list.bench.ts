/**
 * @fileoverview List rendering micro-benchmarks
 * @description Measures $.atomList creation, reconciliation, and LIS performance
 */

import { bench, describe } from 'vitest';
import $ from '../../src/index';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

interface Item {
  id: number;
  text: string;
}

function makeItems(count: number): Item[] {
  return Array.from({ length: count }, (_, i) => ({ id: i + 1, text: `Item ${i + 1}` }));
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const listOptions = {
  key: 'id' as const,
  render: (item: Item) => `<div class="item">${item.text}</div>`,
};

describe('atomList Initial Render', () => {
  bench(
    'render 100 items',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(100));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'render 500 items',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(500));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'render 1000 items',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(1000));
      $c.atomList(items, listOptions);
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomList Append Items', () => {
  bench(
    'append 10 items to 100',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      const appended = [
        ...base,
        ...Array.from({ length: 10 }, (_, i) => ({
          id: 101 + i,
          text: `New ${101 + i}`,
        })),
      ];
      items.value = appended;
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomList Remove Items', () => {
  bench(
    'remove 10 items from 100',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      // Remove items with ids 1-10
      items.value = base.filter((item) => item.id > 10);
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomList Shuffle (LIS Stress)', () => {
  bench(
    'full shuffle 100 items',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      items.value = shuffle(base);
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomList Partial Update', () => {
  bench(
    'update 10 of 100 items content',
    () => {
      const $c = createContainer();
      const base = makeItems(100);
      const items = $.atom(base);
      $c.atomList(items, listOptions);
      const updated = base.map((item) =>
        item.id <= 10 ? { ...item, text: `Updated ${item.id}` } : item
      );
      items.value = updated;
      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('atomList with bind callback', () => {
  bench(
    'render 100 items with bind (atomText + $.atomClass)',
    () => {
      const $c = createContainer();
      const items = $.atom(makeItems(100));
      $c.atomList(items, {
        key: 'id',
        render: () => '<div class="item"><span class="label"></span></div>',
        bind: ($el, item) => {
          const textAtom = $.atom(item.text);
          const isEven = $.atom(item.id % 2 === 0);
          $el.find('.label').atomText(textAtom);
          $el.atomClass('even', isEven);
        },
      });
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
