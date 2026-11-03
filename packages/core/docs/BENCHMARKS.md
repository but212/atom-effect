# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

| Category | Metric | Result | Context |
| :----------- | :----------------- | :------------- | :----------------------------------------- |
| **Atom** | Read (untracked) | 1.48M ops/sec | Performance of non-reactive reads (x100) |
| **Computed** | Recompute (cached) | 8.8K ops/sec | Cached re-evaluation performance (x100) |
| **Effect** | Propagation | 180.6K ops/sec | Full atom → computed → effect cycle (x100) |
| **Workflow** | Todo App | 142.4K ops/sec | Comprehensive workflow performance |
| **Latency** | 100 Atom updates | 0.0760 ms | Mean execution time for batched updates |

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

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------- | :----------- | :-------- | :------- |
| baseline: plain object creation | 187,687.45 | 0.0055 | 0.0085 |
| creation: primitive atom | 160,479.33 | 0.0065 | 0.0099 |
| baseline: nested object creation | 185,049.42 | 0.0055 | 0.0082 |
| creation: object atom | 155,030.62 | 0.0068 | 0.0111 |
| baseline: plain object read/write | 3,890,104.64 | 0.0003 | 0.0003 |
| read/write performance: active | 164,573.19 | 0.0065 | 0.0114 |
| untracked read: active | 1,478,964.93 | 0.0007 | 0.0007 |
| baseline: plain object property read | 1,486,981.57 | 0.0007 | 0.0007 |
| atom.value read | 1,295,452.95 | 0.0008 | 0.0008 |
| atom.peek() read | 1,481,725.04 | 0.0007 | 0.0007 |

#### Computed Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw function creation | 172,627.88 | 0.0061 | 0.0144 |
| creation: flat computed | 72,162.26 | 0.0147 | 0.0276 |
| creation: chained computed (10 levels) | 653,803.19 | 0.0016 | 0.0025 |
| baseline: raw chained function evaluation | 106,266.70 | 0.0095 | 0.0157 |
| recomputation & cache | 8,767.87 | 0.1151 | 0.1861 |
| lazy evaluation overhead | 48,019.05 | 0.0216 | 0.0418 |
| baseline: plain function call | 1,526,884.25 | 0.0007 | 0.0007 |
| computed.value read (active) | 1,300,243.48 | 0.0008 | 0.0013 |
| computed.peek() read (active) | 1,482,105.36 | 0.0007 | 0.0008 |
| creation: async computed | 103,283.66 | 0.0102 | 0.0207 |
| read: resolved value & state | 106,035.76 | 0.0096 | 0.0156 |
| resolution: promise resolving lifecycle | 61,260.55 | 0.0166 | 0.0288 |

#### Effect Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------ | :----------- | :-------- | :------- |
| baseline: listener registration and removal | 121,240.02 | 0.0086 | 0.0190 |
| creation & disposal | 32,139.35 | 0.0337 | 0.0511 |
| baseline: raw callback propagation | 78,910.53 | 0.0127 | 0.0210 |
| propagation: atom → computed → effect | 180,562.82 | 0.0057 | 0.0073 |
| cleanup execution | 176,658.57 | 0.0061 | 0.0082 |
| baseline: Set add + delete | 124,980.76 | 0.0092 | 0.0239 |
| atom.subscribe + unsubscribe | 398,779.58 | 0.0027 | 0.0043 |
| computed.subscribe + unsubscribe | 354,976.45 | 0.0030 | 0.0051 |

#### Lenses (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw nested object read | 201,838.51 | 0.0050 | 0.0069 |
| read: lens | 105,342.94 | 0.0096 | 0.0182 |
| read: computed active | 199,695.27 | 0.0051 | 0.0071 |
| read: direct object access | 198,628.97 | 0.0051 | 0.0058 |
| baseline: raw nested object write | 1,580,826.58 | 0.0006 | 0.0007 |
| write: lens | 24,081.37 | 0.0426 | 0.0588 |
| write: manual spread | 174,376.57 | 0.0060 | 0.0116 |
| composition & scaling (100 active lenses) | 1,095,890.34 | 0.0009 | 0.0013 |

---

### 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

#### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------------------------- | :----------- | :-------- | :------- |
| baseline: schedule 1 native microtask | 4,999,643.45 | 0.0002 | 0.0004 |
| schedule 1 microtask | 2,266,382.17 | 0.0005 | 0.0008 |
| baseline: schedule 100 native microtasks (parallel) | 170,295.62 | 0.0062 | 0.0099 |
| schedule 100 microtasks (parallel) | 143,983.94 | 0.0074 | 0.0182 |

#### Untracked Context (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------- | :----------- | :-------- | :------- |
| tracked read inside computed | 1,511,251.80 | 0.0007 | 0.0008 |
| untracked(() => read) | 3,063,476.57 | 0.0003 | 0.0004 |
| peek() read — no context | 6,158,309.36 | 0.0002 | 0.0002 |

#### Batch Nesting (100 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------ | :----------- | :-------- | :------- |
| unbatched 100 writes | 164,389.37 | 0.0063 | 0.0114 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 100 atoms: active (x100) | 36,181.72 | 0.0283 | 0.0502 |
| batched computed chain update (x100) | 19,172.48 | 0.0529 | 0.0784 |

---

### 3. Propagation and Topology

#### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------- | :----------- | :-------- | :------- |
| 1 to 1 propagation (Depth 1000) | 7,719.79 | 0.1317 | 0.2460 |
| 1 to N propagation (Fan Out 1000) | 6,831.40 | 0.1476 | 0.2776 |
| N to 1 propagation (Fan In 1000) | 646.17 | 1.5488 | 1.6401 |

