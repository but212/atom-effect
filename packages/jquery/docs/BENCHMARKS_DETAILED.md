# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-04-20
**Version**: v0.31.0
**Environment**:

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in a real Chromium browser. Results reflect actual DOM rendering costs including layout, paint, and event handling.*

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 866.49 | 1.1541 | 3.0000 |
| Update text (100el × 50 updates) | 922.63 | 1.0839 | 4.0000 |
| Update html (100el × 20 updates) | 353.44 | 2.8293 | 8.3000 |
| Toggle class (100el × 100 toggles) | 937.97 | 1.0661 | 3.7000 |
| Composite binding (text+class+css+show) creation × 100 | 448.00 | 2.2321 | 5.1000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 126.56 | 7.9015 | 18.4000 |
| DOM → atom: input val (trigger 100 events) | 1,949.61 | 0.5129 | 0.7000 |
| Checkbox toggle (100el × 100 toggles) | 391.61 | 2.5536 | 9.0000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 91.22 | 10.9625 | 24.7000 |
| Reconciliation: append 10 items to 100 | 1,023.80 | 0.9768 | 2.1000 |
| Reconciliation: full shuffle 100 items | 1,024.90 | 0.9757 | 2.3000 |
| Render 100 items with bind callback | 310.78 | 3.2177 | 11.5000 |

### Sanitization: sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean large (50+ nodes) | 24,204.00 | 0.0413 | 0.2000 |
| Mixed dangerous attributes removal | 67,730.00 | 0.0148 | 0.1000 |
| Batch throughput (100 × mixed profile) | 702.58 | 1.4233 | 4.4000 |

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 12,988.47 | 0.0770 | 0.2000 |
| Stats Auto-update: 100 items with rate (toFixed) | 10,159.32 | 0.0984 | 0.2000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 331.76 | 3.0143 | 7.8000 |
| Mount/Unmount 20 components (10 cycles) | 172.73 | 5.7892 | 15.6000 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets (100 updates) | 3,865.33 | 0.2587 | 0.5000 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM Bindings | 3,773.08 | 0.2650 | 0.5000 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM Binding | 5,196.67 | 0.1924 | 0.4000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 408,160.67 | 0.0025 | 0.1000 |
| Update 1 field in 100-field form (O(1) test, x100) | 406,567.56 | 0.0025 | 0.1000 |

> **Analysis**: These results demonstrate true **O(1) scaling**. Form size has negligible impact on field dispatch performance, maintaining over **406,000 operations per second** for both small and large forms.
