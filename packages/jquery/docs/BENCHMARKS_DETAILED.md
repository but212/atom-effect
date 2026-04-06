# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-04-07
**Version**: v0.29.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 136.89 | 7.3053 | 20.1529 |
| Update text (100el × 50 updates) | 161.55 | 6.1899 | 8.9140 |
| Update html (100el × 20 updates) | 82.1441 | 12.1737 | 23.5719 |
| Toggle class (100el × 100 toggles) | 175.40 | 5.7014 | 10.4157 |
| Create composite (text+class+css+show) × 100 | 102.56 | 9.7507 | 14.6559 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100) | 44.6287 | 22.4071 | 32.0563 |
| DOM → atom: input val (trigger 100 events) | 840.79 | 1.1894 | 2.2447 |
| Checkbox toggle (100el × 100 toggles) | 74.6836 | 13.3898 | 16.5546 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 25.6620 | 38.9682 | 50.4734 |
| Reconciliation: append 10 items to 100 | 242.67 | 4.1208 | 8.2568 |
| Reconciliation: full shuffle 100 items | 243.31 | 4.1100 | 8.1138 |
| Render 100 items with bind callback | 65.8032 | 15.1968 | 23.5827 |

### Sanitization: sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean large (50+ nodes) | 169,904.28 | 0.0059 | 0.0066 |
| Mixed dangerous attributes removal | 432,467.91 | 0.0023 | 0.0025 |
| Batch throughput (100 × mixed profile) | 4,739.59 | 0.2110 | 0.2379 |

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter → Delete | 1,677.22 | 0.5962 | 1.9070 |
| Stats Auto-update: 100 items with rate | 1,617.00 | 0.6184 | 1.7342 |

### Dashboard & Reactive Topology

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 46.9400 | 21.3038 | 24.4613 |
| Mount/Unmount 20 components (10 cycles) | 22.7786 | 43.9008 | 61.3424 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets | 699.27 | 1.4301 | 3.0619 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM | 692.47 | 1.4441 | 3.1994 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM | 1,455.06 | 0.6873 | 1.4668 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 478,820.20 | 0.0021 | 0.0024 |
| Update 1 field in 100-field form (x100) | 464,005.60 | 0.0022 | 0.0025 |

> **Analysis**: These results demonstrate true **O(1) scaling**. Form size has negligible impact on field dispatch performance, maintaining over **400,000 operations per second** for both small and large forms.
