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
| baseline: plain object creation | 1,125,340.64 | 0.0009 | 0.0010 |
| creation: primitive atom | 889,896.23 | 0.0011 | 0.0017 |
| baseline: nested object creation | 1,098,009.91 | 0.0009 | 0.0012 |
| creation: object atom | 886,423.57 | 0.0011 | 0.0015 |
| baseline: plain object read/write | 6,668,339.48 | 0.0001 | 0.0002 |
| read/write performance: active | 1,008,140.10 | 0.0010 | 0.0013 |
| untracked read: active | 5,326,334.78 | 0.0002 | 0.0002 |
| baseline: plain object property read | 3,643,314.12 | 0.0003 | 0.0003 |
| atom.value read | 3,034,702.75 | 0.0003 | 0.0004 |
| atom.peek() read | 3,091,951.98 | 0.0003 | 0.0004 |

### Computed Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw function creation | 1,089,794.36 | 0.0009 | 0.0013 |
| creation: flat computed | 442,698.80 | 0.0023 | 0.0039 |
| creation: chained computed (10 levels) | 525,083.90 | 0.0019 | 0.0025 |
| baseline: raw chained function evaluation | 749,022.20 | 0.0013 | 0.0020 |
| recomputation & cache | 353,749.90 | 0.0028 | 0.0032 |
| lazy evaluation overhead | 362,847.45 | 0.0028 | 0.0041 |
| baseline: plain function call | 3,553,025.91 | 0.0003 | 0.0005 |
| computed.value read (active) | 2,714,368.24 | 0.0004 | 0.0004 |
| computed.peek() read (active) | 3,017,302.10 | 0.0003 | 0.0004 |
| creation: async computed | 818,059.99 | 0.0012 | 0.0017 |
| read: resolved value & state | 754,087.97 | 0.0013 | 0.0014 |
| resolution: promise resolving lifecycle | 70,282.56 | 0.0142 | 0.0256 |

### Effect Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: listener registration and removal | 921,849.95 | 0.0011 | 0.0016 |
| creation & disposal | 230,815.98 | 0.0043 | 0.0061 |
| baseline: raw callback propagation | 632,490.88 | 0.0016 | 0.0016 |
| propagation: atom → computed → effect | 1,155,017.02 | 0.0009 | 0.0012 |
| cleanup execution | 645,173.66 | 0.0015 | 0.0018 |
| baseline: Set add + delete | 845,779.25 | 0.0012 | 0.0026 |
| atom.subscribe + unsubscribe | 1,496,685.31 | 0.0007 | 0.0010 |
| computed.subscribe + unsubscribe | 1,471,535.31 | 0.0007 | 0.0010 |

### Lenses (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: raw nested object read | 1,242,703.21 | 0.0008 | 0.0009 |
| read: lens | 789,607.64 | 0.0013 | 0.0013 |
| read: computed active | 1,189,965.05 | 0.0008 | 0.0009 |
| read: direct object access | 1,184,965.31 | 0.0008 | 0.0009 |
| baseline: raw nested object write | 4,233,436.17 | 0.0002 | 0.0003 |
| write: lens | 216,075.96 | 0.0046 | 0.0053 |
| write: manual spread | 814,892.78 | 0.0012 | 0.0015 |
| composition & scaling (100 active lenses) | 1,230,082.53 | 0.0008 | 0.0010 |

---

## 2. Scheduler and Context

Measurements for internal scheduling and execution context management.

### aeNextTick / Microtasks

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: schedule 1 native microtask | 4,681,638.29 | 0.0002 | 0.0003 |
| schedule 1 microtask | 1,979,708.16 | 0.0005 | 0.0008 |
| baseline: schedule 10 native microtasks (parallel) | 939,503.24 | 0.0011 | 0.0014 |
| schedule 10 microtasks (parallel) | 624,216.06 | 0.0016 | 0.0019 |

### Untracked Context (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| tracked read inside computed | 1,580,865.46 | 0.0006 | 0.0008 |
| untracked(() => read) | 3,584,179.31 | 0.0003 | 0.0003 |
| peek() read — no context | 3,855,194.55 | 0.0003 | 0.0003 |

### Batch Nesting (10 writes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| unbatched 10 writes | 1,145,198.34 | 0.0009 | 0.0012 |
| flat batch | 454,469.63 | 0.0022 | 0.0029 |
| nested batch (3 levels) | 447,269.01 | 0.0022 | 0.0034 |
| batch update 10 atoms: active (x10) | 318,684.43 | 0.0031 | 0.0049 |
| batched computed chain update (x10) | 134,486.65 | 0.0074 | 0.0138 |

---

## 3. Propagation and Topology

### Stress Tests (1000 nodes)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| 1 to 1 propagation (Depth 1000) | 7,351.95 | 0.1360 | 0.2933 |
| 1 to N propagation (Fan Out 1000) | 5,680.54 | 0.1760 | 0.2857 |
| N to 1 propagation (Fan In 1000) | 50,050.25 | 0.0200 | 0.0305 |

---

## 4. Type Guards (x80)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| baseline: basic property check | 173,927.73 | 0.0057 | 0.0091 |
| isAtom checks | 167,947.89 | 0.0060 | 0.0095 |
| isComputed checks | 165,686.29 | 0.0060 | 0.0070 |

---

## 5. Macro and Realistic Workflows

### Complex Graph Patterns

