# Detailed Benchmark Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect` performance suite. These measurements quantify internal engine throughput and latency across various operational scenarios.

**Last Updated**: 2026-06-20
**Version**: v0.34.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These metrics represent pure engine execution time in isolation. Performance in practical applications will be influenced by external factors, including DOM reconciliation, layout calculations, and browser-specific optimizations.

---

## 1. Micro-Benchmarks

### Atom Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: plain object creation | 1,126,145.07 | 0.0009 | 0.0010 |
| creation: primitive atom | 888,764.91 | 0.0011 | 0.0015 |
| baseline: nested object creation | 1,079,066.42 | 0.0009 | 0.0010 |
| creation: object atom | 880,780.43 | 0.0011 | 0.0015 |
| baseline: plain object read/write | 6,525,415.02 | 0.0002 | 0.0002 |
| read/write performance: active | 1,190,646.31 | 0.0008 | 0.0012 |
| untracked read: active | 5,335,018.35 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,584,768.73 | 0.0003 | 0.0003 |
| atom.value read | 2,990,742.44 | 0.0003 | 0.0004 |
| atom.peek() read | 3,129,188.85 | 0.0003 | 0.0003 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,109,837.96 | 0.0009 | 0.0012 |
| creation: flat computed | 382,611.55 | 0.0026 | 0.0050 |
| creation: chained computed (10 levels) | 496,773.48 | 0.0020 | 0.0028 |
| baseline: raw chained function evaluation | 750,261.57 | 0.0013 | 0.0021 |
| recomputation & cache | 370,039.03 | 0.0027 | 0.0034 |
| lazy evaluation overhead | 338,456.30 | 0.0030 | 0.0048 |
| baseline: plain function call | 3,697,125.83 | 0.0003 | 0.0003 |
| computed.value read (active) | 2,806,105.77 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 3,150,550.76 | 0.0003 | 0.0004 |
| creation: async computed | 677,330.99 | 0.0015 | 0.0021 |
| read: resolved value & state | 758,325.05 | 0.0013 | 0.0014 |
| resolution: promise resolving lifecycle | 999,507.69 | 0.0010 | 0.0016 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 842,946.45 | 0.0012 | 0.0017 |
| creation & disposal | 234,392.83 | 0.0043 | 0.0055 |
| baseline: raw callback propagation | 715,904.20 | 0.0014 | 0.0014 |
| propagation: atom → computed → effect | 1,139,591.98 | 0.0009 | 0.0012 |
| cleanup execution | 642,350.19 | 0.0016 | 0.0018 |
| baseline: Set add + delete | 829,996.17 | 0.0012 | 0.0026 |
| atom.subscribe + unsubscribe | 1,608,215.46 | 0.0006 | 0.0009 |
| computed.subscribe + unsubscribe | 1,610,521.28 | 0.0006 | 0.0009 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,180,980.03 | 0.0008 | 0.0013 |
| read: lens | 791,577.31 | 0.0013 | 0.0013 |
| read: computed active | 1,156,107.44 | 0.0009 | 0.0009 |
| read: direct object access | 1,139,195.72 | 0.0009 | 0.0009 |
| baseline: raw nested object write | 4,694,947.71 | 0.0002 | 0.0002 |
| write: lens | 221,122.87 | 0.0045 | 0.0050 |
| write: manual spread | 837,835.80 | 0.0012 | 0.0015 |
| composition & scaling (100 active lenses) | 2,353,308.23 | 0.0004 | 0.0006 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 4,912,395.82 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,053,689.50 | 0.0005 | 0.0008 |
| baseline: schedule 10 native microtasks (parallel) | 929,842.50 | 0.0011 | 0.0015 |
| schedule 10 microtasks (parallel) | 620,167.02 | 0.0016 | 0.0022 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,368,018.94 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,548,837.75 | 0.0003 | 0.0003 |
| peek() read — no context | 3,905,276.15 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,384,277.18 | 0.0007 | 0.0010 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 364,834.09 | 0.0027 | 0.0045 |
| batched computed chain update (x10) | 152,553.91 | 0.0066 | 0.0102 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 26,922.69 | 0.0371 | 0.1036 |
| 1 to N propagation (Fan Out 1000) | 10,515.86 | 0.0951 | 0.1548 |
| N to 1 propagation (Fan In 1000) | 98,906.87 | 0.0101 | 0.0296 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 176,718.36 | 0.0057 | 0.0095 |
| isAtom checks | 166,061.06 | 0.0060 | 0.0105 |
| isComputed checks | 165,322.51 | 0.0060 | 0.0075 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 224,812.67 | 0.0044 | 0.0094 |
| diamond pattern (1 → 10 → 10 → 1) | 832,017.77 | 0.0012 | 0.0023 |
| pyramid pattern (50 levels) | 328,177.40 | 0.0030 | 0.0078 |
| mixed dependencies (100 atoms → 200 computeds) | 605,501.10 | 0.0017 | 0.0022 |
| circular avoidance (x10) | 876,884.41 | 0.0011 | 0.0014 |
| conditional dependencies (x10) | 400,621.95 | 0.0025 | 0.0031 |
| array-based selection (x10) | 368,338.86 | 0.0027 | 0.0031 |
| batch update: 10 random cells | 286,027.98 | 0.0035 | 0.0057 |
| bulk update: replace full grid | 64,337.13 | 0.0155 | 0.3235 |
| read performance: 2500 lenses | 2,488.61 | 0.4018 | 0.7146 |
| read depth 100 lens chain (x10) | 68,277.36 | 0.0146 | 0.0250 |
| update depth 100 lens chain | 85,987.73 | 0.0116 | 0.0212 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,605.82 | 0.2171 | 0.2404 |
| [Atom] Toggle Sort | 9,319.57 | 0.1073 | 0.2384 |
| [Vanilla] Switch Filter | 399,710.43 | 0.0025 | 0.0032 |
| [Atom] Switch Filter | 254,439.75 | 0.0039 | 0.0079 |
| [Vanilla] sort + filter + paginate | 4,349.37 | 0.2299 | 0.2620 |
| [Atom] sort + filter + paginate | 8,796.36 | 0.1137 | 0.2488 |
| [Manual] update single cell (x10) | 196,705.08 | 0.0051 | 0.0128 |
| [Lens] update single cell (x10) | 126,373.60 | 0.0079 | 0.0207 |
| select/deselect rows (Set-based) | 15,193.70 | 0.0658 | 0.2614 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 86,887.24 | 0.0115 | 0.0219 |
| subscription churn (1K cycles) | 23,295.50 | 0.0429 | 0.0874 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 61,765.98 | 0.0162 | 0.0278 |
| 10K entity state tree management | 373,600.47 | 0.0027 | 0.0049 |
| heap monitoring (1000 large atoms) | 2,871.16 | 0.3483 | 0.7310 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 351,969.27 | 0.0028 | 0.0051 |
| [Manual] form reset (20 fields) | 875,422.77 | 0.0011 | 0.0016 |
| [Batch] state sync (100 atoms) | 92,896.51 | 0.0108 | 0.0210 |
| [Manual] state sync (100 atoms) | 184,442.36 | 0.0054 | 0.0088 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 64,115.81 | 0.0156 | 0.0326 |
| [Atom] filter 1000 items (Fresh Computed each time) | 19,737.27 | 0.0507 | 0.0821 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,740,485.82 | 0.0006 | 0.0009 |
| [Vanilla] add items → apply coupon → total | 2,859,639.34 | 0.0003 | 0.0005 |
| [Atom] add items → apply coupon → total | 1,458,165.02 | 0.0007 | 0.0009 |
| [Vanilla] update source → recalc all KPIs | 6,835,323.13 | 0.0001 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 3,094,928.00 | 0.0003 | 0.0005 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,238,617.44 | 0.0008 | 0.0014 |
| [Atom] creation + first .value read | 773,983.46 | 0.0013 | 0.0021 |
| [Vanilla] function call (computed baseline) | 1,252,214.26 | 0.0008 | 0.0013 |
| [Atom] lazy computed creation + first eval | 289,871.46 | 0.0034 | 0.0061 |
| [Atom] eager computed creation + first eval | 289,482.72 | 0.0035 | 0.0046 |
| [Atom] effect creation + first run + dispose | 182,573.22 | 0.0055 | 0.0102 |
| [Vanilla] variable write + read | 1,296,611.61 | 0.0008 | 0.0011 |
| [Atom] atom write + computed propagation | 493,925.46 | 0.0020 | 0.0025 |
| [Atom] atom read only — warm cache | 1,512,186.79 | 0.0007 | 0.0009 |
| [Atom] computed read only — warm cache hit | 1,456,474.46 | 0.0007 | 0.0011 |
| [Cold] new computed each iteration | 347,768.91 | 0.0029 | 0.0039 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,451,511.28 | 0.0007 | 0.0013 |
| [Warm] reuse computed — cache miss (source changed) | 858,433.24 | 0.0012 | 0.0017 |
| [Cold] effect create + first run + dispose | 203,782.14 | 0.0049 | 0.0068 |
| [Warm] effect repeated trigger (x100) | 287,151.44 | 0.0035 | 0.0058 |
