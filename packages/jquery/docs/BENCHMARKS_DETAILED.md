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
| Native: create 100 text nodes | 8,162.18 | 0.1225 | 0.3000 |
| jQuery: create 100 text elements | 1,433.14 | 0.6978 | 1.6000 |
| atom-effect: create 100 text bindings (atomText) | 1,090.56 | 0.9170 | 2.5000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 648.61 | 1.5418 | 4.0000 |
| Native: update text (100 elements x 50 updates) | 264.95 | 3.7743 | 11.9000 |
| jQuery: update text (100 elements x 50 updates) | 88.03 | 11.3595 | 16.7000 |
| atom-effect: update text (100 elements x 50 updates) | 1,061.15 | 0.9424 | 4.1000 |
| atom-effect: update html (100 elements x 20 updates) | 616.81 | 1.6212 | 5.9000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,108.11 | 0.9024 | 4.3000 |
| atom-effect: update CSS (100 elements x 50 updates) | 977.00 | 1.0235 | 5.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 684.59 | 1.4607 | 3.3000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 486.66 | 2.0548 | 8.7000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 156.96 | 6.3710 | 10.7000 |
| select multiple options (100 selects x 50 updates) | 124.02 | 8.0635 | 23.8000 |
| radio check toggle (100 radio groups x 100 updates) | 86.25 | 11.5945 | 18.1000 |
| sequential chain calls (text+class+css+show) x 100 elements | 348.44 | 2.8699 | 7.6000 |
| unified atomBind (text+class+css+show) x 100 elements | 440.43 | 2.2705 | 6.8000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 90.22 | 11.0845 | 16.8000 |
| atomForm update via state (10 forms x 50 updates) | 92.38 | 10.8250 | 20.8000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 60.93 | 16.4125 | 25.3000 |
| atomForm setup with validation hooks x 10 forms | 59.32 | 16.8575 | 24.1000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 48,464.00 | 0.0206 | 0.1000 |
| setup lazy atomFetch | 172,160.00 | 0.0058 | 0.1000 |
| trigger refetch on dependency update | 12,250.77 | 0.0816 | 0.2000 |
| trigger fetch with sync transformation pipeline | 18,935.00 | 0.0528 | 0.2000 |
| rapid dependency updates causing multiple aborts (50 times) | 16,393.52 | 0.0610 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,129.21 | 0.8856 | 3.7000 |
| atom-effect: atomList render 1000 items | 269.95 | 3.7044 | 9.4000 |
| atom-effect: atomList render 1000 items (with bind callback) | 74.30 | 13.4585 | 27.0000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,583.48 | 0.3871 | 0.8000 |
| Reconciliation: remove 50 items | 2,601.48 | 0.3844 | 0.8000 |

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
| atomMount initial setup (100 elements) | 877.39 | 1.1397 | 7.7000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,231.55 | 0.4481 | 0.9000 |
| atomUnmount (100 elements) | 862.65 | 1.1592 | 8.2000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,296.17 | 0.1205 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 5,210,345.97 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 5,197,332.27 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 5,221,334.87 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 5,224,342.57 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 5,263,640.00 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 62,127.00 | 0.0161 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 80,909.91 | 0.0124 | 0.1000 |
| mitigate complex DOM Clobbering payload | 5,295,756.42 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,454.26 | 0.4075 | 0.6000 |
| IME Composition input overhead (50 composition cycles) | 1,923.81 | 0.5198 | 0.9000 |
| Checkbox change event propagation (100 changes) | 3,672.00 | 0.2723 | 0.8000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,047.58 | 0.9546 | 2.8000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,785.62 | 0.2642 | 0.5000 |
| Synchronous path updates (10 elements x 50 updates) | 9,838.63 | 0.1016 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 7,389.26 | 0.1353 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 867.57 | 1.1526 | 2.3000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 681.73 | 1.4669 | 2.1000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 387.19 | 2.5827 | 5.8000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 388.88 | 2.5715 | 5.5000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 147.41 | 6.7840 | 19.9000 |
| Append 100 items (Tail insertion) | 152.42 | 6.5610 | 18.4000 |
| Prepend 100 items (Head insertion) | 152.73 | 6.5475 | 18.9000 |
| Reverse list (1000 items diff & swap) | 154.38 | 6.4775 | 18.8000 |
| Filter/Remove 500 items | 153.81 | 6.5015 | 17.5000 |
| Clear all items | 155.78 | 6.4195 | 18.1000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,025.08 | 0.9755 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 178.36 | 5.6065 | 14.2000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 1,012.80 | 0.9874 | 3.0000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 358.56 | 2.7890 | 13.7000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 21,948.67 | 0.0456 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 22,853.33 | 0.0438 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 14,674.00 | 0.0681 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 532.91 | 1.8765 | 4.6000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 498.77 | 2.0049 | 4.7000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 73.78 | 13.5532 | 24.3000 |
| Mount/Unmount 100 components (10 cycles) | 38.11 | 26.2379 | 39.6000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,000.80 | 0.9992 | 2.9000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 996.47 | 1.0035 | 4.9000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,501.83 | 0.3997 | 0.7000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 865,620.29 | 0.0012 | 0.1000 |
| Update 1 field in 100-field form (x10) | 427,850.14 | 0.0023 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 58,558.67 | 0.0171 | 0.1000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
