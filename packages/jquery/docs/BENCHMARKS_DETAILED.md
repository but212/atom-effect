# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-06-05
**Version**: v0.33.1

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.*

---

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 1,004.90 | 0.9951 | 3.8000 |
| Update text (100el × 50 updates) | 1,067.57 | 0.9367 | 2.5000 |
| Update html (100el × 20 updates) | 644.94 | 1.5505 | 3.9000 |
| Toggle class (100el × 100 toggles) | 1,083.03 | 0.9233 | 5.0000 |
| Composite binding (text+class+css+show) creation × 100 | 495.90 | 2.0165 | 5.7000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 180.21 | 5.5490 | 9.4000 |
| DOM → atom: input val (trigger 100 events) | 2,041.80 | 0.4898 | 0.9000 |
| Checkbox toggle (100el × 100 toggles) | 491.66 | 2.0339 | 7.7000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 300.94 | 3.3229 | 7.2000 |
| Reconciliation: append 10 items to 100 | 2,713.19 | 0.3686 | 0.7000 |
| Reconciliation: full shuffle 100 items | 2,639.47 | 0.3789 | 0.7000 |
| Render 1000 items with bind callback | 75.10 | 13.3160 | 24.9000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 912.54 | 1.0958 | 19.7000 |
| Web Component: context lookup (depth 5) | 43,051.72 | 0.0232 | 0.1000 |
| Web Component: context lookup (depth 20) | 31,623.84 | 0.0316 | 0.1000 |
| Web Component: Shadow DOM context injection (depth 5) | 44,955.12 | 0.0222 | 0.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 20,578.67 | 0.0486 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 20,820.67 | 0.0480 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,933.33 | 0.0773 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 507.00 | 1.9724 | 6.1000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 484.47 | 2.0641 | 5.7000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 64.22 | 15.5722 | 32.6000 |
| Mount/Unmount 100 components (10 cycles) | 35.40 | 28.2519 | 44.9000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 904.43 | 1.1057 | 3.7000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 938.29 | 1.0658 | 3.5000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 1,857.09 | 0.5385 | 1.2000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 869,222.38 | 0.0012 | 0.1000 |
| Update 1 field in 100-field form (x10) | 409,690.69 | 0.0024 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 57,000.87 | 0.0175 | 0.1000 |

> **Technical Analysis**: Field updates scale efficiently from 10 fields (869K ops/sec) to 100 fields (409.7K ops/sec) and 1000 fields (57.0K ops/sec), representing highly optimized performance across form sizes.
