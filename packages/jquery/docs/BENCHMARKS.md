# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| ---------- | ---------- | ----- | ------- |
| **Text Binding** | Update (100el × 50) | 1.6K ops/sec | Direct text node synchronization |
| **Class Binding** | Toggle (100el × 100) | 1.6K ops/sec | Class list manipulation |
| **List Render** | Reconciliation (100 items) | 2.0K ops/sec | Keyed 3-pass reconciliation |
| **Input (DOM→Atom)** | 100 events | 2.0K ops/sec | Direct event-to-atom synchronization |
| **Todo App** | Full workflow | 15.2K ops/sec | Batch-optimized workflow execution |
| **Dashboard** | Fan-in chain | 215.4 ops/sec | Multi-level propagation chain |

---

## Running Benchmarks

These commands can be executed either from the monorepo root (using workspace filters) or directly within the `packages/jquery` directory:

### From the Monorepo Root

```bash
# Run all jQuery benchmarks
pnpm --filter @but212/atom-effect-jquery bench

# Run only micro-benchmarks
pnpm --filter @but212/atom-effect-jquery bench:micro

# Run only macro-benchmarks
pnpm --filter @but212/atom-effect-jquery bench:macro
```

### From the `packages/jquery` Directory

```bash
# Run all jQuery benchmarks
pnpm bench

# Run only micro-benchmarks
pnpm bench:micro

# Run only macro-benchmarks
pnpm bench:macro
```

## Benchmark Categories

### Micro-Benchmarks

Located in `__benchmarks__/micro/`, these test individual binding operations in isolation:

- **Binding**: `atomText`, `atomHtml`, `atomClass`, `atomCss`, `atomAttr`, `atomProp`, `atomShow/Hide`, `atomBind`.
- **List**: `atomList` initial render, append, removal, shuffle, and bind callbacks.
- **Input**: `atomVal`, `atomChecked`, and debounced updates.
- **Lens**: Creation, reading, writing, and propagation through lenses.

### Macro-Benchmarks

Located in `__benchmarks__/macro/`, these test combined DOM scenarios:

- **Todo App**: Add, toggle, filter, and delete operations with full DOM rendering.
- **Dashboard**: Multi-widget updates, mount/unmount cycles, and computed-to-DOM chains.
- **Form Scaling**: Verification of O(1) field dispatch performance across different form sizes.

## Interpreting Results

### Reading the Numbers

- **ops/sec (Hz)**: Operations per second.
- **Mean (ms)**: Average time per operation.
- **p99 (ms)**: 99th percentile latency (execution time for 99% of operations).

### Performance Metrics

| Metric | Performance Target | Technical Significance |
| -------- | ---------------- | -------------- |
| **Text propagation** | >100 ops/sec | Frequency exceeding 60fps refresh rate |
| **List render (100)** | >150 ops/sec | Update frequency for common list sizes |
| **DOM→Atom events** | >500 ops/sec | Synchronous input processing frequency |
| **Full workflow** | >1K ops/sec | Execution frequency for complex state changes |

### Performance Indicators

- **Binding creation <30 ops/sec**: Indicates high DOM manipulation overhead during binding initialization.
- **List render (100) <20 ops/sec**: Indicates potential reconciliation bottlenecks.
- **DOM→Atom <100 ops/sec**: Indicates event processing latency.
- **Mount/unmount <10 ops/sec**: Indicates potential resource management or cleanup overhead.

## Latest Results

**Version**: v0.34.0
**Last Updated**: 2026-06-20
**Environment**:

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

---

### Benchmark Highlights

| Benchmark | Result | Technical Context |
| ---------- | ------ | -------- |
| atomText update (100el × 50) | 1.6K ops/sec | Frequency for 5,000 total text node updates |
| atomClass toggle (100el × 100) | 1.6K ops/sec | Frequency for 10,000 total class list toggles |
| atomList reconciliation (100 items) | 2.0K ops/sec | Frequency for 100-item reconciliation cycles |
| atomVal DOM→Atom (100 events) | 2.0K ops/sec | Frequency for 100 sequential input events |
| Todo full workflow | 15.2K ops/sec | Frequency for combined CRUD operations |
| Dashboard fan-in | 215.4 ops/sec | Frequency for multi-level fan-in propagation |
| atomForm O(1) Scaling | 11.6K ops/sec | Validates consistent performance across form sizes |

## Contributing Benchmarks

When adding new benchmarks:

1. **Micro**: Test a single DOM binding operation in isolation.
2. **Macro**: Test a combined DOM workflow with rendering.

