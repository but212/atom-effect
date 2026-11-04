# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

| Category | Metric | Result | Context |
| :----------- | :----------------- | :------------- | :----------------------------------------- |
| **Atom** | Read (untracked) | 1.48M ops/sec | Performance of non-reactive reads (x100) |
| **Computed** | Recompute (cached) | 8.8K ops/sec | Cached re-evaluation performance (x100) |
| **Effect** | Propagation | 136.6K ops/sec | Full atom → computed → effect cycle (x100) |
| **Workflow** | Todo App | 272.3K ops/sec | Comprehensive workflow performance |
| **Latency** | 100 Atom updates | 0.0370 ms | Mean execution time for batched updates |

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
- **Realistic Workflows**: End-to-end patterns including search filter, cart workflows, and KPI pipelines.

### 3. State Benchmarks

Located in `__benchmarks__/state/`, these tests measure cold start evaluation overhead and steady-state warm cache execution.

- **Cold Start**: First evaluation and instantiation overhead for atoms, computeds, and effects.
- **Steady State**: Repeated execution, cache hit rates, and subscription stability.

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
| baseline: plain object creation | 187,652.01 | 0.0055 | 0.0086 |
| creation: primitive atom | 160,374.31 | 0.0065 | 0.0101 |
| baseline: nested object creation | 185,183.95 | 0.0055 | 0.0065 |
| creation: object atom | 155,173.56 | 0.0068 | 0.0109 |
| baseline: plain object read/write | 3,832,326.51 | 0.0003 | 0.0003 |
| read/write performance: active | 146,100.08 | 0.0072 | 0.0133 |
| untracked read: active | 1,475,760.03 | 0.0007 | 0.0008 |
| baseline: plain object property read | 1,498,167.33 | 0.0007 | 0.0008 |
| atom.value read | 1,293,323.78 | 0.0008 | 0.0008 |
| atom.peek() read | 1,477,856.23 | 0.0007 | 0.0007 |

#### Computed Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw function creation | 161,155.85 | 0.0066 | 0.0154 |
| creation: flat computed | 67,486.44 | 0.0157 | 0.0302 |
| creation: chained computed (10 levels) | 605,727.91 | 0.0018 | 0.0023 |
| baseline: raw chained function evaluation | 106,367.40 | 0.0095 | 0.0185 |
| recomputation & cache | 8,812.02 | 0.1161 | 0.2797 |
| lazy evaluation overhead | 55,607.79 | 0.0188 | 0.0395 |
| baseline: plain function call | 1,428,323.19 | 0.0007 | 0.0007 |
| computed.value read (active) | 1,244,674.16 | 0.0008 | 0.0014 |
| computed.peek() read (active) | 1,481,588.59 | 0.0007 | 0.0007 |
| creation: async computed | 101,595.83 | 0.0103 | 0.0212 |
| read: resolved value & state | 106,088.90 | 0.0095 | 0.0168 |
| resolution: promise resolving lifecycle | 61,092.64 | 0.0166 | 0.0287 |

#### Effect Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------ | :----------- | :-------- | :------- |
| baseline: listener registration and removal | 121,144.78 | 0.0086 | 0.0193 |
| creation & disposal | 30,981.47 | 0.0354 | 0.0573 |
| baseline: raw callback propagation | 82,043.49 | 0.0123 | 0.0205 |
| propagation: atom → computed → effect | 136,641.02 | 0.0075 | 0.0122 |
| cleanup execution | 176,757.65 | 0.0062 | 0.0112 |
| baseline: Set add + delete | 113,487.39 | 0.0101 | 0.0237 |
| atom.subscribe + unsubscribe | 371,152.23 | 0.0029 | 0.0043 |
| computed.subscribe + unsubscribe | 353,604.32 | 0.0031 | 0.0056 |

