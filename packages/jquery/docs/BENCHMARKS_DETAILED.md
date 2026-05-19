# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-05-19
**Version**: v0.33.0

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.*

---

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 943.53 | 1.0599 | 2.3000 |
| Update text (100el × 50 updates) | 1,020.29 | 0.9801 | 2.0000 |
| Update html (100el × 20 updates) | 275.34 | 3.6319 | 7.5000 |
| Toggle class (100el × 100 toggles) | 1,010.29 | 0.9898 | 2.7000 |
| Composite binding (text+class+css+show) creation × 100 | 403.64 | 2.4775 | 5.3000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs × 100 updates) | 107.65 | 9.2890 | 20.4000 |
| DOM → atom: input val (trigger 100 events) | 1,870.63 | 0.5346 | 1.0000 |
| Checkbox toggle (100el × 100 toggles) | 410.92 | 2.4336 | 7.3000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Initial render: 1000 items | 61.63 | 16.2265 | 26.6000 |
| Reconciliation: append 10 items to 100 | 579.77 | 1.7248 | 4.5000 |
| Reconciliation: full shuffle 100 items | 578.31 | 1.7292 | 4.4000 |
| Render 100 items with bind callback | 394.17 | 2.5370 | 5.5000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 872.39 | 1.1463 | 13.9000 |
| Web Component: context injection (depth 10) | 44,416.56 | 0.0225 | 0.1000 |
| Web Component: Shadow DOM injection (depth 5) | 43,085.93 | 0.0232 | 0.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow: Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 20,327.29 | 0.0492 | 0.2000 |
| Stats Auto-update: 100 items with rate (toFixed) | 14,478.67 | 0.0691 | 0.2000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets batch update (50 rounds) | 294.78 | 3.3923 | 5.8000 |
| Mount/Unmount 20 components (10 cycles) | 163.46 | 6.1179 | 13.8000 |
| Deep Propagation: 5-level Chain → 20 DOM Widgets (100 updates) | 4,324.38 | 0.2312 | 0.5000 |
| Fan-out: 1 Atom → 20 Computed → 20 DOM Bindings | 4,190.67 | 0.2386 | 0.5000 |
| Fan-in: 20 Atoms → 1 Computed → 1 DOM Binding | 3,649.09 | 0.2740 | 0.6000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 1,089,643.36 | 0.0009 | 0.0000 |
| Update 1 field in 100-field form (O(1) test, x10) | 1,133,309.11 | 0.0009 | 0.0000 |

> **Technical Analysis**: The results indicate consistent performance across different form sizes. Field dispatch frequency remains stable at approximately 1.1M operations per second for both 10-field and 100-field forms, indicating O(1) scaling behavior for field updates.
