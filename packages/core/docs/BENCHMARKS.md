# Benchmark Documentation

This document outlines the benchmarking suite for `@but212/atom-effect`. The suite is used to quantify performance characteristics and monitor the system for potential regressions.

## Performance Metrics Summary

The following table summarizes key performance metrics observed in version `0.34.0`.

| Category | Metric | Result | Context |
| :--- | :--- | :--- | :--- |
| **Atom** | Read (untracked) | 1.81M ops/sec | Performance of non-reactive reads (x100) |
| **Computed** | Recompute (cached) | 9.6K ops/sec | Cached re-evaluation performance (x100) |
| **Effect** | Propagation | 247.0K ops/sec | Full atom → computed → effect cycle (x100) |
| **Workflow** | Todo App | 177.6K ops/sec | Comprehensive workflow performance |
| **Latency** | 100 Atom updates | 0.0608 ms | Mean execution time for batched updates |

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

| Metric | Nominal Range | Rationale |
| :--- | :--- | :--- |
| **Atom reads (peek)** | > 500K ops/sec | Indicates minimal overhead for non-reactive state access. |
| **Computed recompute** | > 1M ops/sec | Indicates efficient cache validation and re-use. |
| **Effect execution** | > 1M ops/sec | Ensures rapid propagation across the dependency graph. |
| **Batch Latency** | < 16ms | Ensures compliance with browser rendering cycles. |

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
| :--- | :--- | :--- | :--- |
| baseline: plain object creation | 218,880.14 | 0.0047 | 0.0065 |
| creation: primitive atom | 183,344.56 | 0.0057 | 0.0077 |
| baseline: nested object creation | 218,363.87 | 0.0046 | 0.0052 |
| creation: object atom | 180,317.98 | 0.0058 | 0.0078 |
| baseline: plain object read/write | 5,094,078.89 | 0.0002 | 0.0003 |
| read/write performance: active | 212,769.64 | 0.0050 | 0.0080 |
| untracked read: active | 1,806,829.90 | 0.0006 | 0.0007 |
| baseline: plain object property read | 1,874,419.26 | 0.0005 | 0.0006 |
| atom.value read | 1,535,828.03 | 0.0007 | 0.0007 |
| atom.peek() read | 1,866,325.33 | 0.0005 | 0.0006 |

#### Computed Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 201,375.66 | 0.0052 | 0.0101 |
| creation: flat computed | 78,120.54 | 0.0136 | 0.0237 |
| creation: chained computed (10 levels) | 665,373.01 | 0.0016 | 0.0021 |
| baseline: raw chained function evaluation | 123,411.93 | 0.0082 | 0.0106 |
| recomputation & cache | 9,579.03 | 0.1065 | 0.1814 |
| lazy evaluation overhead | 67,500.88 | 0.0159 | 0.0327 |
| baseline: plain function call | 1,880,438.83 | 0.0005 | 0.0006 |
| computed.value read (active) | 1,172,005.65 | 0.0009 | 0.0009 |
| computed.peek() read (active) | 1,880,257.68 | 0.0005 | 0.0006 |
| creation: async computed | 145,813.79 | 0.0074 | 0.0136 |
| read: resolved value & state | 120,180.82 | 0.0084 | 0.0110 |
| resolution: promise resolving lifecycle | 68,223.13 | 0.0149 | 0.0219 |

#### Effect Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 156,545.64 | 0.0067 | 0.0109 |
| creation & disposal | 42,516.44 | 0.0272 | 0.0392 |
| baseline: raw callback propagation | 107,736.22 | 0.0093 | 0.0152 |
| propagation: atom → computed → effect | 247,042.71 | 0.0043 | 0.0075 |
| cleanup execution | 227,477.89 | 0.0047 | 0.0057 |
| baseline: Set add + delete | 163,214.27 | 0.0072 | 0.0182 |
| atom.subscribe + unsubscribe | 315,622.84 | 0.0033 | 0.0040 |
| computed.subscribe + unsubscribe | 314,200.83 | 0.0033 | 0.0040 |

#### Lenses (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 232,510.90 | 0.0043 | 0.0059 |
| read: lens | 139,749.97 | 0.0072 | 0.0122 |
| read: computed active | 231,720.00 | 0.0043 | 0.0053 |
| read: direct object access | 231,808.41 | 0.0043 | 0.0048 |
| baseline: raw nested object write | 1,932,873.67 | 0.0005 | 0.0006 |
| write: lens | 35,343.23 | 0.0299 | 0.0783 |
| write: manual spread | 236,343.30 | 0.0045 | 0.0062 |
| composition & scaling (100 active lenses) | 1,707,822.99 | 0.0006 | 0.0009 |

---

### 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

#### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 6,390,784.70 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,686,719.35 | 0.0004 | 0.0007 |
| baseline: schedule 100 native microtasks (parallel) | 698,208.18 | 0.0015 | 0.0021 |
| schedule 100 microtasks (parallel) | 438,347.33 | 0.0024 | 0.0032 |

#### Untracked Context (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 1,605,838.35 | 0.0006 | 0.0009 |
| untracked(() => read) | 3,424,461.75 | 0.0003 | 0.0005 |
| peek() read — no context | 8,221,629.74 | 0.0001 | 0.0001 |

#### Batch Nesting (100 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 100 writes | 1,221,129.62 | 0.0009 | 0.0013 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 100 atoms: active (x100) | 291,129.59 | 0.0036 | 0.0058 |
| batched computed chain update (x100) | 25,826.93 | 0.0396 | 0.0634 |

