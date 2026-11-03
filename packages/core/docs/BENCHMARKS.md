# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

| Category | Metric | Result | Context |
| :----------- | :----------------- | :------------- | :----------------------------------------- |
| **Atom** | Read (untracked) | 1.77M ops/sec | Performance of non-reactive reads (x100) |
| **Computed** | Recompute (cached) | 10.7K ops/sec | Cached re-evaluation performance (x100) |
| **Effect** | Propagation | 232.1K ops/sec | Full atom → computed → effect cycle (x100) |
| **Workflow** | Todo App | 150.9K ops/sec | Comprehensive workflow performance |
| **Latency** | 100 Atom updates | 0.0756 ms | Mean execution time for batched updates |

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
| baseline: plain object creation | 224,295.85 | 0.0046 | 0.0067 |
| creation: primitive atom | 188,749.35 | 0.0055 | 0.0076 |
| baseline: nested object creation | 223,863.38 | 0.0045 | 0.0052 |
| creation: object atom | 183,795.82 | 0.0057 | 0.0082 |
| baseline: plain object read/write | 4,905,446.34 | 0.0002 | 0.0003 |
| read/write performance: active | 212,173.56 | 0.0052 | 0.0077 |
| untracked read: active | 1,774,594.08 | 0.0006 | 0.0008 |
| baseline: plain object property read | 1,863,653.75 | 0.0005 | 0.0006 |
| atom.value read | 1,628,790.09 | 0.0006 | 0.0010 |
| atom.peek() read | 1,860,261.95 | 0.0005 | 0.0007 |

#### Computed Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw function creation | 204,483.11 | 0.0052 | 0.0110 |
| creation: flat computed | 76,847.29 | 0.0141 | 0.0419 |
| creation: chained computed (10 levels) | 705,903.62 | 0.0015 | 0.0023 |
| baseline: raw chained function evaluation | 127,746.60 | 0.0079 | 0.0108 |
| recomputation & cache | 10,721.47 | 0.0953 | 0.2005 |
| lazy evaluation overhead | 66,809.86 | 0.0158 | 0.0323 |
| baseline: plain function call | 1,873,050.27 | 0.0005 | 0.0006 |
| computed.value read (active) | 1,196,461.12 | 0.0008 | 0.0009 |
| computed.peek() read (active) | 1,815,230.19 | 0.0006 | 0.0010 |
| creation: async computed | 128,973.06 | 0.0084 | 0.0163 |
| read: resolved value & state | 124,465.79 | 0.0082 | 0.0144 |
| resolution: promise resolving lifecycle | 80,517.16 | 0.0127 | 0.0199 |

#### Effect Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------ | :----------- | :-------- | :------- |
| baseline: listener registration and removal | 161,795.32 | 0.0065 | 0.0135 |
| creation & disposal | 48,407.24 | 0.0241 | 0.0371 |
| baseline: raw callback propagation | 108,361.04 | 0.0093 | 0.0154 |
| propagation: atom → computed → effect | 232,147.16 | 0.0045 | 0.0067 |
| cleanup execution | 230,691.47 | 0.0048 | 0.0075 |
| baseline: Set add + delete | 164,889.24 | 0.0073 | 0.0197 |
| atom.subscribe + unsubscribe | 342,504.54 | 0.0032 | 0.0052 |
| computed.subscribe + unsubscribe | 416,155.15 | 0.0026 | 0.0035 |

#### Lenses (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------------------------- | :----------- | :-------- | :------- |
| baseline: raw nested object read | 238,537.15 | 0.0042 | 0.0058 |
| read: lens | 145,695.32 | 0.0070 | 0.0136 |
| read: computed active | 238,851.80 | 0.0042 | 0.0047 |
| read: direct object access | 238,810.70 | 0.0042 | 0.0054 |
| baseline: raw nested object write | 1,905,426.29 | 0.0005 | 0.0010 |
| write: lens | 35,243.58 | 0.0294 | 0.0374 |
| write: manual spread | 223,045.13 | 0.0048 | 0.0058 |
| composition & scaling (100 active lenses) | 1,382,951.34 | 0.0007 | 0.0011 |

---

### 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

#### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------------------------- | :----------- | :-------- | :------- |
| baseline: schedule 1 native microtask | 4,999,643.45 | 0.0002 | 0.0004 |
| schedule 1 microtask | 2,266,382.17 | 0.0005 | 0.0008 |
| baseline: schedule 100 native microtasks (parallel) | 202,969.75 | 0.0052 | 0.0110 |
| schedule 100 microtasks (parallel) | 188,002.82 | 0.0056 | 0.0092 |

#### Untracked Context (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------- | :----------- | :-------- | :------- |
| tracked read inside computed | 1,990,833.75 | 0.0005 | 0.0007 |
| untracked(() => read) | 3,742,423.10 | 0.0003 | 0.0004 |
| peek() read — no context | 7,812,486.71 | 0.0001 | 0.0002 |

#### Batch Nesting (100 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------ | :----------- | :-------- | :------- |
| unbatched 100 writes | 210,395.88 | 0.0050 | 0.0110 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 100 atoms: active (x100) | 52,268.06 | 0.0195 | 0.0302 |
| batched computed chain update (x100) | 27,937.98 | 0.0364 | 0.0544 |

---

### 3. Propagation and Topology

#### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :-------------------------------- | :----------- | :-------- | :------- |
| 1 to 1 propagation (Depth 1000) | 9,892.76 | 0.1027 | 0.1423 |
| 1 to N propagation (Fan Out 1000) | 8,657.67 | 0.1167 | 0.2405 |
| N to 1 propagation (Fan In 1000) | 863.00 | 1.1593 | 1.2305 |

