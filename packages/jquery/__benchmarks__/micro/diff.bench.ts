/**
 * @fileoverview Micro-benchmarks for list reconciliation diffing engine (atomList diff cost).
 */

import { describe, test } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('List Diffing: Reconciliation computation overhead (1000 items)', () => {
  const baseItems = Array.from({ length: 1000 }, (_, index) => ({
    id: index,
    value: `Item ${index}`,
  }));
  const newItems = Array.from({ length: 100 }, (_, index) => ({
    id: 1000 + index,
    value: `New Item ${index}`,
  }));

  const cases = [
    { name: 'No-op (Same reference, no diffing)', next: baseItems },
    { name: 'Append 100 items (Tail insertion)', next: [...baseItems, ...newItems] },
    { name: 'Prepend 100 items (Head insertion)', next: [...newItems, ...baseItems] },
    { name: 'Reverse list (1000 items diff & swap)', next: [...baseItems].reverse() },
    { name: 'Filter/Remove 500 items', next: baseItems.filter((item) => item.id % 2 === 0) },
    { name: 'Clear all items', next: [] as typeof baseItems },
  ];

  test('list diffing reconciliation comparison', async ({ bench }) => {
    await bench.compare(
      ...cases.map(({ name, next }) =>
        bench(
          name,
          withContainer(($container) => {
            const list = $.atom(baseItems);
            $container.atomList(list, { key: 'id', render: () => '' });
            list.value = next;
          })
        )
      ),
      microBenchOptions
    );
  });
});
