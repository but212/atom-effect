# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-12
**Version**: v0.33.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: plain object creation | 1,567,501.07 | 0.0006 | 0.0009 |
| creation: primitive atom | 1,181,411.74 | 0.0008 | 0.0012 |
| baseline: nested object creation | 1,446,322.91 | 0.0007 | 0.0011 |
| creation: object atom | 1,173,604.90 | 0.0009 | 0.0013 |
| baseline: plain object read/write | 8,172,466.44 | 0.0001 | 0.0002 |
| read/write performance: active | 1,642,608.62 | 0.0006 | 0.0010 |
| untracked read: active | 6,643,937.97 | 0.0002 | 0.0002 |
| baseline: plain object property read | 4,575,219.19 | 0.0002 | 0.0003 |
| atom.value read | 3,787,762.02 | 0.0003 | 0.0004 |
| atom.peek() read | 3,913,496.70 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,415,436.62 | 0.0007 | 0.0011 |
| creation: flat computed | 443,813.14 | 0.0023 | 0.0068 |
| creation: chained computed (10 levels) | 521,880.27 | 0.0019 | 0.0059 |
| baseline: raw chained function evaluation | 956,981.05 | 0.0010 | 0.0017 |
| recomputation & cache | 467,822.37 | 0.0021 | 0.0036 |
| lazy evaluation overhead | 360,305.30 | 0.0028 | 0.0080 |
| baseline: plain function call | 4,501,955.06 | 0.0002 | 0.0003 |
| computed.value read (active) | 3,526,619.16 | 0.0003 | 0.0003 |
| computed.peek() read (active) | 3,906,565.58 | 0.0003 | 0.0003 |
| creation: async computed | 827,608.17 | 0.0012 | 0.0020 |
| read: resolved value & state | 953,545.48 | 0.0010 | 0.0012 |
| resolution: promise resolving lifecycle | 1,371,208.97 | 0.0007 | 0.0012 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 1,165,170.35 | 0.0009 | 0.0012 |
| creation & disposal | 324,942.60 | 0.0031 | 0.0052 |
| baseline: raw callback propagation | 879,148.23 | 0.0011 | 0.0013 |
| propagation: atom → computed → effect | 1,548,539.27 | 0.0006 | 0.0012 |
| cleanup execution | 841,694.67 | 0.0012 | 0.0017 |
| baseline: Set add + delete | 1,050,165.14 | 0.0010 | 0.0032 |
| atom.subscribe + unsubscribe | 1,896,562.18 | 0.0005 | 0.0008 |
| computed.subscribe + unsubscribe | 1,933,642.65 | 0.0005 | 0.0009 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,621,685.98 | 0.0006 | 0.0009 |
| read: lens | 1,128,292.03 | 0.0009 | 0.0012 |
| read: computed active | 1,541,155.27 | 0.0006 | 0.0009 |
| read: direct object access | 1,540,185.14 | 0.0006 | 0.0008 |
| baseline: raw nested object write | 6,019,776.29 | 0.0002 | 0.0002 |
| write: lens | 302,997.52 | 0.0033 | 0.0048 |
| write: manual spread | 1,156,934.80 | 0.0009 | 0.0013 |
| composition & scaling (100 active lenses) | 3,234,548.94 | 0.0003 | 0.0006 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 6,111,241.82 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,633,292.30 | 0.0004 | 0.0007 |
| baseline: schedule 10 native microtasks (parallel) | 1,189,817.67 | 0.0008 | 0.0013 |
| schedule 10 microtasks (parallel) | 779,157.24 | 0.0013 | 0.0018 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 3,375,936.58 | 0.0003 | 0.0005 |
| untracked(() => read) | 4,459,213.80 | 0.0002 | 0.0003 |
| peek() read — no context | 4,985,420.85 | 0.0002 | 0.0002 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,837,493.64 | 0.0005 | 0.0009 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 481,442.81 | 0.0021 | 0.0039 |
| batched computed chain update (x10) | 230,261.66 | 0.0043 | 0.0089 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 30,690.71 | 0.0326 | 0.0773 |
| 1 to N propagation (Fan Out 1000) | 14,681.72 | 0.0681 | 0.0966 |
| N to 1 propagation (Fan In 1000) | 121,250.65 | 0.0082 | 0.0184 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 223,669.67 | 0.0045 | 0.0087 |
| isAtom checks | 237,432.29 | 0.0042 | 0.0047 |
| isComputed checks | 236,147.65 | 0.0042 | 0.0048 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 251,863.47 | 0.0040 | 0.0084 |
| diamond pattern (1 → 10 → 10 → 1) | 879,535.50 | 0.0011 | 0.0023 |
| pyramid pattern (50 levels) | 338,737.41 | 0.0030 | 0.0078 |
| mixed dependencies (100 atoms → 200 computeds) | 582,422.08 | 0.0017 | 0.0022 |
| circular avoidance (x10) | 861,538.69 | 0.0012 | 0.0017 |
| conditional dependencies (x10) | 401,211.19 | 0.0025 | 0.0030 |
| array-based selection (x10) | 390,195.14 | 0.0026 | 0.0031 |
| batch update: 10 random cells | 442,679.01 | 0.0023 | 0.0055 |
| bulk update: replace full grid | 46,223.93 | 0.0216 | 0.2816 |
| read performance: 2500 lenses | 4,283.84 | 0.2334 | 0.3881 |
| read depth 100 lens chain (x10) | 93,735.46 | 0.0107 | 0.0186 |
| update depth 100 lens chain | 81,024.40 | 0.0123 | 0.0210 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 5,316.96 | 0.1881 | 0.2356 |
| [Atom] Toggle Sort | 10,648.15 | 0.0939 | 0.2110 |
| [Vanilla] Switch Filter | 337,183.11 | 0.0030 | 0.0037 |
| [Atom] Switch Filter | 246,827.23 | 0.0041 | 0.0084 |
| [Vanilla] sort + filter + paginate | 4,803.55 | 0.2082 | 0.3898 |
| [Atom] sort + filter + paginate | 10,086.86 | 0.0991 | 0.2236 |
| [Manual] update single cell (x10) | 160,026.76 | 0.0062 | 0.0169 |
| [Lens] update single cell (x10) | 124,808.39 | 0.0080 | 0.0192 |
| select/deselect rows (Set-based) | 15,571.76 | 0.0642 | 0.3201 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 73,294.32 | 0.0136 | 0.0284 |
| subscription churn (1K cycles) | 21,979.34 | 0.0455 | 0.0868 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 59,892.10 | 0.0167 | 0.0275 |
| 10K entity state tree management | 329,214.80 | 0.0030 | 0.0070 |
| heap monitoring (1000 large atoms) | 3,136.26 | 0.3189 | 0.6535 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 343,372.33 | 0.0029 | 0.0053 |
| [Manual] form reset (20 fields) | 847,002.10 | 0.0012 | 0.0016 |
| [Batch] state sync (100 atoms) | 97,970.41 | 0.0102 | 0.0213 |
| [Manual] state sync (100 atoms) | 166,727.28 | 0.0060 | 0.0107 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 64,138.31 | 0.0156 | 0.0373 |
| [Atom] filter 1000 items (Fresh Computed each time) | 18,355.81 | 0.0545 | 0.1070 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,414,032.86 | 0.0007 | 0.0012 |
| [Vanilla] add items → apply coupon → total | 2,557,877.86 | 0.0004 | 0.0011 |
| [Atom] add items → apply coupon → total | 1,451,275.96 | 0.0007 | 0.0010 |
| [Vanilla] update source → recalc all KPIs | 6,316,939.23 | 0.0002 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 3,065,807.26 | 0.0003 | 0.0006 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 6,678,612.74 | 0.0001 | 0.0003 |
| [Atom] creation + first .value read | 5,306,009.06 | 0.0002 | 0.0003 |
| [Vanilla] function call (computed baseline) | 6,595,242.48 | 0.0002 | 0.0003 |
| [Atom] lazy computed creation + first eval | 1,022,441.19 | 0.0010 | 0.0022 |
| [Atom] eager computed creation + first eval | 2,250,208.86 | 0.0004 | 0.0007 |
| [Atom] effect creation + first run + dispose | 1,509,355.59 | 0.0007 | 0.0010 |
| [Vanilla] variable write + read | 6,597,388.57 | 0.0002 | 0.0003 |
| [Atom] atom write + computed propagation | 2,284,568.33 | 0.0004 | 0.0005 |
| [Atom] atom read only — warm cache | 7,235,553.73 | 0.0001 | 0.0002 |
| [Atom] computed read only — warm cache hit | 7,415,545.37 | 0.0001 | 0.0002 |
| [Cold] new computed each iteration | 2,500,719.31 | 0.0004 | 0.0006 |
| [Warm] reuse computed — cache hit (source unchanged) | 7,434,957.27 | 0.0001 | 0.0002 |
| [Warm] reuse computed — cache miss (source changed) | 2,981,211.85 | 0.0003 | 0.0005 |
| [Cold] effect create + first run + dispose | 1,727,496.17 | 0.0006 | 0.0008 |
| [Warm] effect repeated trigger (x100) | 287,150.97 | 0.0035 | 0.0038 |
