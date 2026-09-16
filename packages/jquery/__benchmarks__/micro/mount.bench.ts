/**
 * @fileoverview Micro-benchmarks for component mounting and unmounting (atomMount / atomUnmount).
 */

import { describe, test } from 'vitest';
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
  test('component lifecycle comparison', async ({ bench }) => {
    await bench.compare(
      bench(
        'atomMount initial setup (100 elements)',
        withContainer(($container) => {
          const elements = Array.from({ length: 100 }, () => $('<div></div>').appendTo($container));
          for (let i = 0; i < 100; i++) {
            elements[i]?.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
          }
        })
      ),
      bench(
        'atomMount replacement (10 elements x 10 re-mounts)',
        withContainer(($container) => {
          const $element = $('<div></div>').appendTo($container);
          for (let i = 0; i < 100; i++) {
            $element.atomMount(CounterComponent, { initialCount: i, label: `Remount-${i}` });
          }
        })
      ),
      bench(
        'atomUnmount (100 elements)',
        withContainer(($container) => {
          const elements = Array.from({ length: 100 }, (_, i) => {
            const $element = $('<div></div>').appendTo($container);
            $element.atomMount(CounterComponent, { initialCount: i, label: 'Counter' });
            return $element;
          });
          for (let i = 0; i < 100; i++) {
            elements[i]?.atomUnmount();
          }
        })
      ),
      bench(
        'mount and deep unmount (depth 4, breadth 3 ~ 120 nodes)',
        withContainer(($container) => {
          const containerEl = $container[0];
          if (!containerEl) return;
          // Build tree
          let currentLevel: HTMLElement[] = [containerEl];
          for (let depth = 0; depth < 4; depth++) {
            const nextLevel: HTMLElement[] = [];
            for (const parent of currentLevel) {
              for (let breadth = 0; breadth < 3; breadth++) {
                nextLevel.push(parent.appendChild(document.createElement('div')));
              }
            }
            currentLevel = nextLevel;
          }

          $container
            .find('div')
            .last()
            .atomMount(CounterComponent, { initialCount: 0, label: 'Deep' });
          $container.atomUnmount();
        })
      ),
      microBenchOptions
    );
  });
});