| Pattern | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| deep chain (100 levels) | 63,220.97 | 0.0158 | 0.0272 |
| diamond pattern (1 → 10 → 10 → 1) | 266,349.88 | 0.0038 | 0.0042 |
| pyramid pattern (50 levels) | 107,903.37 | 0.0093 | 0.0196 |
| mixed dependencies (100 atoms → 200 computeds) | 449,683.13 | 0.0022 | 0.0026 |
| circular avoidance (x10) | 802,504.65 | 0.0012 | 0.0016 |
| conditional dependencies (x10) | 341,542.29 | 0.0029 | 0.0032 |
| array-based selection (x10) | 318,078.25 | 0.0031 | 0.0035 |
| batch update: 10 random cells | 282,447.04 | 0.0035 | 0.0052 |
| bulk update: replace full grid | 61,863.24 | 0.0162 | 0.0384 |
| read performance: 2500 lenses | 2,431.23 | 0.4113 | 0.4577 |
| read depth 100 lens chain (x10) | 72,413.54 | 0.0138 | 0.0221 |
| update depth 100 lens chain | 85,011.51 | 0.0118 | 0.0214 |

### Data Grid Operations (1000 Rows)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] Toggle Sort | 4,348.46 | 0.2300 | 0.6493 |
| [Atom] Toggle Sort | 4,487.44 | 0.2228 | 0.3930 |
| [Vanilla] Switch Filter | 385,340.40 | 0.0026 | 0.0045 |
| [Atom] Switch Filter | 135,219.49 | 0.0074 | 0.0112 |
| [Vanilla] sort + filter + paginate | 4,425.42 | 0.2260 | 0.2593 |
| [Atom] sort + filter + paginate | 4,372.98 | 0.2287 | 0.2630 |
| [Manual] update single cell (x10) | 204,452.62 | 0.0049 | 0.0093 |
| [Lens] update single cell (x10) | 117,126.47 | 0.0085 | 0.0206 |
| select/deselect rows (Set-based) | 15,096.76 | 0.0662 | 0.2964 |

### Memory and Lifecycle

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| heavy component lifecycle (mount→update→unmount) | 69,324.81 | 0.0144 | 0.0234 |
| subscription churn (1K cycles) | 19,922.85 | 0.0502 | 0.1577 |
| create and dispose 1000 units | 1,303.04 | 0.7674 | 1.4376 |
| circular reference cleanup (100 cycles) | 60,690.91 | 0.0165 | 0.0284 |
| 10K entity state tree management | 327,243.36 | 0.0031 | 0.0046 |
| heap monitoring (1000 large atoms) | 2,513.94 | 0.3978 | 2.0770 |

### Efficiency: Batching vs Manual Propagation

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Batch] form reset (20 fields) | 325,781.20 | 0.0031 | 0.0054 |
| [Manual] form reset (20 fields) | 685,144.94 | 0.0015 | 0.0021 |
| [Batch] state sync (100 atoms) | 8,849.09 | 0.1130 | 0.2316 |
| [Manual] state sync (100 atoms) | 144,353.27 | 0.0069 | 0.0127 |

### Realistic Scenarios (Workflow & Pipelines)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] filter 1000 items on query change | 63,001.37 | 0.0159 | 0.0334 |
| [Atom] filter 1000 items (Fresh Computed each time) | 12,215.88 | 0.0819 | 0.1492 |
| [Atom] filter 1000 items (Cached/Subscription overhead) | 12,214.53 | 0.0819 | 0.1389 |
| [Vanilla] add items → apply coupon → total | 2,778,479.79 | 0.0004 | 0.0006 |
| [Atom] add items → apply coupon → total | 809,441.56 | 0.0012 | 0.0017 |
| [Vanilla] update source → recalc all KPIs | 6,372,221.10 | 0.0002 | 0.0002 |
| [Atom] update source → reactive KPI pipeline | 1,066,297.24 | 0.0009 | 0.0013 |

---

## 6. Cold / Warm State Operations

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| [Vanilla] object allocation (baseline) | 1,132,967.04 | 0.0009 | 0.0015 |
| [Atom] creation + first .value read | 887,431.74 | 0.0011 | 0.0015 |
| [Vanilla] function call (computed baseline) | 1,101,567.96 | 0.0009 | 0.0015 |
| [Atom] lazy computed creation + first eval | 313,152.99 | 0.0032 | 0.0050 |
| [Atom] eager computed creation + first eval | 302,818.84 | 0.0033 | 0.0046 |
| [Atom] effect creation + first run + dispose | 175,135.45 | 0.0057 | 0.0110 |
| [Vanilla] variable write + read | 1,130,985.40 | 0.0009 | 0.0011 |
| [Atom] atom write + computed propagation | 439,900.21 | 0.0023 | 0.0026 |
| [Atom] atom read only — warm cache | 1,278,527.82 | 0.0008 | 0.0008 |
| [Atom] computed read only — warm cache hit | 1,299,410.83 | 0.0008 | 0.0008 |
| [Cold] new computed each iteration | 350,914.17 | 0.0028 | 0.0043 |
| [Warm] reuse computed — cache hit (source unchanged) | 1,324,191.76 | 0.0008 | 0.0008 |
| [Warm] reuse computed — cache miss (source changed) | 707,563.27 | 0.0014 | 0.0022 |
| [Cold] effect create + first run + dispose | 211,962.67 | 0.0047 | 0.0069 |
| [Warm] effect repeated trigger (x100) | 310,454.64 | 0.0032 | 0.0038 |
