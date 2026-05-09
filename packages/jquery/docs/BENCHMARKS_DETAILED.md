# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-05-10
**Version**: v0.32.1

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.*

---

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 977.61 | 1.0229 | 2.6000 |
| Update text (100el × 50 updates) | 1,031.28 | 0.9697 | 2.5000 |
| Update html (100el × 20 updates) | 281.83 | 3.5482 | 7.8000 |
| Toggle class (100el × 100 toggles) | 1,045.69 | 0.9563 | 3.0000 |
| Composite binding (text+class+css+show) creation × 100 | 440.12 | 2.2721 | 4.2000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 102.33 | 9.7725 | 22.0000 |
| DOM → atom: input val (trigger 100 events) | 1,872.25 | 0.5341 | 0.9000 |
| Checkbox toggle (100el × 100 toggles) | 424.70 | 2.3546 | 7.8000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 60.60 | 16.5015 | 29.3000 |
| Reconciliation: append 10 items to 100 | 582.53 | 1.7166 | 4.9000 |
| Reconciliation: full shuffle 100 items | 584.42 | 1.7111 | 5.0000 |
| Render 100 items with bind callback | 405.96 | 2.4633 | 6.2000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 943.34 | 1.0601 | 15.0000 |
| Web Component: context injection (depth 10) | 46,083.28 | 0.0217 | 0.1000 |
| Web Component: Shadow DOM injection (depth 5) | 44,341.00 | 0.0226 | 0.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 15,447.64 | 0.0647 | 0.2000 |
| Stats Auto-update: 100 items with rate (toFixed) | 11,248.00 | 0.0889 | 0.2000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 279.17 | 3.5821 | 6.6000 |
| Mount/Unmount 20 components (10 cycles) | 138.38 | 7.2264 | 16.6000 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets (100 updates) | 4,089.73 | 0.2445 | 0.5000 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM Bindings | 3,841.49 | 0.2603 | 0.6000 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM Binding | 3,216.24 | 0.3109 | 0.7000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 1,246,210.00 | 0.0008 | 0.1000 |
| Update 1 field in 100-field form (O(1) test, x10) | 1,308,651.33 | 0.0008 | 0.1000 |

> **Technical Analysis**: The results indicate consistent performance across different form sizes. Field dispatch frequency remains stable at approximately 1.3M operations per second for both 10-field and 100-field forms, indicating O(1) scaling behavior for field updates.