---

### 4. Type Guards (x800)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| baseline: basic property check | 28,452.25 | 0.0355 | 0.0466 |
| isAtom checks | 27,471.37 | 0.0367 | 0.0452 |
| isComputed checks | 27,442.86 | 0.0368 | 0.0468 |

---

### 5. Macro and Realistic Workflows

#### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------- | :----------- | :-------- | :------- |
| deep chain (100 levels) | 86,714.07 | 0.0117 | 0.0225 |
| diamond pattern (1 → 10 → 10 → 1) | 367,879.68 | 0.0028 | 0.0044 |
| pyramid pattern (50 levels) | 142,419.04 | 0.0072 | 0.0109 |
| mixed dependencies (100 atoms → 200 computeds) | 742,993.76 | 0.0014 | 0.0016 |
| circular avoidance (x100) | 21,682.39 | 0.0467 | 0.0594 |
| conditional dependencies (x100) | 15,697.82 | 0.0729 | 0.1175 |
| array-based selection (x100) | 15,639.27 | 0.0735 | 0.1479 |
| batch update: 10 random cells | 308,257.88 | 0.0034 | 0.0049 |
| bulk update: replace full grid | 55,842.31 | 0.0267 | 0.1474 |
| read performance: 2500 lenses | 4,300.78 | 0.2332 | 0.2587 |
| read depth 100 lens chain (x100) | 7,383.43 | 0.1357 | 0.1574 |
| update depth 100 lens chain | 80,895.66 | 0.0125 | 0.0221 |

#### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] Toggle Sort | 4,527.93 | 0.2236 | 0.3036 |
| [Atom] Toggle Sort | 4,467.25 | 0.2273 | 0.3919 |
| [Vanilla] Switch Filter | 524,459.19 | 0.0019 | 0.0026 |
| [Atom] Switch Filter | 161,536.29 | 0.0063 | 0.0108 |
| [Vanilla] sort + filter + paginate | 4,373.50 | 0.2295 | 0.2603 |
| [Atom] sort + filter + paginate | 4,356.48 | 0.2302 | 0.2605 |
| [Manual] update single cell (x100) | 21,992.45 | 0.0511 | 0.1873 |
| [Lens] update single cell (x100) | 12,896.96 | 0.0826 | 0.2235 |
| select/deselect rows (Set-based) | 16,159.36 | 0.0657 | 0.2278 |

#### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------------------------- | :----------- | :-------- | :------- |
| heavy component lifecycle (mount→update→unmount) | 69,201.25 | 0.0244 | 0.0439 |
| subscription churn (1K cycles) | 42,502.94 | 0.0247 | 0.1272 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 87,486.71 | 0.0125 | 0.0234 |
| 10K entity state tree management | 437,954.83 | 0.0032 | 0.0049 |
| heap monitoring (1000 large atoms) | 3,319.52 | 0.3076 | 0.5181 |

#### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------ | :----------- | :-------- | :------- |
| [Batch] form reset (20 fields) | 308,273.18 | 0.0040 | 0.0084 |
| [Manual] form reset (20 fields) | 742,971.63 | 0.0018 | 0.0043 |
| [Batch] state sync (100 atoms) | 13,320.50 | 0.0756 | 0.0973 |
| [Manual] state sync (100 atoms) | 126,746.65 | 0.0081 | 0.0157 |

#### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------------------------------------ | :----------- | :-------- | :------- |
| [Vanilla] filter 1000 items on query change | 100,504.34 | 0.0146 | 0.0328 |
| [Atom] filter 1000 items (Fresh Computed each time) | 11,591.62 | 0.0937 | 0.1419 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 9,317.80 | 0.1086 | 0.1370 |
| [Vanilla] add items → apply coupon → total | 3,189,482.55 | 0.0003 | 0.0009 |
| [Atom] add items → apply coupon → total | 1,060,627.50 | 0.0010 | 0.0013 |
| [Vanilla] update source → recalc all KPIs | 7,801,682.36 | 0.0001 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 1,360,158.50 | 0.0008 | 0.0012 |

---

### 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--------------------------------------------------- | :----------- | :-------- | :------- |
| [Vanilla] object allocation (baseline) | 167,773.41 | 0.0062 | 0.0114 |
| [Atom] creation + first .value read | 141,981.55 | 0.0074 | 0.0175 |
| [Vanilla] function call (computed baseline) | 165,474.53 | 0.0062 | 0.0097 |
| [Atom] lazy computed creation + first eval | 47,155.39 | 0.0224 | 0.0429 |
| [Atom] eager computed creation + first eval | 47,481.99 | 0.0220 | 0.0415 |
| [Atom] effect creation + first run + dispose | 30,603.08 | 0.0358 | 0.0747 |
| [Vanilla] variable write + read | 168,771.91 | 0.0061 | 0.0084 |
| [Atom] atom write + computed propagation | 34,739.62 | 0.0295 | 0.0496 |
| [Atom] atom read only — warm cache | 191,208.22 | 0.0053 | 0.0061 |
| [Atom] computed read only — warm cache hit | 186,411.44 | 0.0054 | 0.0063 |
| [Cold] new computed each iteration | 50,519.44 | 0.0208 | 0.0392 |
| [Warm] reuse computed — cache hit (source unchanged) | 186,726.67 | 0.0054 | 0.0066 |
| [Warm] reuse computed — cache miss (source changed) | 52,704.95 | 0.0194 | 0.0300 |
| [Cold] effect create + first run + dispose | 36,562.72 | 0.0309 | 0.0493 |
| [Warm] effect repeated trigger (x100) | 252,710.05 | 0.0041 | 0.0051 |
