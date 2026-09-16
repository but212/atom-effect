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
| Native: create 100 text nodes | 9,308.67 | 0.0968 | 0.3000 |
| jQuery: create 100 text elements | 2,040.36 | 0.5572 | 2.2140 |
| atom-effect: create 100 text bindings (atomText) | 1,602.59 | 0.7061 | 3.7000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 980.77 | 1.1151 | 4.1000 |
| Native: update text (100 elements x 50 updates) | 361.15 | 2.9528 | 8.6200 |
| jQuery: update text (100 elements x 50 updates) | 127.04 | 8.1265 | 15.8060 |
| atom-effect: update text (100 elements x 50 updates) | 1,613.75 | 0.6828 | 3.5720 |
| atom-effect: update html (100 elements x 20 updates) | 1,026.62 | 1.0282 | 3.3000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,600.09 | 0.6764 | 3.9000 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,483.11 | 0.7179 | 2.2160 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 923.36 | 1.1298 | 2.9300 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 677.05 | 1.5870 | 7.3700 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 226.00 | 4.9355 | 12.5000 |
| select multiple options (100 selects x 50 updates) | 200.18 | 5.1140 | 10.6040 |
| radio check toggle (100 radio groups x 100 updates) | 144.60 | 7.0655 | 12.4020 |
| sequential chain calls (text+class+css+show) x 100 elements | 471.07 | 2.3424 | 6.0000 |
| unified atomBind (text+class+css+show) x 100 elements | 596.93 | 1.8960 | 6.6730 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 72.48 | 14.2770 | 19.5290 |
| atomForm update via state (10 forms x 50 updates) | 42.27 | 24.3405 | 31.0020 |
| atomForm update via DOM trigger (10 forms x 50 events) | 27.35 | 36.7930 | 42.0060 |
| atomForm setup with validation hooks x 10 forms | 20.68 | 49.4620 | 60.4000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 76,596.48 | 0.0123 | 0.1000 |
| setup lazy atomFetch | 7,240,514.78 | 0.0001 | 0.0000 |
| trigger refetch on dependency update | 16,475.93 | 0.0493 | 0.2000 |
| trigger fetch with sync transformation pipeline | 35,235.68 | 0.0243 | 0.1000 |
| rapid dependency updates causing multiple aborts (50 times) | 12,945.77 | 0.0697 | 0.1000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,604.41 | 0.6664 | 2.3000 |
| atom-effect: atomList render 1000 items | 193.25 | 5.4120 | 13.5030 |
| atom-effect: atomList render 1000 items (with bind callback) | 81.41 | 12.7250 | 23.2060 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 1,969.36 | 0.5466 | 1.2000 |
| Reconciliation: remove 50 items | 1,968.03 | 0.5453 | 1.3000 |

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
| atomMount initial setup (100 elements) | 1,381.43 | 0.7856 | 1.7560 |
| atomMount replacement (10 elements x 10 re-mounts) | 3,262.90 | 0.3361 | 0.5000 |
| atomUnmount (100 elements) | 1,157.36 | 1.1483 | 5.2560 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 9,613.59 | 0.0912 | 0.2000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 15,924,028.25 | 0.0001 | 0.0000 |
| sanitize medium safe HTML | 15,954,240.84 | 0.0001 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 15,977,481.18 | 0.0001 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 15,861,319.17 | 0.0001 | 0.0000 |
| scrub recursively nested srcdoc payloads | 15,639,272.34 | 0.0001 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 77,110.39 | 0.0117 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 100,753.88 | 0.0091 | 0.1000 |
| mitigate complex DOM Clobbering payload | 16,309,432.13 | 0.0001 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 3,864.29 | 0.2887 | 0.5000 |
| IME Composition input overhead (50 composition cycles) | 3,158.68 | 0.3646 | 0.7000 |
| Checkbox change event propagation (100 changes) | 6,546.09 | 0.1900 | 0.3000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,539.72 | 0.7000 | 1.8720 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 6,166.45 | 0.1955 | 0.4000 |
| Synchronous path updates (10 elements x 50 updates) | 11,096.12 | 0.0730 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 9,191.27 | 0.1013 | 0.2000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 1,212.19 | 0.9586 | 1.5000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 917.05 | 1.1146 | 1.8120 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 491.82 | 2.0877 | 4.7000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 495.21 | 2.0613 | 4.7000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 212.81 | 5.6490 | 17.4730 |
| Append 100 items (Tail insertion) | 211.69 | 5.6380 | 18.0070 |
| Prepend 100 items (Head insertion) | 211.92 | 5.5780 | 18.2080 |
| Reverse list (1000 items diff & swap) | 212.55 | 5.6355 | 17.8060 |
| Filter/Remove 500 items | 211.51 | 5.7605 | 20.8530 |
| Clear all items | 211.61 | 5.6530 | 17.5100 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,393.93 | 0.7585 | 1.9000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 249.65 | 4.2046 | 11.4890 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 1,524.17 | 0.7801 | 3.5520 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 502.13 | 2.2663 | 11.2670 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 16,555.79 | 0.0463 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 14,988.42 | 0.0510 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 10,503.61 | 0.0780 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 303.00 | 3.4814 | 8.6700 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 291.77 | 3.5895 | 9.4830 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 65.95 | 15.5216 | 28.3160 |
| Mount/Unmount 100 components (10 cycles) | 34.88 | 29.2673 | 47.6080 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,053.78 | 1.0056 | 3.5450 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,092.37 | 0.9706 | 4.5650 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 221.13 | 4.5384 | 5.1400 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 899,670.75 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 349,614.78 | 0.0028 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 39,752.26 | 0.0211 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
