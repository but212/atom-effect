# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

| Category     | Metric             | Result         | Context                                    |
| :----------- | :----------------- | :------------- | :----------------------------------------- |
| **Atom**     | Read (untracked)   | 1.83M ops/sec  | Performance of non-reactive reads (x100)   |
| **Computed** | Recompute (cached) | 8.1K ops/sec   | Cached re-evaluation performance (x100)    |
| **Effect**   | Propagation        | 234.1K ops/sec | Full atom → computed → effect cycle (x100) |
| **Workflow** | Todo App           | 181.2K ops/sec | Comprehensive workflow performance         |
| **Latency**  | 100 Atom updates   | 0.1116 ms      | Mean execution time for batched updates    |

---

## Running Benchmarks

Benchmarks are executed using the Vitest test runner. Because this project is structured as a monorepo, benchmark scripts can be executed either globally from the workspace root using package filters or directly within the `@but212/atom-effect` core package directory.

### Execution from the Workspace Root (Recommended)

To run benchmarks from the root of the monorepo, use the `--filter` flag to target the core package:

```bash
# Execute the full benchmark suite
pnpm --filter @but212/atom-effect bench

# Execute micro-benchmarks only
pnpm --filter @but212/atom-effect bench:micro

# Execute macro-benchmarks only
pnpm --filter @but212/atom-effect bench:macro

# Execute realistic scenario benchmarks
pnpm --filter @but212/atom-effect bench:realistic

# Execute state benchmarks only
pnpm --filter @but212/atom-effect bench:state
```

### Execution within the Core Package Directory

Alternatively, navigate to the core package directory to execute the scripts locally:

```bash
cd packages/core

# Execute the full benchmark suite
pnpm bench

# Execute micro-benchmarks only
pnpm bench:micro

# Execute macro-benchmarks only
pnpm bench:macro

# Execute realistic scenario benchmarks
pnpm bench:realistic

# Execute state benchmarks only
pnpm bench:state
```

### Targeted Execution

Specific benchmark suites can be targeted by passing a search pattern. The runner filters the test suites by matching the pattern against file paths:

```bash
# From the workspace root:
pnpm --filter @but212/atom-effect bench atoms
pnpm --filter @but212/atom-effect bench computeds

# Or inside packages/core/:
pnpm bench atoms
pnpm bench computeds
```

---

## Benchmark Categories

### 1. Micro-Benchmarks

Located in `__benchmarks__/micro/`, these tests measure the overhead of individual reactive primitives in isolation.
- **Atom**: Measures creation, reactive/non-reactive reads, writes, and subscription overhead.
- **Computed**: Measures dependency tracking efficiency, lazy evaluation overhead, and cache hit/miss performance.
- **Effect**: Measures execution scheduling, cleanup rotation, and disposal latency.
- **Propagation**: Stress tests various graph topologies, including deep chains, wide fan-outs (1-to-N), and fan-ins (N-to-1).

### 2. Macro-Benchmarks

Located in `__benchmarks__/macro/`, these tests simulate common application patterns without external dependencies (e.g., DOM).
- **Todo Workflow**: A complete sequence of adding, toggling, filtering, and deleting items.
- **Data Grid**: Performance of sorting, filtering, and pagination over large datasets (1000+ rows).
- **Graph Stress**: Evaluation of complex dependency structures such as diamond and pyramid patterns.

### 3. Realistic Scenarios

Located in `__benchmarks__/realistic/`, these tests evaluate the system under constraints typical of production environments.
- **Frame Budget Analysis**: Ensures that reactive updates complete within the 16.6ms window required for 60fps rendering.
- **Memory Stability**: Monitors heap usage during high-churn lifecycle cycles (mount/update/unmount).

---

## Interpretation of Results

### Metric Definitions

- **ops/sec (Hz)**: The number of operations completed per second. Higher values indicate greater throughput.
- **Mean (ms)**: The average time taken to complete a single operation.
- **p99 (ms)**: The 99th percentile latency, representing the upper bound for 99% of the operations.

### Performance Indicators

| Metric                 | Nominal Range  | Rationale                                                 |
| :--------------------- | :------------- | :-------------------------------------------------------- |
| **Atom reads (peek)**  | > 500K ops/sec | Indicates minimal overhead for non-reactive state access. |
| **Computed recompute** | > 1M ops/sec   | Indicates efficient cache validation and re-use.          |
| **Effect execution**   | > 1M ops/sec   | Ensures rapid propagation across the dependency graph.    |
| **Batch Latency**      | < 16ms         | Ensures compliance with browser rendering cycles.         |

