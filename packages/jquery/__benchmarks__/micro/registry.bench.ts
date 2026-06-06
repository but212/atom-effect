/**
 * @fileoverview Micro-benchmarks for reactive registry lifecycle operations (cleanup).
 */

import { bench, describe } from 'vitest';
import $, { cleanup } from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

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
    for (const p of currentLevel) {
      for (let b = 0; b < breadth; b++) {
        const child = p.appendChild(document.createElement('div'));
        nextLevel.push(child);
        if (bindReactive && (d + b) % 2 === 0) {
          $(child).atomText(source);
        }
      }
    }
    currentLevel = nextLevel;
  }
}

describe('Registry: Deep Tree Cleanup', () => {
  const run = (name: string, bindReactive: boolean) =>
    bench(
      name,
      withContainer(($c) => {
        if ($c[0]) buildDeepTree($c[0], 5, 4, bindReactive);
        cleanup($c);
      }),
      microBenchOptions
    );

  run('cleanup() - non-reactive 1000 elements tree scan', false);
  run('cleanup() - reactive 1000 elements tree (mixed bindings)', true);
});
