# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-05-09
**Version**: v0.32.0

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.*

---

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 992.81 | 1.0072 | 2.5000 |
| Update text (100el × 50 updates) | 1,057.68 | 0.9455 | 2.2000 |
| Update html (100el × 20 updates) | 282.27 | 3.5428 | 10.3000 |
| Toggle class (100el × 100 toggles) | 1,068.25 | 0.9361 | 2.5000 |
| Composite binding (text+class+css+show) creation × 100 | 441.82 | 2.2633 | 5.3000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 104.54 | 9.5655 | 21.8000 |
| DOM → atom: input val (trigger 100 events) | 1,944.03 | 0.5144 | 0.6000 |
| Checkbox toggle (100el × 100 toggles) | 378.85 | 2.6396 | 9.5000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 58.11 | 17.2080 | 36.5000 |
| Reconciliation: append 10 items to 100 | 569.00 | 1.7575 | 4.6000 |
| Reconciliation: full shuffle 100 items | 579.07 | 1.7269 | 4.2000 |
| Render 100 items with bind callback | 284.77 | 3.5116 | 11.7000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 886.93 | 1.1275 | 15.8000 |
| Web Component: context injection (depth 10) | 47,830.22 | 0.0209 | 0.1000 |
| Web Component: Shadow DOM injection (depth 5) | 46,140.39 | 0.0217 | 0.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 17,094.19 | 0.0585 | 0.2000 |
| Stats Auto-update: 100 items with rate (toFixed) | 12,506.67 | 0.0800 | 0.2000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 293.57 | 3.4063 | 6.6000 |
| Mount/Unmount 20 components (10 cycles) | 156.12 | 6.4055 | 15.7000 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets (100 updates) | 4,313.05 | 0.2319 | 0.5000 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM Bindings | 4,169.72 | 0.2398 | 0.6000 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM Binding | 3,987.33 | 0.2508 | 0.6000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 1,309,078.73 | 0.0008 | 0.0000 |
| Update 1 field in 100-field form (O(1) test, x10) | 1,330,032.67 | 0.0008 | 0.0000 |

> **Technical Analysis**: The results indicate consistent performance across different form sizes. Field dispatch frequency remains stable at approximately 1.3M operations per second for both 10-field and 100-field forms, indicating O(1) scaling behavior for field updates.
