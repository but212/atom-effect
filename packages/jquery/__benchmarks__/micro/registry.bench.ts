/**
 * @fileoverview Micro-benchmarks for reactive registry lifecycle operations (cleanup).
 */

import { bench, describe } from 'vitest';
import $, { cleanup } from '../../dist';
import { createContainer, microBenchOptions } from '../utils/setup';

function buildDeepTree(
  container: HTMLElement,
  depth: number,
  breadth: number,
  bindReactive: boolean
): void {
  let currentLevel: HTMLElement[] = [container];
  const source = $.atom('reactive-text');

  for (let d = 0; d < depth; d++) {
    const nextLevel: HTMLElement[] = [];
    for (const parent of currentLevel) {
      for (let b = 0; b < breadth; b++) {
        const child = document.createElement('div');
        parent.appendChild(child);
        nextLevel.push(child);

        if (bindReactive && (d + b) % 2 === 0) {
          // Bind reactive text
          $(child).atomText(source);
        }
      }
    }
    currentLevel = nextLevel;
  }
}

describe('Registry: Deep Tree Cleanup', () => {
  bench(
    'cleanup() - non-reactive 1000 elements tree scan',
    () => {
      const $c = createContainer();
      const containerEl = $c[0];
      if (containerEl) {
        buildDeepTree(containerEl, 5, 4, false); // ~1024 elements
      }
      cleanup($c);
      $c.remove();
    },
    microBenchOptions
  );

  bench(
    'cleanup() - reactive 1000 elements tree (mixed bindings)',
    () => {
      const $c = createContainer();
      const containerEl = $c[0];
      if (containerEl) {
        buildDeepTree(containerEl, 5, 4, true); // ~1024 elements, mixed reactive bindings
      }
      cleanup($c);
      $c.remove();
    },
    microBenchOptions
  );
});