### Potential Issues

- **Throughput Drop**: Significant decreases in `ops/sec` for primitive operations often indicate increased internal overhead in the scheduler or tracking context.
- **Latency Spikes**: High `p99` values relative to the mean suggest periodic blocking operations or excessive Garbage Collection (GC) pressure.
- **Scaling Inefficiency**: Disproportionate performance degradation when increasing dependency depth (e.g., from 10 to 1000 nodes) indicates $O(N)$ or worse complexity in hot paths.

---

## Technical Specifications

**Version**: v0.34.0
**Last Updated**: 2026-06-20
**Environment**:
- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

## Detailed Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-20
**Version**: v0.34.0
- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

### 1. Micro-Benchmarks

#### Atom Operations (x100)

| Test Case                            | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------- | :----------- | :-------- | :------- |
| baseline: plain object creation      | 193,424.25   | 0.0053    | 0.0079   |
| creation: primitive atom             | 155,962.10   | 0.0068    | 0.0104   |
| baseline: nested object creation     | 183,522.82   | 0.0055    | 0.0073   |
| creation: object atom                | 153,300.91   | 0.0069    | 0.0120   |
| baseline: plain object read/write    | 3,880,821.50 | 0.0003    | 0.0004   |
| read/write performance: active       | 183,268.43   | 0.0060    | 0.0093   |
| untracked read: active               | 1,828,795.16 | 0.0006    | 0.0008   |
| baseline: plain object property read | 2,000,094.08 | 0.0005    | 0.0007   |
| atom.value read                      | 1,659,240.29 | 0.0006    | 0.0008   |
| atom.peek() read                     | 1,991,461.52 | 0.0005    | 0.0007   |

#### Computed Operations (x100)

| Test Case                                 | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw function creation           | 178,147.27   | 0.0060    | 0.0129   |
| creation: flat computed                   | 54,294.82    | 0.0196    | 0.0335   |
| creation: chained computed (10 levels)    | 548,910.77   | 0.0020    | 0.0028   |
| baseline: raw chained function evaluation | 114,524.41   | 0.0088    | 0.0118   |
| recomputation & cache                     | 8,084.32     | 0.1270    | 0.2911   |
| lazy evaluation overhead                  | 55,476.20    | 0.0198    | 0.0461   |
| baseline: plain function call             | 2,013,458.36 | 0.0005    | 0.0007   |
| computed.value read (active)              | 1,296,078.13 | 0.0008    | 0.0013   |
| computed.peek() read (active)             | 1,976,036.18 | 0.0005    | 0.0007   |
| creation: async computed                  | 109,807.26   | 0.0097    | 0.0196   |
| read: resolved value & state              | 114,142.66   | 0.0089    | 0.0124   |
| resolution: promise resolving lifecycle   | 66,933.02    | 0.0152    | 0.0221   |

#### Effect Operations (x100)

| Test Case                                   | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------ | :----------- | :-------- | :------- |
| baseline: listener registration and removal | 136,906.38   | 0.0077    | 0.0171   |
| creation & disposal                         | 39,371.48    | 0.0292    | 0.0392   |
| baseline: raw callback propagation          | 93,065.49    | 0.0108    | 0.0163   |
| propagation: atom → computed → effect       | 234,052.50   | 0.0044    | 0.0060   |
| cleanup execution                           | 209,041.66   | 0.0052    | 0.0079   |
| baseline: Set add + delete                  | 139,326.58   | 0.0085    | 0.0222   |
| atom.subscribe + unsubscribe                | 349,872.00   | 0.0031    | 0.0043   |
| computed.subscribe + unsubscribe            | 341,666.88   | 0.0032    | 0.0048   |

#### Lenses (x100)

| Test Case                                 | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw nested object read          | 200,821.38   | 0.0050    | 0.0070   |
| read: lens                                | 118,306.23   | 0.0085    | 0.0128   |
| read: computed active                     | 198,942.82   | 0.0051    | 0.0058   |
| read: direct object access                | 198,266.66   | 0.0051    | 0.0064   |
| baseline: raw nested object write         | 2,003,268.61 | 0.0005    | 0.0007   |
| write: lens                               | 31,713.46    | 0.0320    | 0.0398   |
| write: manual spread                      | 213,032.58   | 0.0049    | 0.0062   |
| composition & scaling (100 active lenses) | 1,482,489.06 | 0.0007    | 0.0010   |

