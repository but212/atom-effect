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
| baseline: plain object creation | 1,156,366.28 | 0.0009 | 0.0009 |
| creation: primitive atom | 907,623.68 | 0.0011 | 0.0015 |
| baseline: nested object creation | 1,110,811.90 | 0.0009 | 0.0010 |
| creation: object atom | 901,293.72 | 0.0011 | 0.0015 |
| baseline: plain object read/write | 6,617,583.13 | 0.0002 | 0.0002 |
| read/write performance: active | 1,204,086.71 | 0.0008 | 0.0012 |
| untracked read: active | 5,292,130.98 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,625,435.08 | 0.0003 | 0.0003 |
| atom.value read | 3,021,022.77 | 0.0003 | 0.0004 |
| atom.peek() read | 3,112,879.27 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,120,466.32 | 0.0009 | 0.0012 |
| creation: flat computed | 364,775.49 | 0.0027 | 0.0058 |
| creation: chained computed (10 levels) | 475,768.57 | 0.0021 | 0.0063 |
| baseline: raw chained function evaluation | 762,928.53 | 0.0013 | 0.0021 |
| recomputation & cache | 375,994.71 | 0.0027 | 0.0031 |
| lazy evaluation overhead | 306,288.15 | 0.0033 | 0.0085 |
| baseline: plain function call | 3,485,977.42 | 0.0003 | 0.0003 |
| computed.value read (active) | 2,763,673.88 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 2,989,104.11 | 0.0003 | 0.0004 |
| creation: async computed | 739,837.07 | 0.0014 | 0.0023 |
| read: resolved value & state | 749,796.03 | 0.0013 | 0.0014 |
| resolution: promise resolving lifecycle | 1,049,990.12 | 0.0010 | 0.0015 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 846,668.52 | 0.0012 | 0.0016 |
| creation & disposal | 233,353.83 | 0.0043 | 0.0063 |
| baseline: raw callback propagation | 699,533.72 | 0.0014 | 0.0015 |
| propagation: atom → computed → effect | 1,145,120.91 | 0.0009 | 0.0011 |
| cleanup execution | 651,049.00 | 0.0015 | 0.0018 |
| baseline: Set add + delete | 832,060.22 | 0.0012 | 0.0026 |
| atom.subscribe + unsubscribe | 1,460,072.65 | 0.0007 | 0.0010 |
| computed.subscribe + unsubscribe | 1,461,004.07 | 0.0007 | 0.0010 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,224,018.05 | 0.0008 | 0.0012 |
| read: lens | 804,661.39 | 0.0012 | 0.0013 |
| read: computed active | 1,197,359.48 | 0.0008 | 0.0009 |
| read: direct object access | 1,186,271.16 | 0.0008 | 0.0009 |
| baseline: raw nested object write | 4,718,752.21 | 0.0002 | 0.0002 |
| write: lens | 226,788.11 | 0.0044 | 0.0051 |
| write: manual spread | 885,063.53 | 0.0011 | 0.0015 |
| composition & scaling (100 active lenses) | 2,365,369.23 | 0.0004 | 0.0006 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 4,923,253.82 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,092,730.55 | 0.0005 | 0.0008 |
| baseline: schedule 10 native microtasks (parallel) | 879,074.06 | 0.0011 | 0.0016 |
| schedule 10 microtasks (parallel) | 620,775.89 | 0.0016 | 0.0020 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,342,239.22 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,541,356.48 | 0.0003 | 0.0003 |
| peek() read — no context | 3,834,272.61 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,326,411.81 | 0.0008 | 0.0010 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 331,931.99 | 0.0030 | 0.0048 |
| batched computed chain update (x10) | 147,889.90 | 0.0068 | 0.0125 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 28,444.59 | 0.0352 | 0.1000 |
| 1 to N propagation (Fan Out 1000) | 11,431.64 | 0.0875 | 0.1310 |
| N to 1 propagation (Fan In 1000) | 97,335.29 | 0.0103 | 0.0302 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 176,445.45 | 0.0057 | 0.0092 |
| isAtom checks | 165,507.53 | 0.0060 | 0.0067 |
| isComputed checks | 161,735.08 | 0.0062 | 0.0104 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 445,331.87 | 0.0022 | 0.0060 |
| diamond pattern (1 → 10 → 10 → 1) | 1,319,719.86 | 0.0008 | 0.0014 |
| pyramid pattern (50 levels) | 543,140.09 | 0.0018 | 0.0037 |
| mixed dependencies (100 atoms → 200 computeds) | 1,015,321.82 | 0.0010 | 0.0012 |
| circular avoidance (x10) | 1,455,279.12 | 0.0007 | 0.0008 |
| conditional dependencies (x10) | 636,539.62 | 0.0016 | 0.0018 |
| array-based selection (x10) | 592,040.73 | 0.0017 | 0.0020 |
| batch update: 10 random cells | 489,958.18 | 0.0020 | 0.0024 |
| bulk update: replace full grid | 80,526.41 | 0.0124 | 0.2668 |
| read performance: 2500 lenses | 4,058.49 | 0.2464 | 0.3869 |
| read depth 100 lens chain (x10) | 108,776.70 | 0.0092 | 0.0145 |
| update depth 100 lens chain | 158,525.57 | 0.0063 | 0.0068 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 6,443.87 | 0.1552 | 0.2101 |
| [Atom] Toggle Sort | 14,899.12 | 0.0671 | 0.1415 |
| [Vanilla] Switch Filter | 562,904.99 | 0.0018 | 0.0020 |
| [Atom] Switch Filter | 405,925.58 | 0.0025 | 0.0050 |
| [Vanilla] sort + filter + paginate | 6,353.28 | 0.1574 | 0.1788 |
| [Atom] sort + filter + paginate | 14,421.83 | 0.0693 | 0.1472 |
| [Manual] update single cell (x10) | 289,031.63 | 0.0035 | 0.0067 |
| [Lens] update single cell (x10) | 199,448.99 | 0.0050 | 0.0093 |
| select/deselect rows (Set-based) | 22,886.77 | 0.0437 | 0.2083 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 76,782.33 | 0.0130 | 0.0241 |
| subscription churn (1K cycles) | 37,319.60 | 0.0268 | 0.0566 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 94,812.28 | 0.0105 | 0.0233 |
| 10K entity state tree management | 633,020.37 | 0.0016 | 0.0020 |
| heap monitoring (1000 large atoms) | 5,329.62 | 0.1876 | 0.4425 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 356,844.62 | 0.0028 | 0.0050 |
| [Manual] form reset (20 fields) | 873,153.51 | 0.0011 | 0.0015 |
| [Batch] state sync (100 atoms) | 97,499.14 | 0.0103 | 0.0205 |
| [Manual] state sync (100 atoms) | 184,603.85 | 0.0054 | 0.0072 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 64,490.39 | 0.0155 | 0.0331 |
| [Atom] filter 1000 items (Fresh Computed each time) | 19,642.50 | 0.0509 | 0.0985 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,686,119.41 | 0.0006 | 0.0009 |
| [Vanilla] add items → apply coupon → total | 2,939,069.61 | 0.0003 | 0.0005 |
| [Atom] add items → apply coupon → total | 1,405,872.58 | 0.0007 | 0.0012 |
| [Vanilla] update source → recalc all KPIs | 6,509,339.08 | 0.0002 | 0.0003 |
| [Atom] update source → reactive KPI pipeline | 3,070,050.08 | 0.0003 | 0.0005 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,172,513.29 | 0.0009 | 0.0011 |
| [Atom] creation + first .value read | 874,153.15 | 0.0011 | 0.0019 |
| [Vanilla] function call (computed baseline) | 1,141,933.15 | 0.0009 | 0.0015 |
| [Atom] lazy computed creation + first eval | 115,222.46 | 0.0087 | 0.0170 |
| [Atom] eager computed creation + first eval | 115,409.36 | 0.0087 | 0.0143 |
| [Atom] effect creation + first run + dispose | 98,537.32 | 0.0101 | 0.0194 |
| [Vanilla] variable write + read | 1,181,438.95 | 0.0008 | 0.0010 |
| [Atom] atom write + computed propagation | 485,909.12 | 0.0021 | 0.0025 |
| [Atom] atom read only — warm cache | 1,300,800.18 | 0.0008 | 0.0013 |
| [Atom] computed read only — warm cache hit | 1,319,025.67 | 0.0008 | 0.0008 |
| [Cold] new computed each iteration | 111,042.85 | 0.0090 | 0.0147 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,307,655.16 | 0.0008 | 0.0012 |
| [Warm] reuse computed — cache miss (source changed) | 826,407.14 | 0.0012 | 0.0020 |
| [Cold] effect create + first run + dispose | 225,756.13 | 0.0044 | 0.0076 |
| [Warm] effect repeated trigger (x100) | 290,317.37 | 0.0034 | 0.0052 |
