# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-06-20
**Version**: v0.34.0

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.

---

## 1. Micro-Benchmarks

### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Native: create 100 text nodes | 8,243.18 | 0.1213 | 0.3000 |
| jQuery: create 100 text elements | 1,446.86 | 0.6912 | 1.7000 |
| atom-effect: create 100 text bindings (atomText) | 1,035.59 | 0.9656 | 2.7000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 631.56 | 1.5834 | 5.1000 |
| Native: update text (100 elements x 50 updates) | 274.18 | 3.6473 | 12.8000 |
| jQuery: update text (100 elements x 50 updates) | 97.23 | 10.2850 | 18.7000 |
| atom-effect: update text (100 elements x 50 updates) | 994.70 | 1.0053 | 4.6000 |
| atom-effect: update html (100 elements x 20 updates) | 623.81 | 1.6030 | 6.4000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,025.18 | 0.9754 | 3.2000 |
| atom-effect: update CSS (100 elements x 50 updates) | 789.66 | 1.2664 | 6.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 532.47 | 1.8780 | 3.5000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 423.66 | 2.3604 | 8.4000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 130.86 | 7.6415 | 14.7000 |
| select multiple options (100 selects x 50 updates) | 102.37 | 9.7685 | 19.8000 |
| radio check toggle (100 radio groups x 100 updates) | 76.69 | 13.0400 | 29.8000 |
| sequential chain calls (text+class+css+show) x 100 elements | 280.58 | 3.5641 | 7.0000 |
| unified atomBind (text+class+css+show) x 100 elements | 310.50 | 3.2206 | 7.5000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 117.56 | 8.5060 | 13.5000 |
| atomForm update via state (10 forms x 50 updates) | 56.43 | 17.7210 | 26.9000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 33.58 | 29.7790 | 45.2000 |
| atomForm setup with validation hooks x 10 forms | 54.93 | 18.2045 | 25.6000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 45,843.40 | 0.0218 | 0.1000 |
| setup lazy atomFetch | 165,021.00 | 0.0061 | 0.1000 |
| trigger refetch on dependency update | 11,895.78 | 0.0841 | 0.2000 |
| trigger fetch with sync transformation pipeline | 17,662.00 | 0.0566 | 0.2000 |
| rapid dependency updates causing multiple aborts (50 times) | 11,778.00 | 0.0849 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,187.29 | 0.8423 | 3.5000 |
| atom-effect: atomList render 1000 items | 263.60 | 3.7936 | 10.1000 |
| atom-effect: atomList render 1000 items (with bind callback) | 76.97 | 12.9925 | 23.9000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,611.22 | 0.3830 | 0.8000 |
| Reconciliation: remove 50 items | 2,562.74 | 0.3902 | 0.9000 |

### Web Component

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Web Component: setup/teardown (100) | 914.39 | 1.0936 | 15.7000 |
| Web Component: context lookup (depth 5) | 60,115.99 | 0.0166 | 0.1000 |
| Web Component: context lookup (depth 20) | 35,571.00 | 0.0281 | 0.1000 |
| Web Component: Shadow DOM context injection (depth 5) | 48,333.00 | 0.0207 | 0.1000 |

### Mounting: Component Lifecycle

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomMount initial setup (100 elements) | 849.41 | 1.1773 | 6.3000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,261.77 | 0.4421 | 0.9000 |
| atomUnmount (100 elements) | 791.60 | 1.2633 | 8.0000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,337.00 | 0.1199 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 4,624,136.59 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 4,644,042.60 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 4,651,753.00 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 4,571,058.89 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 4,689,163.00 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 51,770.82 | 0.0193 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 73,300.00 | 0.0136 | 0.1000 |
| mitigate complex DOM Clobbering payload | 4,745,803.00 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,575.48 | 0.3883 | 0.5000 |
| IME Composition input overhead (50 composition cycles) | 2,059.38 | 0.4856 | 0.8000 |
| Checkbox change event propagation (100 changes) | 4,030.19 | 0.2481 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 938.72 | 1.0653 | 2.7000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,363.66 | 0.2973 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 8,804.00 | 0.1136 | 0.3000 |
| Asynchronous path updates (10 elements x 50 updates) | 6,372.36 | 0.1569 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 920.91 | 1.0859 | 2.0000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 738.26 | 1.3545 | 2.8000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 394.57 | 2.5344 | 5.4000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 392.22 | 2.5496 | 5.1000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 148.46 | 6.7360 | 24.6000 |
| Append 100 items (Tail insertion) | 155.98 | 6.4110 | 19.5000 |
| Prepend 100 items (Head insertion) | 155.04 | 6.4500 | 20.0000 |
| Reverse list (1000 items diff & swap) | 155.78 | 6.4195 | 18.0000 |
| Filter/Remove 500 items | 158.91 | 6.2930 | 18.3000 |
| Clear all items | 157.80 | 6.3370 | 17.7000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 992.41 | 1.0076 | 2.5000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 184.40 | 5.4230 | 16.2000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 957.71 | 1.0442 | 3.0000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 268.89 | 3.7190 | 14.9000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 24,776.67 | 0.0404 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 25,506.67 | 0.0392 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 14,659.02 | 0.0682 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 564.84 | 1.7704 | 4.6000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 554.89 | 1.8022 | 4.1000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 71.19 | 14.0472 | 21.8000 |
| Mount/Unmount 100 components (10 cycles) | 39.58 | 25.2683 | 46.7000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,015.20 | 0.9850 | 4.3000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,078.52 | 0.9272 | 5.8000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,314.67 | 0.4320 | 0.8000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 891,944.54 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 400,326.64 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 49,937.33 | 0.0200 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
