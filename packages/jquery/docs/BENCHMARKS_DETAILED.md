# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-06-12
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
| Native: create 100 text nodes | 8,304.17 | 0.1204 | 0.3000 |
| jQuery: create 100 text elements | 1,431.71 | 0.6985 | 1.5000 |
| atom-effect: create 100 text bindings (atomText) | 1,099.23 | 0.9097 | 2.3000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 646.61 | 1.5465 | 5.0000 |
| Native: update text (100 elements x 50 updates) | 253.32 | 3.9476 | 13.2000 |
| jQuery: update text (100 elements x 50 updates) | 88.75 | 11.2680 | 22.7000 |
| atom-effect: update text (100 elements x 50 updates) | 1,088.35 | 0.9188 | 3.7000 |
| atom-effect: update html (100 elements x 20 updates) | 650.54 | 1.5372 | 5.2000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,131.21 | 0.8840 | 2.4000 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,005.70 | 0.9943 | 5.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 663.82 | 1.5064 | 6.2000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 190.75 | 5.2425 | 11.1000 |
| DOM → atom: input val (trigger 100 events) | 2,068.97 | 0.4833 | 0.7000 |
| checkbox toggle (100 elements x 100 toggles) | 493.80 | 2.0251 | 8.2000 |
| textarea val (100 textareas x 100 updates) | 212.24 | 4.7117 | 9.3000 |
| select single option (100 selects x 100 updates) | 159.69 | 6.2620 | 14.2000 |
| select multiple options (100 selects x 50 updates) | 128.37 | 7.7900 | 22.7000 |
| radio check toggle (100 radio groups x 100 updates) | 89.71 | 11.1475 | 17.5000 |
| sequential chain calls (text+class+css+show) x 100 elements | 347.41 | 2.8784 | 7.1000 |
| unified atomBind (text+class+css+show) x 100 elements | 439.38 | 2.2759 | 6.4000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 86.32 | 11.5845 | 21.3000 |
| atomForm update via state (10 forms x 50 updates) | 69.49 | 14.3910 | 24.0000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 51.35 | 19.4740 | 26.8000 |
| atomForm setup with validation hooks x 10 forms | 109.61 | 9.1230 | 27.7000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 51,079.63 | 0.0196 | 0.1000 |
| setup lazy atomFetch | 179,139.00 | 0.0056 | 0.1000 |
| trigger refetch on dependency update | 16,618.34 | 0.0602 | 0.2000 |
| trigger fetch with sync transformation pipeline | 26,128.00 | 0.0383 | 0.1000 |
| rapid dependency updates causing multiple aborts (50 times) | 19,382.06 | 0.0516 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,102.23 | 0.9073 | 3.7000 |
| atom-effect: atomList render 1000 items | 280.74 | 3.5621 | 10.0000 |
| atom-effect: atomList render 1000 items (with bind callback) | 78.37 | 12.7605 | 27.1000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,775.17 | 0.3603 | 0.8000 |
| Reconciliation: remove 50 items | 2,785.72 | 0.3590 | 0.8000 |

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
| atomMount initial setup (100 elements) | 867.48 | 1.1528 | 7.3000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,298.77 | 0.4350 | 0.8000 |
| atomUnmount (100 elements) | 851.57 | 1.1743 | 7.9000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,563.14 | 0.1168 | 0.2000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 5,195,586.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 5,124,334.00 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,260,511.95 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,168,860.11 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 5,169,166.00 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 65,308.47 | 0.0153 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 80,547.00 | 0.0124 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,235,816.00 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,422.52 | 0.4128 | 0.7000 |
| IME Composition input overhead (50 composition cycles) | 2,010.40 | 0.4974 | 0.8000 |
| Checkbox change event propagation (100 changes) | 3,788.62 | 0.2639 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,024.39 | 0.9762 | 2.0000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,738.00 | 0.2675 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 10,185.00 | 0.0982 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 7,404.12 | 0.1351 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 882.21 | 1.1335 | 2.2000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 689.10 | 1.4512 | 2.6000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 393.80 | 2.5393 | 5.6000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 395.33 | 2.5295 | 5.3000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 146.09 | 6.8450 | 37.7000 |
| Append 100 items (Tail insertion) | 158.88 | 6.2940 | 16.8000 |
| Prepend 100 items (Head insertion) | 132.54 | 7.5450 | 22.4000 |
| Reverse list (1000 items diff & swap) | 158.57 | 6.3065 | 17.6000 |
| Filter/Remove 500 items | 156.65 | 6.3835 | 21.1000 |
| Clear all items | 157.72 | 6.3405 | 16.8000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,072.00 | 0.9328 | 2.3000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 168.71 | 5.9275 | 16.3000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 1,002.40 | 0.9976 | 2.6000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 330.04 | 3.0299 | 13.8000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 16,318.25 | 0.0613 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 17,796.00 | 0.0562 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,452.00 | 0.0803 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 597.32 | 1.6741 | 3.8000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 560.00 | 1.7857 | 4.5000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 62.38 | 16.0298 | 35.1000 |
| Mount/Unmount 100 components (10 cycles) | 33.06 | 30.2510 | 51.5000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 916.36 | 1.0913 | 4.1000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 923.33 | 1.0830 | 5.1000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,158.00 | 0.4634 | 0.8000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 894,832.00 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 387,506.17 | 0.0026 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 60,837.94 | 0.0164 | 0.1000 |

> **Technical Analysis**: Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
