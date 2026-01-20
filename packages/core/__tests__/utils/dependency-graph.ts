export interface GraphNode {
  read: () => number;
}

export interface SignalNode extends GraphNode {
  write: (val: number) => void;
}

export interface TestConfig {
  width: number;
  totalLayers: number;
  staticFraction: number;
  nSources: number;
  readFraction: number;
  expected: Record<string, number>;
  iterations: number;
}

export type SignalFactory = (val: number) => SignalNode;
export type ComputedFactory = (fn: () => number) => GraphNode;
export type EffectFactory = (fn: () => void) => undefined | (() => void);

export interface FrameworkArgs {
  name: string;
  signal: SignalFactory;
  computed: ComputedFactory;
  effect: EffectFactory;
  withBuild: <T>(fn: () => T) => T;
  withBatch: (fn: () => void) => void;
}

export interface FrameworkInfo {
  framework: FrameworkArgs;
  testPullCounts: boolean;
}

export class Counter {
  count = 0;
}

export function makeGraph(framework: FrameworkArgs, config: TestConfig, counter: Counter) {
  const { nSources, width, totalLayers } = config;

  if (nSources <= 0) throw new Error('nSources must be > 0');
  if (width <= 0) throw new Error('width must be > 0');

  const sources: SignalNode[] = [];
  for (let i = 0; i < nSources; i++) {
    sources.push(framework.signal(1));
  }

  let prevLayer: GraphNode[] = sources;
  const layers: GraphNode[][] = [];

  for (let l = 0; l < totalLayers; l++) {
    const currentLayer: GraphNode[] = [];
    for (let i = 0; i < width; i++) {
      // Depend on 2 nodes from previous layer to create mixing
      const d1 = prevLayer[i % prevLayer.length]!;
      const d2 = prevLayer[(i + 1) % prevLayer.length]!;

      // Simplified: Just Sum for now.
      currentLayer.push(
        framework.computed(() => {
          counter.count++;
          return d1.read() + d2.read();
        })
      );
    }
    layers.push(currentLayer);
    prevLayer = currentLayer;
  }

  return { sources, layers };
}

export function runGraph(
  graph: { sources: SignalNode[]; layers: GraphNode[][] },
  iterations: number,
  readFraction: number,
  framework: FrameworkArgs
) {
  let sum = 0;
  for (let i = 0; i < iterations; i++) {
    framework.withBatch(() => {
      for (let s = 0; s < graph.sources.length; s++) {
        graph.sources[s]!.write(i + s);
      }
    });

    if (graph.layers.length === 0) continue;

    const leaves = graph.layers[graph.layers.length - 1]!;
    const nToRead = Math.ceil(leaves.length * readFraction);

    for (let j = 0; j < nToRead; j++) {
      sum += leaves[j]!.read();
    }
  }
  return sum;
}
