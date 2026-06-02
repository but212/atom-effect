# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-06-02
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
| Create 100 text bindings | 952.05 | 1.0504 | 3.3000 |
| Update text (100el × 50 updates) | 980.80 | 1.0196 | 4.4000 |
| Update html (100el × 20 updates) | 572.08 | 1.7480 | 5.3000 |
| Toggle class (100el × 100 toggles) | 992.11 | 1.0080 | 4.5000 |
| Composite binding (text+class+css+show) creation × 100 | 415.38 | 2.4075 | 5.6000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 138.78 | 7.2055 | 11.4000 |
| DOM → atom: input val (trigger 100 events) | 1,963.61 | 0.5093 | 0.9000 |
| Checkbox toggle (100el × 100 toggles) | 415.50 | 2.4067 | 7.7000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 300.19 | 3.3312 | 10.1000 |
| Reconciliation: append 10 items to 100 | 2,651.00 | 0.3772 | 0.7000 |
| Reconciliation: full shuffle 100 items | 2,435.00 | 0.4107 | 0.8000 |
| Render 1000 items with bind callback | 75.29 | 13.2825 | 28.0000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 1,008.80 | 0.9913 | 3.8000 |
| Web Component: context lookup (depth 5) | 50,408.96 | 0.0198 | 0.1000 |
| Web Component: context lookup (depth 20) | 33,599.00 | 0.0298 | 0.1000 |
| Web Component: Shadow DOM context injection (depth 5) | 35,476.45 | 0.0282 | 0.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 19,055.40 | 0.0525 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 18,645.33 | 0.0536 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 9,948.67 | 0.1005 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 523.44 | 1.9104 | 5.9000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 492.17 | 2.0318 | 6.7000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 63.63 | 15.7156 | 35.6000 |
| Mount/Unmount 100 components (10 cycles) | 33.54 | 29.8137 | 47.5000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 875.77 | 1.1419 | 4.7000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 896.19 | 1.1158 | 4.5000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 1,885.08 | 0.5305 | 0.9000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 896,666.22 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 406,920.87 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 55,150.99 | 0.0181 | 0.1000 |

> **Technical Analysis**: Field updates scale efficiently from 10 fields (896K ops/sec) to 100 fields (406.9K ops/sec) and 1000 fields (55.2K ops/sec), representing highly optimized performance across form sizes.
