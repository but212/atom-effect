/**
 * @fileoverview Micro-benchmarks for component mounting and unmounting (atomMount / atomUnmount).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

interface CounterProps {
  initialCount: number;
  label: string;
}

const CounterComponent = ($element: JQuery, props: CounterProps) => {
  const count = $.atom(props.initialCount);
  const fx = $.effect(() => {
    $element.text(`${props.label}: ${count.value}`);
  });
  return () => {
    fx.dispose();
  };
};

describe('Mounting: Component Lifecycle', () => {
  const run = (name: string, fn: ($c: JQuery) => void) =>
    bench(name, withContainer(fn), microBenchOptions);

  run('atomMount initial setup (100 elements)', ($c) => {
    const elements = Array.from({ length: 100 }, () => $('<div></div>').appendTo($c));
    for (let i = 0; i < 100; i++) {
      elements[i]?.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
    }
  });

  run('atomMount replacement (10 elements x 10 re-mounts)', ($c) => {
    const $element = $('<div></div>').appendTo($c);
    for (let i = 0; i < 100; i++) {
      $element.atomMount(CounterComponent, { initialCount: i, label: `Remount-${i}` });
    }
  });

  run('atomUnmount (100 elements)', ($c) => {
    const elements = Array.from({ length: 100 }, (_, i) => {
      const $element = $('<div></div>').appendTo($c);
      $element.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
      return $element;
    });
    for (let i = 0; i < 100; i++) {
      elements[i]?.atomUnmount();
    }
  });

  run('mount and deep unmount (depth 4, breadth 3 ~ 120 nodes)', ($c) => {
    const containerEl = $c[0];
    if (!containerEl) return;
    // Build tree
    let currentLevel: HTMLElement[] = [containerEl];
    for (let d = 0; d < 4; d++) {
      const nextLevel: HTMLElement[] = [];
      for (const p of currentLevel) {
        for (let b = 0; b < 3; b++) {
          nextLevel.push(p.appendChild(document.createElement('div')));
        }
      }
      currentLevel = nextLevel;
    }

    $c.find('div').last().atomMount(CounterComponent, { initialCount: 0, label: 'Deep' });
    $c.atomUnmount();
  });
});
