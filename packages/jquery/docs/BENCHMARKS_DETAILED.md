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
| Native: create 100 text nodes | 7,747.60 | 0.1291 | 0.3000 |
| jQuery: create 100 text elements | 1,371.45 | 0.7292 | 1.7000 |
| atom-effect: create 100 text bindings (atomText) | 1,012.39 | 0.9878 | 2.5000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 563.72 | 1.7739 | 5.3000 |
| Native: update text (100 elements x 50 updates) | 258.87 | 3.8629 | 11.3000 |
| jQuery: update text (100 elements x 50 updates) | 88.77 | 11.2645 | 21.3000 |
| atom-effect: update text (100 elements x 50 updates) | 962.81 | 1.0386 | 3.8000 |
| atom-effect: update html (100 elements x 20 updates) | 532.15 | 1.8792 | 6.1000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 940.81 | 1.0629 | 4.6000 |
| atom-effect: update CSS (100 elements x 50 updates) | 872.91 | 1.1456 | 5.3000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 495.60 | 2.0177 | 6.1000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 150.73 | 6.6345 | 14.7000 |
| DOM → atom: input val (trigger 100 events) | 1,960.02 | 0.5102 | 0.7000 |
| checkbox toggle (100 elements x 100 toggles) | 397.68 | 2.5146 | 8.1000 |
| textarea val (100 textareas x 100 updates) | 171.75 | 5.8225 | 9.6000 |
| select single option (100 selects x 100 updates) | 123.89 | 8.0715 | 19.6000 |
| select multiple options (100 selects x 50 updates) | 97.65 | 10.2410 | 20.5000 |
| radio check toggle (100 radio groups x 100 updates) | 67.96 | 14.7155 | 24.9000 |
| sequential chain calls (text+class+css+show) x 100 elements | 238.83 | 4.1870 | 7.9000 |
| unified atomBind (text+class+css+show) x 100 elements | 290.83 | 3.4385 | 7.7000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 95.68 | 10.4510 | 18.9000 |
| atomForm update via state (10 forms x 50 updates) | 44.80 | 22.3210 | 28.8000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 31.47 | 31.7770 | 47.8000 |
| atomForm setup with validation hooks x 10 forms | 57.52 | 17.3855 | 24.7000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 43,585.64 | 0.0229 | 0.1000 |
| setup lazy atomFetch | 165,449.00 | 0.0060 | 0.1000 |
| trigger refetch on dependency update | 13,642.81 | 0.0733 | 0.2000 |
| trigger fetch with sync transformation pipeline | 24,054.00 | 0.0416 | 0.2000 |
| rapid dependency updates causing multiple aborts (50 times) | 14,470.00 | 0.0691 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 992.11 | 1.0080 | 3.4000 |
| atom-effect: atomList render 1000 items | 283.09 | 3.5324 | 11.4000 |
| atom-effect: atomList render 1000 items (with bind callback) | 70.41 | 14.2025 | 28.3000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,635.47 | 0.3794 | 0.8000 |
| Reconciliation: remove 50 items | 2,626.21 | 0.3808 | 0.8000 |

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
| atomMount initial setup (100 elements) | 841.58 | 1.1882 | 3.1000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,209.78 | 0.4525 | 1.0000 |
| atomUnmount (100 elements) | 783.84 | 1.2758 | 7.6000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,111.19 | 0.1233 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 4,887,273.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 4,937,912.21 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 4,980,147.00 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 4,924,366.00 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 4,564,242.58 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 52,407.76 | 0.0191 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 70,581.00 | 0.0142 | 0.1000 |
| mitigate complex DOM Clobbering payload | 4,730,206.00 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,353.76 | 0.4249 | 0.6000 |
| IME Composition input overhead (50 composition cycles) | 1,895.00 | 0.5277 | 0.9000 |
| Checkbox change event propagation (100 changes) | 3,540.00 | 0.2825 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 928.54 | 1.0770 | 2.7000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,169.37 | 0.3155 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 8,402.16 | 0.1190 | 0.3000 |
| Asynchronous path updates (10 elements x 50 updates) | 5,970.00 | 0.1675 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 860.31 | 1.1624 | 2.3000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 676.66 | 1.4778 | 2.8000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 393.80 | 2.5393 | 5.1000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 396.17 | 2.5242 | 5.0000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 157.31 | 6.3570 | 17.6000 |
| Append 100 items (Tail insertion) | 158.00 | 6.3290 | 17.8000 |
| Prepend 100 items (Head insertion) | 155.48 | 6.4315 | 19.9000 |
| Reverse list (1000 items diff & swap) | 159.63 | 6.2645 | 18.4000 |
| Filter/Remove 500 items | 154.01 | 6.4930 | 19.2000 |
| Clear all items | 159.58 | 6.2665 | 18.1000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,032.90 | 0.9682 | 2.1000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 180.78 | 5.5315 | 12.0000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 896.28 | 1.1157 | 3.7000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 257.67 | 3.8810 | 11.6000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 23,516.00 | 0.0425 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 24,077.06 | 0.0415 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 14,610.67 | 0.0684 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 601.01 | 1.6639 | 4.4000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 580.91 | 1.7214 | 4.2000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 65.12 | 15.3551 | 30.2000 |
| Mount/Unmount 100 components (10 cycles) | 38.58 | 25.9186 | 41.9000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 952.29 | 1.0501 | 4.5000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,017.93 | 0.9824 | 6.2000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 1,960.55 | 0.5101 | 1.0000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 901,553.90 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 396,304.91 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 54,470.37 | 0.0184 | 0.1000 |

> **Technical Analysis**: Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
