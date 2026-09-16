import { describe, test } from 'vitest';
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

  for (let depthIndex = 0; depthIndex < depth; depthIndex++) {
    const nextLevel: HTMLElement[] = [];
    for (const parent of currentLevel) {
      for (let breadthIndex = 0; breadthIndex < breadth; breadthIndex++) {
        const child = parent.appendChild(document.createElement('div'));
        nextLevel.push(child);
        if (bindReactive && (depthIndex + breadthIndex) % 2 === 0) {
          $(child).atomText(source);
        }
      }
    }
    currentLevel = nextLevel;
  }
}

describe('Registry: Deep Tree Cleanup', () => {
  test('cleanup comparison', async ({ bench }) => {
    await bench.compare(
      bench(
        'cleanup() - non-reactive 1000 elements tree scan',
        withContainer(($container) => {
          if ($container[0]) buildDeepTree($container[0], 5, 4, false);
          cleanup($container);
        })
      ),
      bench(
        'cleanup() - reactive 1000 elements tree (mixed bindings)',
        withContainer(($container) => {
          if ($container[0]) buildDeepTree($container[0], 5, 4, true);
          cleanup($container);
        })
      ),
      microBenchOptions
    );
  });
});
