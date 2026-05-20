/**
 * @fileoverview Micro-benchmarks for list reconciliation diffing engine (atomList diff cost).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

interface SimpleItem {
  id: number;
  val: string;
}

const renderEmpty = (): string => '';

describe('List Diffing: Reconciliation computation overhead (1000 items)', () => {
  const baseItems: SimpleItem[] = Array.from({ length: 1000 }, (_, i) => ({
    id: i,
    val: `Item ${i}`,
  }));

  bench(
    'No-op (Same reference, no diffing)',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Trigger update with same value
      list.value = baseItems;

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Append 100 items (Tail insertion)',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Append mutation
      const appended: SimpleItem[] = [
        ...baseItems,
        ...Array.from({ length: 100 }, (_, i) => ({
          id: 1000 + i,
          val: `New Item ${i}`,
        })),
      ];
      list.value = appended;

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Prepend 100 items (Head insertion)',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Prepend mutation
      const prepended: SimpleItem[] = [
        ...Array.from({ length: 100 }, (_, i) => ({
          id: 1000 + i,
          val: `New Item ${i}`,
        })),
        ...baseItems,
      ];
      list.value = prepended;

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Reverse list (1000 items diff & swap)',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Reverse mutation
      list.value = [...baseItems].reverse();

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Filter/Remove 500 items',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Filter out even IDs
      list.value = baseItems.filter((item) => item.id % 2 === 0);

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'Clear all items',
    () => {
      const $c = createContainer();
      const list = $.atom<SimpleItem[]>(baseItems);
      $c.atomList(list, { key: 'id', render: renderEmpty });

      // Clear mutation
      list.value = [];

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
