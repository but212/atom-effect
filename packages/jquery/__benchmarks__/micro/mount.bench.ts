/**
 * @fileoverview Micro-benchmarks for component mounting and unmounting (atomMount / atomUnmount).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

interface CounterProps {
  initialCount: number;
  label: string;
}

const CounterComponent = ($el: JQuery, props: CounterProps) => {
  const count = $.atom(props.initialCount);
  const fx = $.effect(() => {
    $el.text(`${props.label}: ${count.value}`);
  });
  return () => {
    fx.dispose();
  };
};

describe('Mounting: Component Initialization', () => {
  bench(
    'atomMount initial setup (100 elements)',
    () => {
      const $c = createContainer();
      const elements: JQuery[] = [];
      for (let i = 0; i < 100; i++) {
        elements.push($('<div></div>').appendTo($c));
      }

      for (let i = 0; i < 100; i++) {
        elements[i]?.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'atomMount replacement (10 elements x 10 re-mounts)',
    () => {
      const $c = createContainer();
      const $el = $('<div></div>').appendTo($c);

      for (let i = 0; i < 100; i++) {
        $el.atomMount(CounterComponent, { initialCount: i, label: `Remount-${i}` });
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('Mounting: Component Teardown', () => {
  bench(
    'atomUnmount (100 elements)',
    () => {
      const $c = createContainer();
      const elements: JQuery[] = [];
      for (let i = 0; i < 100; i++) {
        const $el = $('<div></div>').appendTo($c);
        $el.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
        elements.push($el);
      }

      for (let i = 0; i < 100; i++) {
        elements[i]?.atomUnmount();
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('Mounting: Deep Tree Operations', () => {
  function buildDeepDivTree(parent: HTMLElement, depth: number, breadth: number): void {
    let currentLevel: HTMLElement[] = [parent];
    for (let d = 0; d < depth; d++) {
      const nextLevel: HTMLElement[] = [];
      for (const p of currentLevel) {
        for (let b = 0; b < breadth; b++) {
          const child = document.createElement('div');
          p.appendChild(child);
          nextLevel.push(child);
        }
      }
      currentLevel = nextLevel;
    }
  }

  bench(
    'mount and deep unmount (depth 4, breadth 3 ~ 120 nodes)',
    () => {
      const $c = createContainer();
      const containerEl = $c[0];
      if (containerEl) {
        buildDeepDivTree(containerEl, 4, 3);
      }

      const leaf = $c.find('div').last();
      leaf.atomMount(CounterComponent, { initialCount: 0, label: 'Deep' });

      // Unmount from container root (recursive scan of the tree)
      $c.atomUnmount();
      cleanupContainer($c);
    },
    microBenchOptions
  );
});