Refer to [CONTRIBUTING.md](../../../CONTRIBUTING.md#benchmarks) for further details.

## Detailed Results

**Last Updated**: 2026-06-20
**Version**: v0.34.0

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> These benchmarks are executed in a Chromium browser environment. Results include DOM rendering costs such as layout, paint, and event processing.

---

### 1. Micro-Benchmarks

#### Bindings: One-way Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Native: create 100 text nodes | 9,320.19 | 0.0959 | 0.3000 |
| jQuery: create 100 text elements | 2,180.85 | 0.5098 | 1.8170 |
| atom-effect: create 100 text bindings (atomText) | 1,651.43 | 0.6583 | 2.8000 |
| atom-effect: create 100 HTML bindings (atomHtml) | 1,057.90 | 1.0094 | 3.7100 |
| Native: update text (100 elements x 50 updates) | 348.33 | 3.0772 | 9.1000 |
| jQuery: update text (100 elements x 50 updates) | 125.43 | 8.2375 | 15.4040 |
| atom-effect: update text (100 elements x 50 updates) | 1,612.14 | 0.6699 | 2.1560 |
| atom-effect: update html (100 elements x 20 updates) | 1,063.89 | 0.9949 | 3.0900 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,585.52 | 0.6831 | 3.5000 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,479.40 | 0.7296 | 4.0300 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 967.01 | 1.0842 | 4.0920 |

#### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 718.95 | 1.5036 | 7.0350 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 246.38 | 4.1288 | 8.4000 |
| select multiple options (100 selects x 50 updates) | 224.20 | 4.8425 | 15.0760 |
| radio check toggle (100 radio groups x 100 updates) | 153.69 | 6.6570 | 11.8000 |
| sequential chain calls (text+class+css+show) x 100 elements | 480.65 | 2.1554 | 5.6000 |
| unified atomBind (text+class+css+show) x 100 elements | 558.05 | 1.8662 | 5.9000 |

#### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomForm initial setup x 10 forms | 59.74 | 17.0585 | 21.6000 |
| atomForm update via state (10 forms x 50 updates) | 38.75 | 26.3670 | 36.6030 |
| atomForm update via DOM trigger (10 forms x 50 events) | 30.09 | 33.8520 | 39.8020 |
| atomForm setup with validation hooks x 10 forms | 27.05 | 37.6275 | 48.5160 |

#### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| jQuery: manual render 1000 items | 1,788.41 | 0.5955 | 2.2210 |
| atom-effect: atomList render 1000 items | 197.52 | 5.3280 | 13.2150 |
| atom-effect: atomList render 1000 items (with bind callback) | 81.20 | 12.6520 | 21.7010 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 1,982.00 | 0.5431 | 1.3000 |
| Reconciliation: remove 50 items | 1,990.26 | 0.5456 | 1.2000 |

#### Mounting: Component Lifecycle

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| atomMount initial setup (100 elements) | 1,327.93 | 0.8212 | 2.1000 |
| atomMount replacement (10 elements x 10 re-mounts) | 3,317.41 | 0.3290 | 0.7000 |
| atomUnmount (100 elements) | 1,277.77 | 0.8752 | 4.7640 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 9,796.35 | 0.0878 | 0.2000 |

#### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| sanitize small safe HTML | 16,101,696.20 | 0.0001 | 0.0000 |
| sanitize medium safe HTML | 16,301,289.00 | 0.0001 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 16,475,294.54 | 0.0001 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 16,325,859.54 | 0.0001 | 0.0000 |
| scrub recursively nested srcdoc payloads | 16,702,943.98 | 0.0001 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 74,938.66 | 0.0120 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 99,976.61 | 0.0092 | 0.1000 |
| mitigate complex DOM Clobbering payload | 16,807,002.25 | 0.0001 | 0.0000 |

#### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Standard input event propagation (100 events) | 4,262.07 | 0.2690 | 0.5000 |
| IME Composition input overhead (50 composition cycles) | 3,387.06 | 0.3360 | 0.5000 |
| Checkbox change event propagation (100 changes) | 7,068.83 | 0.1719 | 0.3000 |

#### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Single reactive binding setup (atomText x 100) | 1,596.55 | 0.6797 | 2.5750 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 6,389.43 | 0.1861 | 0.3000 |
| Synchronous path updates (10 elements x 50 updates) | 11,290.66 | 0.0712 | 0.2000 |
| Asynchronous path updates (10 elements x 50 updates) | 9,299.73 | 0.0991 | 0.2000 |

#### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 1,344.54 | 0.9035 | 0.9000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 946.69 | 1.0730 | 1.9000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 532.93 | 1.9034 | 3.0750 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 536.18 | 1.8943 | 3.4650 |

#### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| No-op (Same reference, no diffing) | 206.20 | 5.7065 | 16.3010 |
| Append 100 items (Tail insertion) | 207.13 | 5.6410 | 15.8040 |
| Prepend 100 items (Head insertion) | 210.39 | 5.4755 | 15.0000 |
| Reverse list (1000 items diff & swap) | 207.42 | 5.6835 | 16.6060 |
| Filter/Remove 500 items | 207.03 | 5.6885 | 16.4020 |
| Clear all items | 208.20 | 5.6745 | 16.5110 |

#### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| cleanup() - non-reactive 1000 elements tree scan | 1,435.28 | 0.7365 | 1.8000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 248.51 | 4.1754 | 11.0220 |

#### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 elements x 20 updates (Debug Disabled) | 1,573.39 | 0.6899 | 1.2000 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 547.83 | 2.0181 | 9.6970 |

---

### 2. Macro-Benchmarks

#### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 15,220.24 | 0.0505 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 14,515.70 | 0.0529 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 10,458.43 | 0.0787 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 312.91 | 3.3511 | 8.8550 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 302.04 | 3.4317 | 8.8000 |

#### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 100 widgets batch update (50 rounds) | 64.69 | 15.7208 | 26.8200 |
| Mount/Unmount 100 components (10 cycles) | 33.95 | 30.5640 | 55.9340 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 979.04 | 1.1122 | 3.4600 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 962.55 | 1.0989 | 3.2080 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 215.44 | 4.6599 | 6.0160 |

#### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x100) | 78,739.40 | 0.0114 | 0.1000 |
| Update 1 field in 100-field form (x100) | 11,564.74 | 0.0675 | 0.2000 |
| Update 1 field in 1000-field form (O(1) validation, x100) | 1,503.89 | 0.6725 | 0.9000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