---

### 4. Type Guards (x800)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| baseline: basic property check | 23,215.17 | 0.0437 | 0.0737 |
| isAtom checks | 22,081.72 | 0.0456 | 0.0576 |
| isComputed checks | 22,094.85 | 0.0456 | 0.0570 |

---

### 5. Macro and Realistic Workflows

#### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------- | :----------- | :-------- | :------- |
| deep chain (100 levels) | 86,000.51 | 0.0119 | 0.0221 |
| diamond pattern (1 → 10 → 10 → 1) | 354,701.46 | 0.0029 | 0.0038 |
| pyramid pattern (50 levels) | 140,606.10 | 0.0073 | 0.0113 |
| mixed dependencies (100 atoms → 200 computeds) | 720,485.01 | 0.0014 | 0.0017 |
| circular avoidance (x100) | 22,925.87 | 0.0447 | 0.0824 |
| conditional dependencies (x100) | 16,985.98 | 0.0696 | 0.1338 |
| array-based selection (x100) | 17,211.41 | 0.0694 | 0.1392 |
| batch update: 10 random cells | 313,173.48 | 0.0034 | 0.0054 |
| bulk update: replace full grid | 48,853.92 | 0.0295 | 0.1681 |
| read performance: 2500 lenses | 4,726.65 | 0.2125 | 0.2425 |
| read depth 100 lens chain (x100) | 7,305.43 | 0.1372 | 0.1581 |
| update depth 100 lens chain | 83,479.16 | 0.0121 | 0.0206 |

#### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] Toggle Sort | 5,115.71 | 0.1971 | 0.2405 |
| [Atom] Toggle Sort | 5,015.02 | 0.2009 | 0.2498 |
| [Vanilla] Switch Filter | 449,394.10 | 0.0023 | 0.0035 |
| [Atom] Switch Filter | 147,915.19 | 0.0070 | 0.0122 |
| [Vanilla] sort + filter + paginate | 4,755.19 | 0.2113 | 0.2501 |
| [Atom] sort + filter + paginate | 4,771.30 | 0.2104 | 0.2442 |
| [Manual] update single cell (x100) | 13,587.17 | 0.0784 | 0.2163 |
| [Lens] update single cell (x100) | 10,031.37 | 0.1046 | 0.2550 |
| select/deselect rows (Set-based) | 17,310.32 | 0.0617 | 0.2318 |

#### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------------------- | :----------- | :-------- | :------- |
| heavy component lifecycle (mount→update→unmount) | 84,819.25 | 0.0130 | 0.0244 |
| subscription churn (1K cycles) | 41,188.97 | 0.0260 | 0.1706 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 83,322.30 | 0.0133 | 0.0239 |
| 10K entity state tree management | 334,188.97 | 0.0040 | 0.0053 |
| heap monitoring (1000 large atoms) | 3,541.00 | 0.2901 | 0.5354 |

#### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------ | :----------- | :-------- | :------- |
| [Batch] form reset (20 fields) | 352,153.36 | 0.0030 | 0.0066 |
| [Manual] form reset (20 fields) | 798,561.09 | 0.0014 | 0.0028 |
| [Batch] state sync (100 atoms) | 13,252.65 | 0.0760 | 0.1017 |
| [Manual] state sync (100 atoms) | 144,628.93 | 0.0071 | 0.0141 |

#### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------------------ | :----------- | :-------- | :------- |
| [Vanilla] filter 1000 items on query change | 102,565.36 | 0.0145 | 0.0333 |
| [Atom] filter 1000 items (Fresh Computed each time) | 12,296.57 | 0.0887 | 0.1746 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 9,552.13 | 0.1060 | 0.1281 |
| [Vanilla] add items → apply coupon → total | 3,222,845.29 | 0.0003 | 0.0004 |
| [Atom] add items → apply coupon → total | 1,011,206.66 | 0.0010 | 0.0014 |
| [Vanilla] update source → recalc all KPIs | 7,834,684.76 | 0.0001 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 1,284,377.16 | 0.0008 | 0.0009 |

---

### 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] object allocation (baseline) | 168,470.24 | 0.0061 | 0.0109 |
| [Atom] creation + first .value read | 143,075.94 | 0.0074 | 0.0127 |
| [Vanilla] function call (computed baseline) | 167,159.83 | 0.0061 | 0.0094 |
| [Atom] lazy computed creation + first eval | 50,911.55 | 0.0209 | 0.0372 |
| [Atom] eager computed creation + first eval | 49,411.88 | 0.0212 | 0.0391 |
| [Atom] effect creation + first run + dispose | 30,384.98 | 0.0362 | 0.0590 |
| [Vanilla] variable write + read | 169,611.45 | 0.0060 | 0.0073 |
| [Atom] atom write + computed propagation | 37,715.11 | 0.0272 | 0.0463 |
| [Atom] atom read only — warm cache | 193,319.82 | 0.0052 | 0.0058 |
| [Atom] computed read only — warm cache hit | 194,805.30 | 0.0052 | 0.0064 |
| [Cold] new computed each iteration | 57,892.40 | 0.0182 | 0.0313 |
| [Warm] reuse computed — cache hit (source unchanged) | 196,182.64 | 0.0051 | 0.0058 |
| [Warm] reuse computed — cache miss (source changed) | 56,057.44 | 0.0183 | 0.0289 |
| [Cold] effect create + first run + dispose | 34,035.48 | 0.0335 | 0.0494 |
| [Warm] effect repeated trigger (x100) | 253,459.05 | 0.0041 | 0.0049 |
