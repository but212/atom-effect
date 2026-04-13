# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-04-14
**Version**: v0.30.1
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 132.69 | 7.5364 | 19.3879 |
| Update text (100el × 50 updates) | 158.98 | 6.2899 | 9.1299 |
| Update html (100el × 20 updates) | 81.52 | 12.2667 | 22.6960 |
| Toggle class (100el × 100 toggles) | 163.63 | 6.1113 | 10.2284 |
| Create composite (text+class+css+show) × 100 | 97.25 | 10.2832 | 16.6446 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100) | 44.2364 | 22.6058 | 34.9805 |
| DOM → atom: input val (trigger 100 events) | 830.92 | 1.2035 | 2.2703 |
| Checkbox toggle (100el × 100 toggles) | 73.6364 | 13.5802 | 16.5372 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 11.0850 | 90.2117 | 112.13 |
| Reconciliation: append 10 items to 100 | 134.89 | 7.4136 | 16.6485 |
| Reconciliation: full shuffle 100 items | 137.13 | 7.2926 | 11.9459 |
| Render 100 items with bind callback | 40.6900 | 24.5761 | 34.7966 |

### Sanitization: sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean large (50+ nodes) | 278,420.83 | 0.0036 | 0.0037 |
| Mixed dangerous attributes removal | 585,714.66 | 0.0017 | 0.0018 |
| Batch throughput (100 × mixed profile) | 6,768.98 | 0.1477 | 0.1657 |

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter → Delete | 1,698.55 | 0.5887 | 1.8759 |
| Stats Auto-update: 100 items with rate | 1,587.09 | 0.6301 | 1.8229 |

### Dashboard & Reactive Topology

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 47.5164 | 21.0454 | 24.1962 |
| Mount/Unmount 20 components (10 cycles) | 22.4486 | 44.5463 | 61.1476 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets | 664.87 | 1.5041 | 3.6122 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM | 673.27 | 1.4853 | 3.1811 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM | 1,431.05 | 0.6988 | 1.6216 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 477,818.46 | 0.0021 | 0.0028 |
| Update 1 field in 100-field form (x100) | 474,011.51 | 0.0021 | 0.0024 |

> **Analysis**: These results demonstrate true **O(1) scaling**. Form size has negligible impact on field dispatch performance, maintaining over **470,000 operations per second** for both small and large forms.
