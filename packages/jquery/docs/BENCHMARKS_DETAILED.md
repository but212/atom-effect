# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-04-05
**Version**: v0.27.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 163.36 | 6.1216 | 16.8300 |
| Update text (100el × 50 updates) | 187.57 | 5.3313 | 9.6616 |
| Update html (100el × 20 updates) | 98.4288 | 10.1596 | 21.2148 |
| Toggle class (100el × 100 toggles) | 207.73 | 4.8138 | 7.1955 |
| Create composite (text+class+css+show) × 100 | 120.23 | 8.3173 | 13.6701 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100) | 54.1158 | 18.4789 | 30.5962 |
| DOM → atom: input val (trigger 100 events) | 855.86 | 1.1684 | 2.3089 |
| Checkbox toggle (100el × 100 toggles) | 93.4380 | 10.7023 | 13.4102 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 25.8432 | 38.6949 | 61.2380 |
| Reconciliation: append 10 items to 100 | 247.81 | 4.0353 | 6.0082 |
| Reconciliation: full shuffle 100 items | 241.51 | 4.1406 | 7.3972 |
| Render 100 items with bind callback | 75.8689 | 13.1806 | 20.8627 |

### Sanitization: sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean large (50+ nodes) | 187,209.91 | 0.0053 | 0.0057 |
| Mixed dangerous attributes removal | 453,032.25 | 0.0022 | 0.0036 |
| Batch throughput (100 × mixed profile) | 5,094.46 | 0.1963 | 0.3490 |

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter → Delete | 1,910.36 | 0.5235 | 1.9338 |
| Stats Auto-update: 100 items with rate | 1,878.37 | 0.5324 | 1.8792 |

### Dashboard & Reactive Topology

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 52.9473 | 18.8867 | 21.5880 |
| Mount/Unmount 20 components (10 cycles) | 27.5017 | 36.3614 | 55.8993 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets | 800.80 | 1.2487 | 3.2615 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM | 800.22 | 1.2497 | 3.0292 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM | 1,459.14 | 0.6853 | 1.7570 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 422,128.98 | 0.0024 | 0.0036 |
| Update 1 field in 100-field form (x100) | 401,791.95 | 0.0025 | 0.0047 |

> **Analysis**: These results demonstrate true **O(1) scaling**. Form size has negligible impact on field dispatch performance, maintaining over **400,000 operations per second** for both small and large forms.