---

### 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

#### aeNextTick / Microtasks

| Test Case                                           | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------------------------- | :----------- | :-------- | :------- |
| baseline: schedule 1 native microtask               | 4,141,701.35 | 0.0003    | 0.0007   |
| schedule 1 microtask                                | 1,945,574.93 | 0.0006    | 0.0011   |
| baseline: schedule 100 native microtasks (parallel) | 188,309.95   | 0.0058    | 0.0077   |
| schedule 100 microtasks (parallel)                  | 163,645.51   | 0.0065    | 0.0105   |

#### Untracked Context (x100)

| Test Case                    | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------- | :----------- | :-------- | :------- |
| tracked read inside computed | 1,506,360.34 | 0.0007    | 0.0010   |
| untracked(() => read)        | 2,916,539.94 | 0.0003    | 0.0005   |
| peek() read — no context     | 6,288,871.69 | 0.0002    | 0.0003   |

#### Batch Nesting (100 writes)

| Test Case                             | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------ | :----------- | :-------- | :------- |
| unbatched 100 writes                  | 188,994.88   | 0.0054    | 0.0072   |
| flat batch                            | 454,469.63   | 0.0022    | 0.0029   |
| nested batch (3 levels)               | 447,269.01   | 0.0022    | 0.0034   |
| batch update 100 atoms: active (x100) | 43,687.22    | 0.0236    | 0.0352   |
| batched computed chain update (x100)  | 19,710.97    | 0.0517    | 0.0717   |

---

### 3. Propagation and Topology

#### Stress Tests (1000 nodes)

| Test Case                         | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------- | :----------- | :-------- | :------- |
| 1 to 1 propagation (Depth 1000)   | 9,213.09     | 0.1108    | 0.2733   |
| 1 to N propagation (Fan Out 1000) | 7,430.65     | 0.1366    | 0.3168   |
| N to 1 propagation (Fan In 1000)  | 45,119.90    | 0.0222    | 0.0283   |

---

### 4. Type Guards (x800)

| Test Case                      | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| baseline: basic property check | 23,984.78    | 0.0420    | 0.0486   |
| isAtom checks                  | 22,173.01    | 0.0454    | 0.0523   |
| isComputed checks              | 22,092.90    | 0.0456    | 0.0533   |

---

### 5. Macro and Realistic Workflows

#### Complex Graph Patterns

| Pattern                                        | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------- | :----------- | :-------- | :------- |
| deep chain (100 levels)                        | 82,849.73    | 0.0127    | 0.0222   |
| diamond pattern (1 → 10 → 10 → 1)              | 376,654.02   | 0.0028    | 0.0047   |
| pyramid pattern (50 levels)                    | 137,044.43   | 0.0077    | 0.0157   |
| mixed dependencies (100 atoms → 200 computeds) | 835,026.71   | 0.0013    | 0.0020   |
| circular avoidance (x100)                      | 26,303.87    | 0.0406    | 0.0599   |
| conditional dependencies (x100)                | 18,113.45    | 0.0686    | 0.1295   |
| array-based selection (x100)                   | 17,852.29    | 0.0578    | 0.0937   |
| batch update: 10 random cells                  | 388,515.71   | 0.0028    | 0.0052   |
| bulk update: replace full grid                 | 58,826.57    | 0.0252    | 0.1573   |
| read performance: 2500 lenses                  | 6,230.64     | 0.1613    | 0.1808   |
| read depth 100 lens chain (x100)               | 9,435.92     | 0.1061    | 0.1201   |
| update depth 100 lens chain                    | 107,255.04   | 0.0095    | 0.0161   |

#### Data Grid Operations (1000 Rows)

