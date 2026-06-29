/**
 * @fileoverview Micro-benchmarks for reactive list rendering (atomList).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

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

describe('List Rendering: Initial Render (1000 items)', () => {
  const run = (name: string, benchmarkFunction: ($container: JQuery) => void) =>
    bench(name, withContainer(benchmarkFunction), microBenchOptions);

  run('jQuery: manual render 1000 items', ($container) => {
    const items = makeItems(1000);
    let html = '';
    for (let i = 0; i < 1000; i++) {
      html += `<div class="item">${items[i]?.text}</div>`;
    }
    $container.html(html);
  });

  run('atom-effect: atomList render 1000 items', ($container) => {
    const items = $.atom<ListItem[]>(makeItems(1000));
    $container.atomList(items, listOptions);
  });

  run('atom-effect: atomList render 1000 items (with bind callback)', ($container) => {
    const items = $.atom<ListItem[]>(makeItems(1000));
    $container.atomList(items, {
      key: 'id',
      render: () => '<div class="item"><span class="label"></span></div>',
      bind: ($element, item) => {
        $element.find('.label').atomText($.atom(item.text));
        $element.atomClass('even', $.atom(item.id % 2 === 0));
      },
    });
  });
});

describe('List Rendering: Reconciliation (Base 100 items)', () => {
  const base = makeItems(100);
  const cases = [
    { name: 'append 10 items', next: [...base, ...makeItems(10, 100)] },
    { name: 'prepend 10 items', next: [...makeItems(10, 100), ...base] },
    {
      name: 'reconciliation: full shuffle 100 items',
      next: [...base].sort(() => 0.5 - Math.random()),
    },
    { name: 'reconciliation: remove 50 items', next: base.slice(0, 50) },
  ];

  for (const { name, next } of cases) {
    bench(
      name,
      withContainer(($container) => {
        const items = $.atom<ListItem[]>(base);
        $container.atomList(items, listOptions);
        items.value = next;
      }),
      microBenchOptions
    );
  }
});
