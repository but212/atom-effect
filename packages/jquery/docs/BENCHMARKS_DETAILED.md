# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-04-12
**Version**: v0.30.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 164.59 | 6.0758 | 16.9969 |
| Update text (100el × 50 updates) | 194.27 | 5.1474 | 8.8554 |
| Update html (100el × 20 updates) | 102.31 | 9.7744 | 19.4313 |
| Toggle class (100el × 100 toggles) | 204.94 | 4.8794 | 7.8539 |
| Create composite (text+class+css+show) × 100 | 122.70 | 8.1498 | 13.3136 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100) | 55.9688 | 17.8671 | 28.7506 |
| DOM → atom: input val (trigger 100 events) | 877.65 | 1.1394 | 2.2588 |
| Checkbox toggle (100el × 100 toggles) | 94.9183 | 10.5354 | 15.6888 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 11.6208 | 86.0528 | 109.04 |
| Reconciliation: append 10 items to 100 | 136.55 | 7.3235 | 12.9266 |
| Reconciliation: full shuffle 100 items | 139.24 | 7.1818 | 12.6124 |
| Render 100 items with bind callback | 48.1958 | 20.7487 | 32.4247 |

### Sanitization: sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean large (50+ nodes) | 186,792.62 | 0.0054 | 0.0061 |
| Mixed dangerous attributes removal | 536,994.79 | 0.0019 | 0.0023 |
| Batch throughput (100 × mixed profile) | 5,921.40 | 0.1689 | 0.1926 |

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter → Delete | 1,958.65 | 0.5106 | 1.8158 |
| Stats Auto-update: 100 items with rate | 1,898.76 | 0.5267 | 1.6629 |

### Dashboard & Reactive Topology

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 54.2120 | 18.4461 | 22.0486 |
| Mount/Unmount 20 components (10 cycles) | 27.9294 | 35.8045 | 50.2893 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets | 786.08 | 1.2721 | 3.1739 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM | 807.77 | 1.2380 | 2.8817 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM | 1,474.55 | 0.6782 | 1.6450 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 420,230.15 | 0.0024 | 0.0038 |
| Update 1 field in 100-field form (x100) | 411,146.59 | 0.0024 | 0.0038 |

> **Analysis**: These results demonstrate true **O(1) scaling**. Form size has negligible impact on field dispatch performance, maintaining over **400,000 operations per second** for both small and large forms.
