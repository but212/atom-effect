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
| Native: create 100 text nodes | 8,377.16 | 0.1194 | 0.3000 |
| jQuery: create 100 text elements | 1,499.55 | 0.6669 | 1.4000 |
| atom-effect: create 100 text bindings (atomText) | 1,034.79 | 0.9664 | 2.4000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 605.39 | 1.6518 | 4.5000 |
| Native: update text (100 elements x 50 updates) | 263.79 | 3.7909 | 12.9000 |
| jQuery: update text (100 elements x 50 updates) | 95.48 | 10.4730 | 22.9000 |
| atom-effect: update text (100 elements x 50 updates) | 1,052.00 | 0.9506 | 3.2000 |
| atom-effect: update html (100 elements x 20 updates) | 638.43 | 1.5664 | 5.4000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,073.46 | 0.9316 | 3.1000 |
| atom-effect: update CSS (100 elements x 50 updates) | 910.82 | 1.0979 | 3.1000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 532.84 | 1.8767 | 4.0000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 386.54 | 2.5871 | 9.4000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 131.63 | 7.5970 | 16.0000 |
| select multiple options (100 selects x 50 updates) | 100.67 | 9.9330 | 25.0000 |
| radio check toggle (100 radio groups x 100 updates) | 74.50 | 13.4225 | 21.1000 |
| sequential chain calls (text+class+css+show) x 100 elements | 266.97 | 3.7457 | 7.0000 |
| unified atomBind (text+class+css+show) x 100 elements | 318.97 | 3.1351 | 7.0000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 95.67 | 10.4530 | 17.4000 |
| atomForm update via state (10 forms x 50 updates) | 57.38 | 17.4270 | 25.8000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 31.87 | 31.3815 | 51.3000 |
| atomForm setup with validation hooks x 10 forms | 60.14 | 16.6280 | 27.7000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 44,174.58 | 0.0226 | 0.1000 |
| setup lazy atomFetch | 170,450.95 | 0.0059 | 0.1000 |
| trigger refetch on dependency update | 12,029.80 | 0.0831 | 0.2000 |
| trigger fetch with sync transformation pipeline | 20,389.00 | 0.0490 | 0.2000 |
| rapid dependency updates causing multiple aborts (50 times) | 11,533.49 | 0.0867 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,236.13 | 0.8090 | 1.0000 |
| atom-effect: atomList render 1000 items | 124.08 | 8.0595 | 13.3000 |
| atom-effect: atomList render 1000 items (with bind callback) | 61.22 | 16.3340 | 27.5000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 1,358.46 | 0.7361 | 1.4000 |
| Reconciliation: remove 50 items | 1,346.46 | 0.7427 | 1.6000 |

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
| atomMount initial setup (100 elements) | 916.00 | 1.0917 | 6.1000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,419.79 | 0.4133 | 0.7000 |
| atomUnmount (100 elements) | 853.23 | 1.1720 | 7.1000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,437.22 | 0.1185 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 5,010,066.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 5,042,393.00 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,012,976.70 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,047,724.00 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 4,870,531.95 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 51,230.00 | 0.0195 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 76,861.00 | 0.0130 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,012,311.77 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,525.99 | 0.3959 | 0.6000 |
| IME Composition input overhead (50 composition cycles) | 1,996.60 | 0.5009 | 0.8000 |
| Checkbox change event propagation (100 changes) | 4,003.00 | 0.2498 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 957.56 | 1.0443 | 2.5000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,324.00 | 0.3008 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 8,907.00 | 0.1123 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 6,485.00 | 0.1542 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 896.19 | 1.1158 | 2.3000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 725.00 | 1.3793 | 2.5000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 397.56 | 2.5153 | 4.7000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 397.84 | 2.5136 | 5.3000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 156.56 | 6.3875 | 18.1000 |
| Append 100 items (Tail insertion) | 163.83 | 6.1040 | 18.3000 |
| Prepend 100 items (Head insertion) | 166.43 | 6.0085 | 17.9000 |
| Reverse list (1000 items diff & swap) | 164.58 | 6.0760 | 17.3000 |
| Filter/Remove 500 items | 164.73 | 6.0705 | 17.8000 |
| Clear all items | 159.63 | 6.2645 | 17.7000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 991.90 | 1.0082 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 188.91 | 5.2935 | 11.8000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 912.73 | 1.0956 | 2.7000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 277.33 | 3.6058 | 12.2000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 17,332.84 | 0.0577 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 18,891.48 | 0.0529 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,490.50 | 0.0801 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 278.89 | 3.5857 | 9.8000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 268.26 | 3.7278 | 10.8000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 65.55 | 15.2556 | 31.2000 |
| Mount/Unmount 100 components (10 cycles) | 34.86 | 28.6830 | 46.5000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 990.40 | 1.0097 | 3.6000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,032.18 | 0.9688 | 4.7000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 226.86 | 4.4079 | 5.5000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 823,245.78 | 0.0012 | 0.1000 |
| Update 1 field in 100-field form (x10) | 325,593.63 | 0.0031 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 43,992.40 | 0.0227 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
