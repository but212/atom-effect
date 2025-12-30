# 🚀 Reactive Atom Benchmarks

A comprehensive benchmark suite for performance measurement.

## 📋 Table of Contents

- [Installation](#installation)
- [How to Run](#how-to-run)
- [Benchmark Types](#benchmark-types)
- [Performance Targets](#performance-targets)
- [Viewing Results](#viewing-results)

## Installation

Dependencies should already be installed:

```bash
pnpm install
```

If you don't have tsx:

```bash
pnpm add -D tsx
```

## How to Run

### Run all benchmarks

```bash
npm run bench
```

### By category

```bash
# Micro benchmarks only
npm run bench:micro

# Macro benchmarks only
npm run bench:macro
```

### Individual benchmarks

```bash
# Atom operations
npm run bench:atom

# Computed operations
npm run bench:computed

# Effect operations
npm run bench:effect

# Batch operations
npm run bench:batch

# Diamond problem
npm run bench:diamond

# Todo app simulation
npm run bench:todo

# Dashboard simulation
npm run bench:dashboard

# Large graph
npm run bench:graph
```

### Memory benchmarks

```bash
# Memory leak detection
npm run bench:memory

# GC pressure measurement
npm run bench:gc
```

## Benchmark Types

### 📌 Micro Benchmarks

Measures the performance of primitive operations.

#### 1. Atom Operations (`atom-operations.bench.ts`)

- Atom creation (single, 1000)
- Read/write values
- Subscribe/unsubscribe
- Various value types (string, object, array)

#### 2. Computed Operations (`computed-operations.bench.ts`)

- Computed creation (sync/async)
- Recalculation (single/multiple dependencies)
- Computed chains (depth 5, 10)
- Complex computations
- Conditional dependencies

#### 3. Effect Operations (`effect-operations.bench.ts`)

- Effect creation and execution
- Re-execution
- Cleanup functions
- Multiple dependencies
- Multiple effects running concurrently

#### 4. Batch Operations (`batch-operations.bench.ts`)

- Single/multiple updates
- Nested batches
- With computed chains
- Batch vs regular updates comparison

### 📌 Macro Benchmarks

Simulates real-world scenarios.

#### 1. Diamond Problem (`diamond-problem.bench.ts`)

```text
    A
   / \
  B   C
   \ /
    D
```

- Simple/complex diamond structures
- Multiple instances (10, 100, 1000)
- Deep chains
- Wide branching

#### 2. Todo App (`todo-app.bench.ts`)

- Create 1000 todo items
- Filtering (all/active/completed)
- Search
- Toggle (individual/batch)
- Delete and cleanup

#### 3. Dashboard (`dashboard.bench.ts`)

- Create 50 widgets
- Real-time data updates
- Stats calculation (avg, max, min)
- Widget selection and lookup

#### 4. Large Graph (`large-graph.bench.ts`)

- Linear chains (depth 10, 50, 100)
- Binary trees (depth 5, 7)
- Grids (10x10, 20x20)
- Fully connected graph

### 💾 Memory Benchmarks

#### 1. Leak Detection (`leak-detection.bench.ts`)

- Atom memory leak
- Computed memory leak
- Effect memory leak
- Circular reference handling

How to run:

```bash
node --expose-gc --loader tsx benchmarks/memory/leak-detection.bench.ts
```

#### 2. GC Pressure (`gc-pressure.bench.ts`)

- GC pressure under heavy object creation
- GC improvements when using batch

How to run:

```bash
node --expose-gc --loader tsx benchmarks/memory/gc-pressure.bench.ts
```

## Performance Targets

### Primitive operations

| Task | Target |
|------|--------|
| Atom creation | < 0.001ms |
| Atom read | < 0.0001ms |
| Atom write | < 0.01ms |
| Computed recompute | < 0.1ms (single dependency) |

### Real-world scenarios

| Scenario | Target |
|---------|--------|
| Diamond problem (100 nodes) | < 1ms |
| Todo app (1000 items) | < 10ms |
| Dashboard (50 widgets) | < 20ms |

### Memory

| Metric | Target |
|--------|--------|
| 1000 Atoms | < 10MB |
| GC pressure reduction | 50% (object pooling) |
| Memory leaks | 0 |

## Viewing Results

### Console output

Results are printed immediately when running benchmarks:

```text
📊 Atom Operations
================================================================================
┌─────────┬───────────────────────┬──────────────┬──────────────┬──────────┬─────────┐
│ (index) │ Benchmark             │ Ops/sec      │ Mean (ms)    │ Margin   │ Samples │
├─────────┼───────────────────────┼──────────────┼──────────────┼──────────┼─────────┤
│    0    │ 'atom creation'       │ '1,234,567'  │ '0.0008'     │ '0.52'   │  1235   │
│    1    │ 'atom read'           │ '9,876,543'  │ '0.0001'     │ '0.23'   │  9877   │
└─────────┴───────────────────────┴──────────────┴──────────────┴──────────┴─────────┘

🏆 Fastest: atom read
🐌 Slowest: atom creation
📈 Difference: 700.00% faster
```

### Report files

The following files are generated after running benchmarks:

```text
benchmarks/results/
├── benchmark-YYYY-MM-DD.json    # JSON format
├── benchmark-YYYY-MM-DD.html    # HTML report
└── benchmark-YYYY-MM-DD.md      # Markdown report
```

#### HTML report

Open the visualized results in your browser:

```bash
# Open HTML report (Windows)
start benchmarks/results/benchmark-*.html

# macOS
open benchmarks/results/benchmark-*.html

# Linux
xdg-open benchmarks/results/benchmark-*.html
```

## Writing Custom Benchmarks

To add a new benchmark:

1. Create a file in the appropriate directory:
   - `benchmarks/micro/` - primitive operations
   - `benchmarks/macro/` - real-world scenarios

2. Write the benchmark code:

```typescript
import { atom } from '../../src';
import { runBenchmark } from '../utils/benchmark-runner';

export async function runMyBenchmark() {
  await runBenchmark('My Benchmark', {
    'test case 1': () => {
      // Benchmark code
    },
    'test case 2': () => {
      // Benchmark code
    },
  });
}
```

1. Add it to `benchmarks/index.ts`:

```typescript
import { runMyBenchmark } from './micro/my-benchmark.bench';

// Add to runAll()
await runMyBenchmark();
```

## Tips

### Improve GC accuracy

Run memory benchmarks with the `--expose-gc` flag:

```bash
node --expose-gc --loader tsx benchmarks/memory/leak-detection.bench.ts
```

### Warmup

Benchmarks perform automatic warmup, but for more accurate results:

```typescript
await runBenchmark('My Benchmark', {
  // ...
}, { warmup: true, warmupTime: 500 });
```

### Adjust runtime

Default execution time is 1000ms. To adjust:

```typescript
await runBenchmark('My Benchmark', {
  // ...
}, { time: 2000 }); // 2 seconds
```

## Troubleshooting

### tsx not found

```bash
pnpm add -D tsx
```

### Memory benchmarks not working

Ensure you're using the `--expose-gc` flag:

```bash
node --expose-gc --loader tsx benchmarks/memory/leak-detection.bench.ts
```

### Benchmarks are too slow

Reduce execution time or run a specific benchmark:

```bash
npm run bench:atom  # Atom benchmark only
```

## License

MIT
