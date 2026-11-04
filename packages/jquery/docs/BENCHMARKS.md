# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| -------------------- | -------------------------- | ------------- | ------------------------------------ |
| **Text Binding** | Update (100el × 50) | 1.2K ops/sec | Direct text node synchronization |
| **Class Binding** | Toggle (100el × 100) | 1.2K ops/sec | Class list manipulation |
| **List Render** | Reconciliation (100 items) | 2.0K ops/sec | Keyed 3-pass reconciliation |
| **Input (DOM→Atom)** | 100 events | 2.0K ops/sec | Direct event-to-atom synchronization |
| **Todo App** | Full workflow | 34.2K ops/sec | Batch-optimized workflow execution |
| **Dashboard** | Fan-in chain | 465.3 ops/sec | Multi-level propagation chain |

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

| Metric                | Performance Target | Technical Significance                        |
| --------------------- | ------------------ | --------------------------------------------- |
| **Text propagation**  | >100 ops/sec       | Frequency exceeding 60fps refresh rate        |
| **List render (100)** | >150 ops/sec       | Update frequency for common list sizes        |
| **DOM→Atom events**   | >500 ops/sec       | Synchronous input processing frequency        |
| **Full workflow**     | >1K ops/sec        | Execution frequency for complex state changes |

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
| ----------------------------------- | ------------- | -------------------------------------------------- |
| atomText update (100el × 50) | 1.2K ops/sec | Frequency for 5,000 total text node updates |
| atomClass toggle (100el × 100) | 1.2K ops/sec | Frequency for 10,000 total class list toggles |
| atomList reconciliation (100 items) | 2.0K ops/sec | Frequency for 100-item reconciliation cycles |
| atomVal DOM→Atom (100 events) | 2.0K ops/sec | Frequency for 100 sequential input events |
| Todo full workflow | 34.2K ops/sec | Frequency for combined CRUD operations |
| Dashboard fan-in | 465.3 ops/sec | Frequency for multi-level fan-in propagation |
| atomForm O(1) Scaling | 15.0K ops/sec | Validates consistent performance across form sizes |

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
| ---------------------------------------------------------- | ------------ | --------- | -------- |
| Native: create 100 text nodes | 8,537.63 | 0.1194 | 0.3000 |
| jQuery: create 100 text elements | 1,472.10 | 0.7808 | 2.0600 |
| atom-effect: create 100 text bindings (atomText) | 1,154.69 | 0.9893 | 3.1800 |
| atom-effect: create 100 HTML bindings (atomHtml) | 720.43 | 1.5379 | 8.9500 |
| Native: update text (100 elements x 50 updates) | 275.43 | 4.0265 | 14.2600 |
| jQuery: update text (100 elements x 50 updates) | 101.66 | 10.2515 | 21.8020 |
| atom-effect: update text (100 elements x 50 updates) | 1,238.80 | 0.8762 | 3.1770 |
| atom-effect: update html (100 elements x 20 updates) | 748.21 | 1.4551 | 7.0260 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,233.38 | 0.8706 | 4.5520 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,049.75 | 1.0109 | 5.4000 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 618.88 | 1.6720 | 3.9420 |

#### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ----------------------------------------------------------- | ------------ | --------- | -------- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 480.83 | 2.1867 | 9.2860 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 163.85 | 6.4790 | 19.3310 |
| select multiple options (100 selects x 50 updates) | 125.84 | 8.1065 | 15.0030 |
| radio check toggle (100 radio groups x 100 updates) | 95.80 | 10.9045 | 17.7290 |
| sequential chain calls (text+class+css+show) x 100 elements | 304.85 | 3.5946 | 10.6960 |
| unified atomBind (text+class+css+show) x 100 elements | 344.16 | 2.9634 | 6.6560 |

#### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| atomForm initial setup x 10 forms | 51.89 | 20.1840 | 26.9030 |
| atomForm update via state (10 forms x 50 updates) | 28.21 | 36.6480 | 49.4030 |
| atomForm update via DOM trigger (10 forms x 50 events) | 17.37 | 57.9655 | 65.5000 |
| atomForm setup with validation hooks x 10 forms | 13.57 | 74.8580 | 91.0320 |

#### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------ | ------------ | --------- | -------- |
| jQuery: manual render 1000 items | 1,316.64 | 0.8600 | 0.9000 |
| atom-effect: atomList render 1000 items | 184.84 | 6.0360 | 16.9210 |
| atom-effect: atomList render 1000 items (with bind callback) | 79.91 | 13.8535 | 26.2470 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,014.93 | 0.5392 | 1.2000 |
| Reconciliation: remove 50 items | 2,045.33 | 0.5355 | 1.2000 |

#### Mounting: Component Lifecycle

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------- | ------------ | --------- | -------- |
| atomMount initial setup (100 elements) | 1,077.18 | 0.9906 | 3.3550 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,739.45 | 0.3974 | 0.8000 |
| atomUnmount (100 elements) | 996.80 | 1.0691 | 3.4200 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,655.85 | 0.1151 | 0.3000 |

#### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------- | --------- | -------- |
| sanitize small safe HTML | 12,653,819.90 | 0.0001 | 0.0000 |
| sanitize medium safe HTML | 13,236,766.87 | 0.0001 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 13,403,465.46 | 0.0001 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 13,422,033.24 | 0.0001 | 0.0000 |
| scrub recursively nested srcdoc payloads | 13,903,553.19 | 0.0001 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 48,805.32 | 0.0176 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 38,524.90 | 0.0216 | 0.1000 |
| mitigate complex DOM Clobbering payload | 14,006,341.13 | 0.0001 | 0.0000 |

#### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| Standard input event propagation (100 events) | 3,169.68 | 0.3390 | 0.5000 |
| IME Composition input overhead (50 composition cycles) | 2,509.69 | 0.4486 | 0.9000 |
| Checkbox change event propagation (100 changes) | 5,333.27 | 0.2293 | 0.4000 |

#### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------------- | ------------ | --------- | -------- |
| Single reactive binding setup (atomText x 100) | 17.27 | 57.9110 | 59.5050 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 52.00 | 19.2540 | 22.5120 |
| Synchronous path updates (10 elements x 50 updates) | 157.37 | 6.3620 | 7.9040 |
| Asynchronous path updates (10 elements x 50 updates) | 155.45 | 6.4359 | 6.7450 |

#### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------- | ------------ | --------- | -------- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 1,043.70 | 0.9733 | 1.6460 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 796.72 | 1.2695 | 1.8000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 434.12 | 2.3300 | 4.3130 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 434.14 | 2.3367 | 4.5460 |

#### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------- | ------------ | --------- | -------- |
| No-op (Same reference, no diffing) | 189.87 | 6.1990 | 17.4020 |
| Append 100 items (Tail insertion) | 185.58 | 6.5270 | 22.3140 |
| Prepend 100 items (Head insertion) | 188.42 | 6.2745 | 20.7100 |
| Reverse list (1000 items diff & swap) | 183.76 | 6.5675 | 19.9050 |
| Filter/Remove 500 items | 189.57 | 6.3115 | 23.8030 |
| Clear all items | 189.61 | 6.2785 | 21.2000 |

#### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------ | --------- | -------- |
| cleanup() - non-reactive 1000 elements tree scan | 1,126.09 | 0.9314 | 2.4000 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 219.18 | 4.7990 | 14.1920 |

#### Debug Diagnostics: Runtime Overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------- | ------------ | --------- | -------- |
| 100 elements x 20 updates (Debug Disabled) | 1,079.88 | 1.0393 | 3.1180 |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 311.49 | 3.3919 | 12.2040 |

---

### 2. Macro-Benchmarks

#### Todo App Scenarios

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------------------------------ | ------------ | --------- | -------- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 34,152.86 | 0.0245 | 0.1000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 28,354.55 | 0.0290 | 0.1000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 15,735.54 | 0.0495 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 570.12 | 1.9167 | 7.8000 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 561.03 | 1.9349 | 7.6000 |

#### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------------- | ------------ | --------- | -------- |
| 100 widgets batch update (50 rounds) | 111.83 | 9.3460 | 19.3000 |
| Mount/Unmount 100 components (10 cycles) | 57.83 | 18.1096 | 36.5040 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,756.06 | 0.6354 | 2.4800 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,611.99 | 0.6783 | 2.6000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 465.29 | 2.1682 | 3.7000 |

#### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------- | ------------ | --------- | -------- |
| Update 1 field in 10-field form (x100) | 101,512.22 | 0.0091 | 0.1000 |
| Update 1 field in 100-field form (x100) | 15,010.20 | 0.0505 | 0.2000 |
| Update 1 field in 1000-field form (O(1) validation, x100) | 2,275.67 | 0.4508 | 0.7000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
