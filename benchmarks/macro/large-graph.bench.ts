/**
 * @fileoverview large graph benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, computed } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

function createLinearChain(depth: number) {
  const a = atom(1);
  let current = computed(() => a.value);
  for (let i = 1; i < depth; i++) {
    const prev = current;
    current = computed(() => prev.value + 1);
  }
  return { root: a, leaf: current };
}

function disposeLinearChain(chain: ReturnType<typeof createLinearChain>): void {
  chain.leaf.dispose();
}

function createTree(depth: number, branchFactor: number) {
  const root = atom(1);
  const nodes: Array<ReturnType<typeof atom> | ReturnType<typeof computed>> = [root];
  let currentLevel: Array<ReturnType<typeof atom> | ReturnType<typeof computed>> = [root];

  for (let d = 0; d < depth; d++) {
    const nextLevel: Array<ReturnType<typeof computed>> = [];
    for (const parent of currentLevel) {
      for (let b = 0; b < branchFactor; b++) {
        const child = computed(() => (parent.value as number) + 1);
        nextLevel.push(child);
        nodes.push(child);
      }
    }
    currentLevel = nextLevel;
  }
  return { root, nodes, leaves: currentLevel };
}

function disposeTree(tree: ReturnType<typeof createTree>): void {
  for (let i = tree.nodes.length - 1; i >= 0; i--) {
    const n = tree.nodes[i];
    if (typeof (n as { dispose?: () => void }).dispose === 'function') {
      (n as { dispose: () => void }).dispose();
    }
  }
}

function createGrid(width: number, height: number) {
  const grid: Array<Array<ReturnType<typeof atom>>> = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = atom(x * y);
    }
  }

  const computedGrid: Array<Array<ReturnType<typeof computed>>> = [];
  for (let y = 0; y < height; y++) {
    computedGrid[y] = [];
    for (let x = 0; x < width; x++) {
      computedGrid[y][x] = computed(() => {
        const neighbors: number[] = [];
        if (y > 0) neighbors.push(grid[y - 1][x].value as number);
        if (y < height - 1) neighbors.push(grid[y + 1][x].value as number);
        if (x > 0) neighbors.push(grid[y][x - 1].value as number);
        if (x < width - 1) neighbors.push(grid[y][x + 1].value as number);
        if (neighbors.length === 0) return grid[y][x].value;
        return neighbors.reduce((sum, v) => sum + v, 0) / neighbors.length;
      });
    }
  }
  return { grid, computedGrid };
}

function disposeGrid(g: ReturnType<typeof createGrid>): void {
  for (let y = 0; y < g.computedGrid.length; y++) {
    for (let x = 0; x < g.computedGrid[y]!.length; x++) {
      g.computedGrid[y]![x]!.dispose();
    }
  }
}

function createFullyConnectedGraph(atomCount: number, computedCount: number) {
  const atoms = Array.from({ length: atomCount }, (_, i) => atom(i));
  const computeds = Array.from({ length: computedCount }, () =>
    computed(() => atoms.reduce((sum, a) => sum + a.value, 0))
  );
  return { atoms, computeds };
}

function disposeFullyConnectedGraph(g: ReturnType<typeof createFullyConnectedGraph>): void {
  for (let i = 0; i < g.computeds.length; i++) {
    g.computeds[i]!.dispose();
  }
}

export async function runLargeGraphBenchmark() {
  const tracker = new MemoryTracker();
  tracker.snapshot();

  const results = await runBenchmark(
    'Large Graph Operations',
    {
      'linear chain (depth 10)': () => {
        const chain = createLinearChain(10);
        chain.root.value = 2;
        chain.leaf.value;
        disposeLinearChain(chain);
      },
      'linear chain (depth 50)': () => {
        const chain = createLinearChain(50);
        chain.root.value = 2;
        chain.leaf.value;
        disposeLinearChain(chain);
      },
      'linear chain (depth 100)': () => {
        const chain = createLinearChain(100);
        chain.root.value = 2;
        chain.leaf.value;
        disposeLinearChain(chain);
      },
      'binary tree (depth 5)': () => {
        const tree = createTree(5, 2);
        tree.root.value = 2;
        for (const leaf of tree.leaves) {
          leaf.value;
        }
        disposeTree(tree);
      },
      'binary tree (depth 7)': () => {
        const tree = createTree(7, 2);
        tree.root.value = 2;
        for (const leaf of tree.leaves) {
          leaf.value;
        }
        disposeTree(tree);
      },
      'grid 10x10': () => {
        const g = createGrid(10, 10);
        g.grid[0]![0]!.value = 100;
        g.computedGrid.forEach((row) => row.forEach((cell) => cell.value));
        disposeGrid(g);
      },
      'fully connected (10 atoms, 10 computeds)': () => {
        const g = createFullyConnectedGraph(10, 10);
        g.atoms[0]!.value = 100;
        g.computeds.forEach((c) => c.value);
        disposeFullyConnectedGraph(g);
      },
      'fully connected (50 atoms, 50 computeds)': () => {
        const g = createFullyConnectedGraph(50, 50);
        g.atoms[0]!.value = 100;
        g.computeds.forEach((c) => c.value);
        disposeFullyConnectedGraph(g);
      },
    },
    { time: 20, iterations: 10, maxSamples: 2000 }
  );

  tracker.snapshot();
  const memoryDiff = tracker.lastDiff();
  if (memoryDiff) tracker.printDiff(memoryDiff);

  return { results, memory: memoryDiff };
}

// directly run benchmark
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runLargeGraphBenchmark().catch(console.error);
// }