#### Lenses (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw nested object read | 201,785.17 | 0.0050 | 0.0070 |
| read: lens | 110,002.24 | 0.0092 | 0.0173 |
| read: computed active | 199,902.51 | 0.0051 | 0.0067 |
| read: direct object access | 198,774.81 | 0.0051 | 0.0057 |
| baseline: raw nested object write | 1,575,010.96 | 0.0007 | 0.0007 |
| write: lens | 24,382.37 | 0.0421 | 0.0594 |
| write: manual spread | 175,724.00 | 0.0059 | 0.0086 |
| composition & scaling (100 active lenses) | 1,114,421.40 | 0.0009 | 0.0012 |

---

### 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

#### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------------------------- | :----------- | :-------- | :------- |
| baseline: schedule 1 native microtask | 4,999,643.45 | 0.0002 | 0.0004 |
| schedule 1 microtask | 2,266,382.17 | 0.0005 | 0.0008 |
| baseline: schedule 100 native microtasks (parallel) | 170,483.76 | 0.0062 | 0.0140 |
| schedule 100 microtasks (parallel) | 154,969.05 | 0.0067 | 0.0110 |

#### Untracked Context (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------- | :----------- | :-------- | :------- |
| tracked read inside computed | 1,398,207.13 | 0.0007 | 0.0008 |
| untracked(() => read) | 2,529,767.86 | 0.0004 | 0.0004 |
| peek() read — no context | 5,833,448.16 | 0.0002 | 0.0002 |

#### Batch Nesting (100 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------ | :----------- | :-------- | :------- |
| unbatched 100 writes | 165,057.93 | 0.0063 | 0.0116 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 100 atoms: active (x100) | 40,177.05 | 0.0254 | 0.0396 |
| batched computed chain update (x100) | 19,016.12 | 0.0532 | 0.0776 |

---

### 3. Propagation and Topology

#### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------- | :----------- | :-------- | :------- |
| 1 to 1 propagation (Depth 1000) | 7,726.65 | 0.1318 | 0.2225 |
| 1 to N propagation (Fan Out 1000) | 6,825.82 | 0.1481 | 0.3338 |
| N to 1 propagation (Fan In 1000) | 59,577.65 | 0.0169 | 0.0263 |

---

### 4. Type Guards (x800)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| baseline: basic property check | 23,335.49 | 0.0432 | 0.0573 |
| isAtom checks | 21,981.45 | 0.0459 | 0.0680 |
| isComputed checks | 21,943.23 | 0.0462 | 0.0707 |

---

### 5. Macro and Realistic Workflows

#### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------- | :----------- | :-------- | :------- |
| deep chain (100 levels) | 121,035.17 | 0.0084 | 0.0138 |
| diamond pattern (1 → 10 → 10 → 1) | 694,319.67 | 0.0015 | 0.0025 |
| pyramid pattern (50 levels) | 189,250.62 | 0.0054 | 0.0074 |
| mixed dependencies (100 atoms → 200 computeds) | 1,178,794.93 | 0.0009 | 0.0013 |
| circular avoidance (x100) | 47,139.32 | 0.0216 | 0.0371 |
| conditional dependencies (x100) | 36,541.24 | 0.0290 | 0.0493 |
| array-based selection (x100) | 38,363.57 | 0.0264 | 0.0385 |
| batch update: 10 random cells | 573,059.37 | 0.0019 | 0.0026 |
| bulk update: replace full grid | 76,437.95 | 0.0179 | 0.0725 |
| read performance: 2500 lenses | 7,212.71 | 0.1390 | 0.1517 |
| read depth 100 lens chain (x100) | 13,641.91 | 0.0734 | 0.0828 |
| update depth 100 lens chain | 153,979.44 | 0.0066 | 0.0090 |

#### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] Toggle Sort | 9,086.51 | 0.1103 | 0.1231 |
| [Atom] Toggle Sort | 9,075.84 | 0.1108 | 0.1331 |
| [Vanilla] Switch Filter | 758,520.01 | 0.0013 | 0.0018 |
| [Atom] Switch Filter | 277,343.63 | 0.0037 | 0.0057 |
| [Vanilla] sort + filter + paginate | 8,569.23 | 0.1171 | 0.1398 |
| [Atom] sort + filter + paginate | 8,309.04 | 0.1244 | 0.3038 |
| [Manual] update single cell (x100) | 31,750.39 | 0.0344 | 0.1064 |
| [Lens] update single cell (x100) | 22,215.10 | 0.0493 | 0.1729 |
| select/deselect rows (Set-based) | 27,716.86 | 0.0382 | 0.1301 |

#### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------------------- | :----------- | :-------- | :------- |
| heavy component lifecycle (mount→update→unmount) | 131,861.04 | 0.0084 | 0.0140 |
| subscription churn (1K cycles) | 80,181.81 | 0.0131 | 0.0676 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 140,214.58 | 0.0078 | 0.0136 |
| 10K entity state tree management | 624,372.65 | 0.0019 | 0.0024 |
| heap monitoring (1000 large atoms) | 6,089.84 | 0.1671 | 0.2670 |

#### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------ | :----------- | :-------- | :------- |
| [Batch] form reset (20 fields) | 652,361.11 | 0.0016 | 0.0019 |
| [Manual] form reset (20 fields) | 1,431,632.91 | 0.0008 | 0.0011 |
| [Batch] state sync (100 atoms) | 27,108.16 | 0.0370 | 0.0434 |
| [Manual] state sync (100 atoms) | 230,838.63 | 0.0044 | 0.0051 |

#### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------------------ | :----------- | :-------- | :------- |
| [Vanilla] filter 1000 items on query change | 136,517.56 | 0.0091 | 0.0193 |
| [Atom] filter 1000 items (Fresh Computed each time) | 18,285.39 | 0.0625 | 0.1628 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 13,760.33 | 0.0733 | 0.0886 |
| [Vanilla] add items → apply coupon → total | 5,847,658.86 | 0.0002 | 0.0003 |
| [Atom] add items → apply coupon → total | 1,878,174.69 | 0.0006 | 0.0008 |
| [Vanilla] update source → recalc all KPIs | 11,903,770.15 | 0.0001 | 0.0001 |
| [Atom] update source → reactive KPI pipeline | 2,582,279.75 | 0.0004 | 0.0005 |

---

### 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] object allocation (baseline) | 218,257.60 | 0.0047 | 0.0076 |
| [Atom] creation + first .value read | 186,738.58 | 0.0056 | 0.0082 |
| [Vanilla] function call (computed baseline) | 216,764.75 | 0.0047 | 0.0055 |
| [Atom] lazy computed creation + first eval | 62,940.59 | 0.0170 | 0.0381 |
| [Atom] eager computed creation + first eval | 65,002.71 | 0.0162 | 0.0318 |
| [Atom] effect creation + first run + dispose | 39,968.80 | 0.0275 | 0.0478 |
| [Vanilla] variable write + read | 218,964.09 | 0.0047 | 0.0071 |
| [Atom] atom write + computed propagation | 45,274.83 | 0.0226 | 0.0365 |
| [Atom] atom read only — warm cache | 248,792.02 | 0.0041 | 0.0050 |
| [Atom] computed read only — warm cache hit | 241,557.07 | 0.0042 | 0.0053 |
| [Cold] new computed each iteration | 60,402.16 | 0.0175 | 0.0303 |
| [Warm] reuse computed — cache hit (source unchanged) | 241,188.88 | 0.0042 | 0.0055 |
| [Warm] reuse computed — cache miss (source changed) | 68,882.44 | 0.0148 | 0.0246 |
| [Cold] effect create + first run + dispose | 47,383.09 | 0.0243 | 0.0409 |
| [Warm] effect repeated trigger (x100) | 325,045.11 | 0.0033 | 0.0056 |
