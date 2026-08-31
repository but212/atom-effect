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
| Native: create 100 text nodes | 8,421.16 | 0.1187 | 0.3000 |
| jQuery: create 100 text elements | 1,465.56 | 0.6823 | 1.7000 |
| atom-effect: create 100 text bindings (atomText) | 1,092.24 | 0.9156 | 2.3000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 635.87 | 1.5726 | 5.1000 |
| Native: update text (100 elements x 50 updates) | 266.49 | 3.7524 | 12.4000 |
| jQuery: update text (100 elements x 50 updates) | 93.83 | 10.6580 | 21.3000 |
| atom-effect: update text (100 elements x 50 updates) | 976.41 | 1.0242 | 4.1000 |
| atom-effect: update html (100 elements x 20 updates) | 618.32 | 1.6173 | 5.9000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,002.80 | 0.9972 | 4.5000 |
| atom-effect: update CSS (100 elements x 50 updates) | 978.32 | 1.0222 | 5.1000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 520.74 | 1.9203 | 3.5000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 412.46 | 2.4245 | 9.0000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 133.56 | 7.4870 | 12.4000 |
| select multiple options (100 selects x 50 updates) | 101.73 | 9.8300 | 26.0000 |
| radio check toggle (100 radio groups x 100 updates) | 74.87 | 13.3560 | 19.6000 |
| sequential chain calls (text+class+css+show) x 100 elements | 251.15 | 3.9817 | 9.6000 |
| unified atomBind (text+class+css+show) x 100 elements | 320.84 | 3.1168 | 7.6000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 94.48 | 10.5840 | 19.5000 |
| atomForm update via state (10 forms x 50 updates) | 42.07 | 23.7705 | 35.6000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 51.31 | 19.4885 | 29.5000 |
| atomForm setup with validation hooks x 10 forms | 56.51 | 17.6960 | 23.9000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 50,651.93 | 0.0197 | 0.1000 |
| setup lazy atomFetch | 166,899.89 | 0.0060 | 0.1000 |
| trigger refetch on dependency update | 10,585.94 | 0.0945 | 0.2000 |
| trigger fetch with sync transformation pipeline | 18,400.00 | 0.0543 | 0.2000 |
| rapid dependency updates causing multiple aborts (50 times) | 12,416.00 | 0.0805 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,183.53 | 0.8449 | 3.5000 |
| atom-effect: atomList render 1000 items | 279.41 | 3.5789 | 11.4000 |
| atom-effect: atomList render 1000 items (with bind callback) | 78.76 | 12.6970 | 23.4000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,499.50 | 0.4001 | 0.9000 |
| Reconciliation: remove 50 items | 2,618.48 | 0.3819 | 0.7000 |

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
| atomMount initial setup (100 elements) | 880.12 | 1.1362 | 6.8000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,344.00 | 0.4266 | 0.8000 |
| atomUnmount (100 elements) | 841.41 | 1.1885 | 7.5000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,426.16 | 0.1187 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 4,944,558.54 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 4,978,445.00 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,044,529.55 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,091,946.00 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 4,994,795.52 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 49,715.00 | 0.0201 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 71,821.82 | 0.0139 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,061,387.00 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,555.00 | 0.3914 | 0.6000 |
| IME Composition input overhead (50 composition cycles) | 1,737.48 | 0.5755 | 0.8000 |
| Checkbox change event propagation (100 changes) | 3,554.98 | 0.2813 | 0.4000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,006.70 | 0.9933 | 2.3000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,426.66 | 0.2918 | 0.4000 |
| Synchronous path updates (10 elements x 50 updates) | 7,470.25 | 0.1339 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 6,492.00 | 0.1540 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 942.34 | 1.0612 | 2.3000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 777.46 | 1.2862 | 2.7000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 414.30 | 2.4137 | 5.0000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 414.92 | 2.4101 | 4.5000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 159.69 | 6.2620 | 20.5000 |
| Append 100 items (Tail insertion) | 160.42 | 6.2335 | 20.2000 |
| Prepend 100 items (Head insertion) | 156.07 | 6.4075 | 21.2000 |
| Reverse list (1000 items diff & swap) | 159.83 | 6.2565 | 21.2000 |
| Filter/Remove 500 items | 162.76 | 6.1440 | 19.3000 |
| Clear all items | 159.08 | 6.2860 | 20.7000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,019.18 | 0.9812 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 189.00 | 5.2910 | 14.2000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 977.51 | 1.0230 | 5.0000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 267.52 | 3.7381 | 15.0000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 16,893.54 | 0.0592 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 18,264.00 | 0.0548 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,322.51 | 0.0812 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 553.19 | 1.8077 | 4.6000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 540.41 | 1.8504 | 4.3000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 65.02 | 15.3798 | 28.1000 |
| Mount/Unmount 100 components (10 cycles) | 32.78 | 30.5059 | 58.9000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 987.27 | 1.0129 | 3.4000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 993.20 | 1.0068 | 5.7000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,548.50 | 0.3924 | 0.7000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 923,955.07 | 0.0011 | 0.1000 |
| Update 1 field in 100-field form (x10) | 400,149.32 | 0.0025 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 55,430.00 | 0.0180 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
