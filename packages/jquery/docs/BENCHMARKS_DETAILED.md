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
| Native: create 100 text nodes | 8,323.17 | 0.1201 | 0.3000 |
| jQuery: create 100 text elements | 1,467.56 | 0.6814 | 2.0000 |
| atom-effect: create 100 text bindings (atomText) | 1,080.14 | 0.9258 | 2.9000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 707.36 | 1.4137 | 5.7000 |
| Native: update text (100 elements x 50 updates) | 271.26 | 3.6864 | 15.8000 |
| jQuery: update text (100 elements x 50 updates) | 91.04 | 10.9840 | 20.7000 |
| atom-effect: update text (100 elements x 50 updates) | 1,110.67 | 0.9004 | 4.7000 |
| atom-effect: update html (100 elements x 20 updates) | 697.09 | 1.4345 | 6.2000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,056.37 | 0.9466 | 4.5000 |
| atom-effect: update CSS (100 elements x 50 updates) | 991.80 | 1.0083 | 6.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 700.72 | 1.4271 | 3.4000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 502.60 | 1.9897 | 9.1000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 154.17 | 6.4865 | 12.2000 |
| select multiple options (100 selects x 50 updates) | 129.38 | 7.7290 | 18.3000 |
| radio check toggle (100 radio groups x 100 updates) | 84.64 | 11.8145 | 20.3000 |
| sequential chain calls (text+class+css+show) x 100 elements | 337.66 | 2.9615 | 8.7000 |
| unified atomBind (text+class+css+show) x 100 elements | 414.83 | 2.4106 | 9.1000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 127.46 | 7.8455 | 17.7000 |
| atomForm update via state (10 forms x 50 updates) | 67.99 | 14.7090 | 21.4000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 34.40 | 29.0735 | 33.6000 |
| atomForm setup with validation hooks x 10 forms | 31.26 | 31.9935 | 40.7000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 48,162.68 | 0.0208 | 0.1000 |
| setup lazy atomFetch | 174,026.60 | 0.0057 | 0.1000 |
| trigger refetch on dependency update | 10,515.56 | 0.0951 | 0.2000 |
| trigger fetch with sync transformation pipeline | 25,610.32 | 0.0390 | 0.1000 |
| rapid dependency updates causing multiple aborts (50 times) | 13,535.65 | 0.0739 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,252.87 | 0.7982 | 0.9000 |
| atom-effect: atomList render 1000 items | 273.29 | 3.6591 | 6.4000 |
| atom-effect: atomList render 1000 items (with bind callback) | 67.79 | 14.7505 | 30.3000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,679.20 | 0.3732 | 0.8000 |
| Reconciliation: remove 50 items | 2,670.73 | 0.3744 | 0.8000 |

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
| atomMount initial setup (100 elements) | 890.82 | 1.1226 | 8.4000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,309.92 | 0.4329 | 0.9000 |
| atomUnmount (100 elements) | 867.87 | 1.1522 | 9.5000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,656.13 | 0.1155 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 5,277,950.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 5,282,917.71 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,318,453.00 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,266,682.33 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 5,304,312.00 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 64,041.60 | 0.0156 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 80,375.00 | 0.0124 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,250,867.91 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,563.49 | 0.3901 | 0.7000 |
| IME Composition input overhead (50 composition cycles) | 2,125.36 | 0.4705 | 0.8000 |
| Checkbox change event propagation (100 changes) | 3,802.24 | 0.2630 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,039.38 | 0.9621 | 2.1000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,839.00 | 0.2605 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 10,266.95 | 0.0974 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 7,602.24 | 0.1315 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 923.00 | 1.0834 | 2.1000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 692.24 | 1.4446 | 3.1000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 383.69 | 2.6062 | 5.9000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 385.61 | 2.5933 | 5.7000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 139.66 | 7.1605 | 20.1000 |
| Append 100 items (Tail insertion) | 143.92 | 6.9485 | 19.5000 |
| Prepend 100 items (Head insertion) | 147.75 | 6.7680 | 20.4000 |
| Reverse list (1000 items diff & swap) | 150.39 | 6.6495 | 19.1000 |
| Filter/Remove 500 items | 149.25 | 6.7000 | 20.8000 |
| Clear all items | 150.11 | 6.6620 | 18.9000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,029.49 | 0.9714 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 175.65 | 5.6930 | 15.4000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 1,037.58 | 0.9638 | 3.2000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 330.31 | 3.0275 | 13.2000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 23,597.09 | 0.0424 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 25,287.33 | 0.0395 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 14,944.34 | 0.0669 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 569.51 | 1.7559 | 4.6000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 555.15 | 1.8013 | 4.1000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 68.14 | 14.6760 | 29.5000 |
| Mount/Unmount 100 components (10 cycles) | 37.93 | 26.3667 | 50.4000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,006.00 | 0.9940 | 3.5000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 985.92 | 1.0143 | 6.0000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,422.02 | 0.4129 | 0.7000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 910,990.74 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 401,986.00 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 54,083.73 | 0.0185 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
