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
| Native: create 100 text nodes | 7,878.21 | 0.1269 | 0.3000 |
| jQuery: create 100 text elements | 1,308.22 | 0.7644 | 2.2000 |
| atom-effect: create 100 text bindings (atomText) | 979.94 | 1.0205 | 3.4000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 619.32 | 1.6147 | 5.0000 |
| Native: update text (100 elements x 50 updates) | 260.38 | 3.8406 | 11.3000 |
| jQuery: update text (100 elements x 50 updates) | 89.32 | 11.1955 | 20.1000 |
| atom-effect: update text (100 elements x 50 updates) | 1,032.90 | 0.9682 | 4.4000 |
| atom-effect: update html (100 elements x 20 updates) | 569.89 | 1.7547 | 6.0000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,041.81 | 0.9599 | 5.9000 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,006.49 | 0.9936 | 2.6000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 644.29 | 1.5521 | 3.9000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 455.36 | 2.1961 | 10.3000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 155.75 | 6.4205 | 11.3000 |
| select multiple options (100 selects x 50 updates) | 126.25 | 7.9205 | 14.3000 |
| radio check toggle (100 radio groups x 100 updates) | 83.80 | 11.9330 | 18.6000 |
| sequential chain calls (text+class+css+show) x 100 elements | 336.97 | 2.9677 | 7.0000 |
| unified atomBind (text+class+css+show) x 100 elements | 413.80 | 2.4166 | 8.0000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 138.55 | 7.2175 | 20.8000 |
| atomForm update via state (10 forms x 50 updates) | 60.58 | 16.5060 | 24.5000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 32.82 | 30.4665 | 38.3000 |
| atomForm setup with validation hooks x 10 forms | 56.61 | 17.6655 | 24.8000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 38,620.45 | 0.0259 | 0.1000 |
| setup lazy atomFetch | 170,074.99 | 0.0059 | 0.1000 |
| trigger refetch on dependency update | 14,372.13 | 0.0696 | 0.2000 |
| trigger fetch with sync transformation pipeline | 29,975.00 | 0.0334 | 0.1000 |
| rapid dependency updates causing multiple aborts (50 times) | 16,597.00 | 0.0603 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,054.68 | 0.9482 | 2.2000 |
| atom-effect: atomList render 1000 items | 261.53 | 3.8237 | 13.7000 |
| atom-effect: atomList render 1000 items (with bind callback) | 68.26 | 14.6500 | 29.5000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,532.24 | 0.3949 | 0.7000 |
| Reconciliation: remove 50 items | 2,554.74 | 0.3914 | 0.8000 |

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
| atomMount initial setup (100 elements) | 870.65 | 1.1486 | 7.9000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,270.64 | 0.4404 | 1.0000 |
| atomUnmount (100 elements) | 857.71 | 1.1659 | 8.9000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,684.13 | 0.1152 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 5,227,316.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 5,189,923.00 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,221,096.89 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,270,275.97 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 5,268,248.18 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 61,740.00 | 0.0162 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 79,716.03 | 0.0125 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,168,493.15 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,384.52 | 0.4194 | 0.7000 |
| IME Composition input overhead (50 composition cycles) | 1,896.24 | 0.5274 | 0.9000 |
| Checkbox change event propagation (100 changes) | 3,797.62 | 0.2633 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 994.00 | 1.0060 | 4.1000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,661.63 | 0.2731 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 9,805.91 | 0.1020 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 7,149.00 | 0.1399 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 821.43 | 1.2174 | 3.9000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 687.11 | 1.4554 | 2.5000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 376.44 | 2.6565 | 6.0000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 382.77 | 2.6125 | 5.9000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 145.88 | 6.8550 | 18.2000 |
| Append 100 items (Tail insertion) | 144.24 | 6.9330 | 18.2000 |
| Prepend 100 items (Head insertion) | 138.84 | 7.2025 | 24.0000 |
| Reverse list (1000 items diff & swap) | 143.67 | 6.9605 | 20.5000 |
| Filter/Remove 500 items | 140.33 | 7.1260 | 23.8000 |
| Clear all items | 144.07 | 6.9410 | 17.8000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,026.08 | 0.9746 | 2.2000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 168.34 | 5.9405 | 16.7000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 917.08 | 1.0904 | 5.1000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 322.26 | 3.1031 | 14.1000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 17,514.17 | 0.0571 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 16,937.54 | 0.0590 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,329.18 | 0.0811 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 549.96 | 1.8183 | 4.2000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 531.82 | 1.8803 | 4.8000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 66.93 | 14.9416 | 26.4000 |
| Mount/Unmount 100 components (10 cycles) | 34.43 | 29.0462 | 42.8000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,001.00 | 0.9990 | 2.7000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 992.34 | 1.0077 | 4.7000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,065.86 | 0.4841 | 0.6000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 898,597.33 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 399,432.67 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 61,521.90 | 0.0163 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