---

### 3. Propagation and Topology

#### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 8,028.30 | 0.1279 | 0.3876 |
| 1 to N propagation (Fan Out 1000) | 7,499.61 | 0.1358 | 0.3506 |
| N to 1 propagation (Fan In 1000) | 41,236.36 | 0.0243 | 0.0315 |

---

### 4. Type Guards (x800)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 27,653.69 | 0.0365 | 0.0452 |
| isAtom checks | 25,687.23 | 0.0393 | 0.0478 |
| isComputed checks | 25,454.90 | 0.0401 | 0.0676 |

---

### 5. Macro and Realistic Workflows

#### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 86,669.00 | 0.0119 | 0.0202 |
| diamond pattern (1 → 10 → 10 → 1) | 363,009.47 | 0.0029 | 0.0037 |
| pyramid pattern (50 levels) | 139,813.05 | 0.0074 | 0.0110 |
| mixed dependencies (100 atoms → 200 computeds) | 583,305.66 | 0.0017 | 0.0021 |
| circular avoidance (x100) | 23,678.11 | 0.0440 | 0.0571 |
| conditional dependencies (x100) | 17,787.85 | 0.0576 | 0.0764 |
| array-based selection (x100) | 16,431.16 | 0.0625 | 0.0815 |
| batch update: 10 random cells | 391,327.90 | 0.0027 | 0.0036 |
| bulk update: replace full grid | 78,595.06 | 0.0150 | 0.0307 |
| read performance: 2500 lenses | 5,867.67 | 0.1713 | 0.1959 |
| read depth 100 lens chain (x100) | 9,100.38 | 0.1102 | 0.1251 |
| update depth 100 lens chain | 107,150.55 | 0.0094 | 0.0161 |

#### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 6,687.11 | 0.1503 | 0.1823 |
| [Atom] Toggle Sort | 6,403.35 | 0.1573 | 0.1919 |
| [Vanilla] Switch Filter | 554,439.43 | 0.0018 | 0.0024 |
| [Atom] Switch Filter | 162,331.45 | 0.0063 | 0.0084 |
| [Vanilla] sort + filter + paginate | 6,386.64 | 0.1576 | 0.1862 |
| [Atom] sort + filter + paginate | 6,053.40 | 0.1666 | 0.2036 |
| [Manual] update single cell (x100) | 20,630.03 | 0.0537 | 0.1871 |
| [Lens] update single cell (x100) | 14,930.87 | 0.0720 | 0.2117 |
| select/deselect rows (Set-based) | 21,885.72 | 0.0498 | 0.2196 |

#### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 76,865.31 | 0.0158 | 0.0369 |
| subscription churn (1K cycles) | 31,941.04 | 0.0323 | 0.0594 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 85,342.24 | 0.0128 | 0.0214 |
| 10K entity state tree management | 384,768.76 | 0.0030 | 0.0038 |
| heap monitoring (1000 large atoms) | 4,011.65 | 0.2604 | 0.5463 |

#### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 350,504.92 | 0.0030 | 0.0066 |
| [Manual] form reset (20 fields) | 821,471.19 | 0.0013 | 0.0019 |
| [Batch] state sync (100 atoms) | 16,665.73 | 0.0608 | 0.1126 |
| [Manual] state sync (100 atoms) | 157,516.49 | 0.0064 | 0.0119 |

#### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 103,195.14 | 0.0144 | 0.0327 |
| [Atom] filter 1000 items (Fresh Computed each time) | 13,898.81 | 0.0796 | 0.1642 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 13,834.92 | 0.0737 | 0.1010 |
| [Vanilla] add items → apply coupon → total | 3,246,326.50 | 0.0003 | 0.0004 |
| [Atom] add items → apply coupon → total | 915,665.67 | 0.0012 | 0.0016 |
| [Vanilla] update source → recalc all KPIs | 7,785,248.20 | 0.0001 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 1,182,081.20 | 0.0009 | 0.0011 |

---

### 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 211,986.17 | 0.0049 | 0.0077 |
| [Atom] creation + first .value read | 177,517.83 | 0.0059 | 0.0089 |
| [Vanilla] function call (computed baseline) | 210,815.34 | 0.0048 | 0.0066 |
| [Atom] lazy computed creation + first eval | 66,992.44 | 0.0160 | 0.0274 |
| [Atom] eager computed creation + first eval | 66,858.84 | 0.0159 | 0.0277 |
| [Atom] effect creation + first run + dispose | 35,484.20 | 0.0317 | 0.3295 |
| [Vanilla] variable write + read | 213,934.71 | 0.0048 | 0.0055 |
| [Atom] atom write + computed propagation | 39,239.50 | 0.0261 | 0.0432 |
| [Atom] atom read only — warm cache | 242,567.53 | 0.0042 | 0.0046 |
| [Atom] computed read only — warm cache hit | 242,461.58 | 0.0042 | 0.0047 |
| [Cold] new computed each iteration | 64,498.29 | 0.0164 | 0.0266 |
| [Warm] reuse computed — cache hit (source unchanged) | 243,184.68 | 0.0042 | 0.0058 |
| [Warm] reuse computed — cache miss (source changed) | 61,228.81 | 0.0169 | 0.0259 |
| [Cold] effect create + first run + dispose | 36,326.85 | 0.0317 | 0.0596 |
| [Warm] effect repeated trigger (x100) | 337,617.99 | 0.0031 | 0.0037 |
