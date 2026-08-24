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
| baseline: plain object creation | 1,162,297.15 | 0.0009 | 0.0013 |
| creation: primitive atom | 881,699.25 | 0.0011 | 0.0016 |
| baseline: nested object creation | 1,070,855.38 | 0.0009 | 0.0011 |
| creation: object atom | 873,042.87 | 0.0011 | 0.0015 |
| baseline: plain object read/write | 6,520,336.39 | 0.0002 | 0.0002 |
| read/write performance: active | 1,185,560.19 | 0.0008 | 0.0015 |
| untracked read: active | 4,924,086.97 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,520,980.70 | 0.0003 | 0.0003 |
| atom.value read | 2,946,959.11 | 0.0003 | 0.0004 |
| atom.peek() read | 3,055,273.82 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,036,375.27 | 0.0010 | 0.0014 |
| creation: flat computed | 314,789.86 | 0.0032 | 0.0058 |
| creation: chained computed (10 levels) | 433,819.09 | 0.0023 | 0.0065 |
| baseline: raw chained function evaluation | 727,233.12 | 0.0014 | 0.0021 |
| recomputation & cache | 368,490.91 | 0.0027 | 0.0033 |
| lazy evaluation overhead | 305,074.96 | 0.0033 | 0.0085 |
| baseline: plain function call | 3,472,721.53 | 0.0003 | 0.0004 |
| computed.value read (active) | 2,658,129.59 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 3,020,551.27 | 0.0003 | 0.0004 |
| creation: async computed | 597,662.38 | 0.0017 | 0.0038 |
| read: resolved value & state | 721,767.88 | 0.0014 | 0.0016 |
| resolution: promise resolving lifecycle | 71,512.17 | 0.0140 | 0.0228 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 995,552.83 | 0.0010 | 0.0015 |
| creation & disposal | 235,878.95 | 0.0042 | 0.0060 |
| baseline: raw callback propagation | 687,983.22 | 0.0015 | 0.0016 |
| propagation: atom → computed → effect | 1,173,301.23 | 0.0009 | 0.0012 |
| cleanup execution | 616,157.27 | 0.0016 | 0.0020 |
| baseline: Set add + delete | 943,418.22 | 0.0011 | 0.0025 |
| atom.subscribe + unsubscribe | 1,492,887.87 | 0.0007 | 0.0010 |
| computed.subscribe + unsubscribe | 1,478,012.54 | 0.0007 | 0.0011 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,297,797.35 | 0.0008 | 0.0008 |
| read: lens | 770,691.85 | 0.0013 | 0.0014 |
| read: computed active | 1,215,920.83 | 0.0008 | 0.0009 |
| read: direct object access | 1,242,091.16 | 0.0008 | 0.0009 |
| baseline: raw nested object write | 4,684,309.04 | 0.0002 | 0.0002 |
| write: lens | 236,066.83 | 0.0042 | 0.0054 |
| write: manual spread | 869,097.46 | 0.0012 | 0.0017 |
| composition & scaling (100 active lenses) | 2,444,531.60 | 0.0004 | 0.0006 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 4,727,118.76 | 0.0002 | 0.0003 |
| schedule 1 microtask | 2,023,150.43 | 0.0005 | 0.0007 |
| baseline: schedule 10 native microtasks (parallel) | 920,590.54 | 0.0011 | 0.0015 |
| schedule 10 microtasks (parallel) | 603,673.06 | 0.0017 | 0.0021 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 2,537,419.82 | 0.0004 | 0.0006 |
| untracked(() => read) | 3,690,568.33 | 0.0003 | 0.0003 |
| peek() read — no context | 4,009,488.31 | 0.0002 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,447,490.53 | 0.0007 | 0.0010 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 368,211.32 | 0.0027 | 0.0049 |
| batched computed chain update (x10) | 171,889.42 | 0.0058 | 0.0096 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 23,289.35 | 0.0429 | 0.1001 |
| 1 to N propagation (Fan Out 1000) | 10,478.45 | 0.0954 | 0.1855 |
| N to 1 propagation (Fan In 1000) | 85,469.65 | 0.0117 | 0.0329 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 174,039.58 | 0.0057 | 0.0093 |
| isAtom checks | 163,757.20 | 0.0061 | 0.0071 |
| isComputed checks | 163,711.47 | 0.0061 | 0.0079 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 217,033.73 | 0.0046 | 0.0102 |
| diamond pattern (1 → 10 → 10 → 1) | 763,870.76 | 0.0013 | 0.0025 |
| pyramid pattern (50 levels) | 327,260.24 | 0.0031 | 0.0063 |
| mixed dependencies (100 atoms → 200 computeds) | 590,561.16 | 0.0017 | 0.0022 |
| circular avoidance (x10) | 845,467.96 | 0.0012 | 0.0020 |
| conditional dependencies (x10) | 380,915.25 | 0.0026 | 0.0049 |
| array-based selection (x10) | 367,597.31 | 0.0027 | 0.0046 |
| batch update: 10 random cells | 274,600.25 | 0.0036 | 0.0046 |
| bulk update: replace full grid | 60,419.36 | 0.0166 | 0.0404 |
| read performance: 2500 lenses | 2,356.10 | 0.4244 | 0.7498 |
| read depth 100 lens chain (x10) | 71,206.84 | 0.0140 | 0.0274 |
| update depth 100 lens chain | 85,338.47 | 0.0117 | 0.0213 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,378.60 | 0.2284 | 0.4936 |
| [Atom] Toggle Sort | 9,317.67 | 0.1073 | 0.2484 |
| [Vanilla] Switch Filter | 378,772.63 | 0.0026 | 0.0035 |
| [Atom] Switch Filter | 249,446.82 | 0.0040 | 0.0081 |
| [Vanilla] sort + filter + paginate | 4,354.54 | 0.2296 | 0.2643 |
| [Atom] sort + filter + paginate | 8,960.93 | 0.1116 | 0.2463 |
| [Manual] update single cell (x10) | 149,216.74 | 0.0067 | 0.0188 |
| [Lens] update single cell (x10) | 95,947.32 | 0.0104 | 0.0233 |
| select/deselect rows (Set-based) | 14,147.12 | 0.0707 | 0.3032 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 73,272.77 | 0.0136 | 0.0284 |
| subscription churn (1K cycles) | 23,264.58 | 0.0430 | 0.0771 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 57,921.19 | 0.0173 | 0.0294 |
| 10K entity state tree management | 363,132.52 | 0.0028 | 0.0044 |
| heap monitoring (1000 large atoms) | 2,702.17 | 0.3701 | 0.9305 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 357,467.49 | 0.0028 | 0.0059 |
| [Manual] form reset (20 fields) | 861,258.71 | 0.0012 | 0.0015 |
| [Batch] state sync (100 atoms) | 98,750.22 | 0.0101 | 0.0208 |
| [Manual] state sync (100 atoms) | 188,107.84 | 0.0053 | 0.0066 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 65,755.33 | 0.0152 | 0.0333 |
| [Atom] filter 1000 items (Fresh Computed each time) | 20,177.03 | 0.0496 | 0.0985 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 1,557,898.50 | 0.0006 | 0.0010 |
| [Vanilla] add items → apply coupon → total | 2,735,020.99 | 0.0004 | 0.0005 |
| [Atom] add items → apply coupon → total | 1,505,458.61 | 0.0007 | 0.0010 |
| [Vanilla] update source → recalc all KPIs | 6,392,020.77 | 0.0002 | 0.0003 |
| [Atom] update source → reactive KPI pipeline | 3,166,139.06 | 0.0003 | 0.0005 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,056,639.90 | 0.0009 | 0.0014 |
| [Atom] creation + first .value read | 829,813.16 | 0.0012 | 0.0017 |
| [Vanilla] function call (computed baseline) | 1,069,360.12 | 0.0009 | 0.0015 |
| [Atom] lazy computed creation + first eval | 295,656.76 | 0.0034 | 0.0059 |
| [Atom] eager computed creation + first eval | 299,907.38 | 0.0033 | 0.0045 |
| [Atom] effect creation + first run + dispose | 173,823.31 | 0.0058 | 0.0101 |
| [Vanilla] variable write + read | 1,080,211.84 | 0.0009 | 0.0014 |
| [Atom] atom write + computed propagation | 448,150.29 | 0.0022 | 0.0029 |
| [Atom] atom read only — warm cache | 1,219,511.79 | 0.0008 | 0.0009 |
| [Atom] computed read only — warm cache hit | 1,216,469.81 | 0.0008 | 0.0010 |
| [Cold] new computed each iteration | 304,834.82 | 0.0033 | 0.0049 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,264,660.98 | 0.0008 | 0.0009 |
| [Warm] reuse computed — cache miss (source changed) | 827,096.13 | 0.0012 | 0.0019 |
| [Cold] effect create + first run + dispose | 201,493.54 | 0.0050 | 0.0084 |
| [Warm] effect repeated trigger (x100) | 282,500.55 | 0.0035 | 0.0043 |
