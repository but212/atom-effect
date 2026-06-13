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
| Native: create 100 text nodes | 8,363.00 | 0.1196 | 0.3000 |
| jQuery: create 100 text elements | 1,365.18 | 0.7325 | 1.8000 |
| atom-effect: create 100 text bindings (atomText) | 1,038.27 | 0.9631 | 2.7000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 639.81 | 1.5630 | 4.2000 |
| Native: update text (100 elements x 50 updates) | 253.74 | 3.9410 | 12.8000 |
| jQuery: update text (100 elements x 50 updates) | 87.9044 | 11.3760 | 23.4000 |
| atom-effect: update text (100 elements x 50 updates) | 932.81 | 1.0720 | 4.2000 |
| atom-effect: update html (100 elements x 20 updates) | 607.00 | 1.6474 | 6.1000 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,003.30 | 0.9967 | 5.1000 |
| atom-effect: update CSS (100 elements x 50 updates) | 995.40 | 1.0046 | 5.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 637.74 | 1.5680 | 3.4000 |

### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 176.73 | 5.6585 | 12.5000 |
| DOM → atom: input val (trigger 100 events) | 2,086.58 | 0.4793 | 0.8000 |
| checkbox toggle (100 elements x 100 toggles) | 465.95 | 2.1461 | 8.6000 |
| textarea val (100 textareas x 100 updates) | 190.31 | 5.2545 | 10.8000 |
| select single option (100 selects x 100 updates) | 147.48 | 6.7805 | 11.8000 |
| select multiple options (100 selects x 50 updates) | 117.19 | 8.5335 | 24.8000 |
| radio check toggle (100 radio groups x 100 updates) | 84.0654 | 11.8955 | 17.4000 |
| sequential chain calls (text+class+css+show) x 100 elements | 309.60 | 3.2300 | 7.7000 |
| unified atomBind (text+class+css+show) x 100 elements | 396.41 | 2.5227 | 6.8000 |

### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 72.3275 | 13.8260 | 26.7000 |
| atomForm update via state (10 forms x 50 updates) | 31.0559 | 32.2000 | 41.1000 |
| atomForm update via DOM trigger (10 forms x 50 events) | 51.2728 | 19.5035 | 29.4000 |
| atomForm setup with validation hooks x 10 forms | 43.0126 | 23.2490 | 30.0000 |

### Fetch: Setup & Dependency Pipeline

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| setup eager atomFetch | 51,913.00 | 0.0193 | 0.1000 |
| setup lazy atomFetch | 176,937.31 | 0.0057 | 0.1000 |
| trigger refetch on dependency update | 17,113.29 | 0.0584 | 0.2000 |
| trigger fetch with sync transformation pipeline | 26,797.32 | 0.0373 | 0.1000 |
| rapid dependency updates causing multiple aborts (50 times) | 15,863.41 | 0.0630 | 0.2000 |

### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,197.64 | 0.8350 | 1.0000 |
| atom-effect: atomList render 1000 items | 239.38 | 4.1775 | 9.5000 |
| atom-effect: atomList render 1000 items (with bind callback) | 69.9888 | 14.2880 | 28.3000 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,572.49 | 0.3887 | 0.9000 |
| Reconciliation: remove 50 items | 2,601.22 | 0.3844 | 0.8000 |

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
| atomMount initial setup (100 elements) | 854.15 | 1.1708 | 6.6000 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,226.33 | 0.4492 | 0.9000 |
| atomUnmount (100 elements) | 831.67 | 1.2024 | 6.5000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,940.00 | 0.1119 | 0.3000 |

### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 4,810,474.00 | 0.0002 | 0.0000 |
| sanitize medium safe HTML | 4,877,516.00 | 0.0002 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 4,900,841.92 | 0.0002 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 4,770,489.95 | 0.0002 | 0.0000 |
| scrub recursively nested srcdoc payloads | 4,925,082.49 | 0.0002 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 55,590.44 | 0.0180 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 69,280.07 | 0.0144 | 0.1000 |
| mitigate complex DOM Clobbering payload | 4,888,695.13 | 0.0002 | 0.0000 |

### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 2,424.00 | 0.4125 | 0.8000 |
| IME Composition input overhead (50 composition cycles) | 1,950.22 | 0.5128 | 0.9000 |
| Checkbox change event propagation (100 changes) | 3,621.55 | 0.2761 | 0.5000 |

### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 941.25 | 1.0624 | 6.6000 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,475.30 | 0.2877 | 0.4000 |
| Synchronous path updates (10 elements x 50 updates) | 9,377.00 | 0.1066 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 6,741.33 | 0.1483 | 0.3000 |

### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 837.66 | 1.1938 | 2.3000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 620.19 | 1.6124 | 2.8000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 397.44 | 2.5161 | 6.2000 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 399.16 | 2.5052 | 7.1000 |

### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 143.85 | 6.9515 | 18.9000 |
| Append 100 items (Tail insertion) | 141.46 | 7.0690 | 33.8000 |
| Prepend 100 items (Head insertion) | 144.60 | 6.9155 | 19.0000 |
| Reverse list (1000 items diff & swap) | 143.11 | 6.9875 | 18.1000 |
| Filter/Remove 500 items | 142.73 | 7.0060 | 20.1000 |
| Clear all items | 142.96 | 6.9950 | 22.5000 |

### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,055.79 | 0.9472 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 176.49 | 5.6660 | 15.1000 |

### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 971.90 | 1.0289 | 3.7000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 303.18 | 3.2984 | 14.9000 |

---

## 2. Macro-Benchmarks

### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 15,670.96 | 0.0638 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 17,734.67 | 0.0564 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 12,502.00 | 0.0800 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 598.31 | 1.6714 | 4.0000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 566.36 | 1.7656 | 4.1000 |

### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 61.38 | 16.2925 | 34.5000 |
| Mount/Unmount 100 components (10 cycles) | 31.43 | 31.8200 | 48.6000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 899.58 | 1.1116 | 3.8000 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 911.09 | 1.0976 | 2.8000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 2,035.86 | 0.4912 | 0.7000 |

### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x10) | 850,969.33 | 0.0012 | 0.1000 |
| Update 1 field in 100-field form (x10) | 373,774.67 | 0.0027 | 0.1000 |
| Update 1 field in 1000-field form (O(1) validation, x10) | 58,003.33 | 0.0172 | 0.2000 |

> **Technical Analysis**: Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