| Scenario                           | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] Toggle Sort              | 6,701.43     | 0.1503    | 0.1816   |
| [Atom] Toggle Sort                 | 6,515.80     | 0.1549    | 0.1902   |
| [Vanilla] Switch Filter            | 555,833.40   | 0.0019    | 0.0030   |
| [Atom] Switch Filter               | 193,536.68   | 0.0054    | 0.0096   |
| [Vanilla] sort + filter + paginate | 6,128.00     | 0.1643    | 0.1912   |
| [Atom] sort + filter + paginate    | 6,214.29     | 0.1628    | 0.2080   |
| [Manual] update single cell (x100) | 21,028.08    | 0.0546    | 0.2241   |
| [Lens] update single cell (x100)   | 14,699.41    | 0.0758    | 0.2726   |
| select/deselect rows (Set-based)   | 21,515.76    | 0.0525    | 0.2853   |

#### Memory and Lifecycle

| Scenario                                         | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------------------- | :----------- | :-------- | :------- |
| heavy component lifecycle (mount→update→unmount) | 78,097.26    | 0.0144    | 0.0251   |
| subscription churn (1K cycles)                   | 38,851.78    | 0.0279    | 0.0713   |
| create and dispose 1000 units                    | 1,303.04     | 0.7674    | 1.4376   |
| circular reference cleanup (100 cycles)          | 100,114.29   | 0.0114    | 0.0232   |
| 10K entity state tree management                 | 360,207.55   | 0.0034    | 0.0065   |
| heap monitoring (1000 large atoms)               | 3,931.72     | 0.2630    | 0.5237   |

#### Efficiency: Batching vs Manual Propagation

| Scenario                        | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------ | :----------- | :-------- | :------- |
| [Batch] form reset (20 fields)  | 346,624.85   | 0.0030    | 0.0047   |
| [Manual] form reset (20 fields) | 819,429.98   | 0.0013    | 0.0023   |
| [Batch] state sync (100 atoms)  | 9,122.98     | 0.1116    | 0.2390   |
| [Manual] state sync (100 atoms) | 149,198.89   | 0.0069    | 0.0145   |

#### Realistic Scenarios (Workflow & Pipelines)

| Scenario                                                | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------------------ | :----------- | :-------- | :------- |
| [Vanilla] filter 1000 items on query change             | 100,219.08   | 0.0148    | 0.0331   |
| [Atom] filter 1000 items (Fresh Computed each time)     | 13,946.25    | 0.0797    | 0.1269   |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 12,877.36    | 0.0795    | 0.1071   |
| [Vanilla] add items → apply coupon → total              | 3,295,228.62 | 0.0003    | 0.0004   |
| [Atom] add items → apply coupon → total                 | 881,134.32   | 0.0012    | 0.0015   |
| [Vanilla] update source → recalc all KPIs               | 7,832,608.08 | 0.0001    | 0.0002   |
| [Atom] update source → reactive KPI pipeline            | 1,118,365.33 | 0.0009    | 0.0011   |

---

### 6. Cold / Warm State Operations

| Scenario                                             | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] object allocation (baseline)               | 192,397.36   | 0.0053    | 0.0081   |
| [Atom] creation + first .value read                  | 172,072.22   | 0.0061    | 0.0097   |
| [Vanilla] function call (computed baseline)          | 185,012.06   | 0.0055    | 0.0070   |
| [Atom] lazy computed creation + first eval           | 51,649.11    | 0.0208    | 0.0451   |
| [Atom] eager computed creation + first eval          | 55,050.17    | 0.0193    | 0.0437   |
| [Atom] effect creation + first run + dispose         | 32,342.40    | 0.0340    | 0.0726   |
| [Vanilla] variable write + read                      | 187,306.56   | 0.0054    | 0.0060   |
| [Atom] atom write + computed propagation             | 33,624.80    | 0.0303    | 0.0384   |
| [Atom] atom read only — warm cache                   | 225,751.54   | 0.0045    | 0.0050   |
| [Atom] computed read only — warm cache hit           | 217,485.06   | 0.0046    | 0.0051   |
| [Cold] new computed each iteration                   | 57,038.73    | 0.0185    | 0.0338   |
| [Warm] reuse computed — cache hit (source unchanged) | 218,148.71   | 0.0046    | 0.0058   |
| [Warm] reuse computed — cache miss (source changed)  | 46,552.19    | 0.0219    | 0.0293   |
| [Cold] effect create + first run + dispose           | 35,841.24    | 0.0313    | 0.0592   |
| [Warm] effect repeated trigger (x100)                | 262,204.61   | 0.0039    | 0.0053   |
