# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| -------------------- | -------------------------- | ------------- | ------------------------------------ |
| **Text Binding** | Update (100el × 50) | 1.1K ops/sec | Direct text node synchronization |
| **Class Binding** | Toggle (100el × 100) | 1.1K ops/sec | Class list manipulation |
| **List Render** | Reconciliation (100 items) | 2.0K ops/sec | Keyed 3-pass reconciliation |
| **Input (DOM→Atom)** | 100 events | 2.0K ops/sec | Direct event-to-atom synchronization |
| **Todo App** | Full workflow | 32.4K ops/sec | Batch-optimized workflow execution |
| **Dashboard** | Fan-in chain | 155.1 ops/sec | Multi-level propagation chain |

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
| atomText update (100el × 50) | 1.1K ops/sec | Frequency for 5,000 total text node updates |
| atomClass toggle (100el × 100) | 1.1K ops/sec | Frequency for 10,000 total class list toggles |
| atomList reconciliation (100 items) | 2.0K ops/sec | Frequency for 100-item reconciliation cycles |
| atomVal DOM→Atom (100 events) | 2.0K ops/sec | Frequency for 100 sequential input events |
| Todo full workflow | 32.4K ops/sec | Frequency for combined CRUD operations |
| Dashboard fan-in | 155.1 ops/sec | Frequency for multi-level fan-in propagation |
| atomForm O(1) Scaling | 16.0K ops/sec | Validates consistent performance across form sizes |

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
| Native: create 100 text nodes | 8,614.11 | 0.1178 | 0.3000 |
| jQuery: create 100 text elements | 1,620.29 | 0.6854 | 2.4840 |
| atom-effect: create 100 text bindings (atomText) | 1,173.77 | 0.9300 | 3.0250 |
| atom-effect: create 100 HTML bindings (atomHtml) | 684.49 | 1.6377 | 9.3250 |
| Native: update text (100 elements x 50 updates) | 263.92 | 4.1544 | 14.2200 |
| jQuery: update text (100 elements x 50 updates) | 97.54 | 10.6320 | 24.1000 |
| atom-effect: update text (100 elements x 50 updates) | 1,107.53 | 0.9776 | 3.0920 |
| atom-effect: update html (100 elements x 20 updates) | 643.99 | 1.7096 | 8.3640 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,132.97 | 0.9519 | 2.3500 |
| atom-effect: update CSS (100 elements x 50 updates) | 1,001.87 | 1.0618 | 5.8100 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 583.84 | 1.7671 | 3.9200 |

#### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ----------------------------------------------------------- | ------------ | --------- | -------- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 467.33 | 2.3055 | 9.9000 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 148.27 | 6.8420 | 12.9000 |
| select multiple options (100 selects x 50 updates) | 124.55 | 8.5885 | 29.7030 |
| radio check toggle (100 radio groups x 100 updates) | 91.61 | 11.1055 | 18.1000 |
| sequential chain calls (text+class+css+show) x 100 elements | 256.83 | 3.9766 | 8.7960 |
| unified atomBind (text+class+css+show) x 100 elements | 285.71 | 3.5943 | 9.6000 |

#### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| atomForm initial setup x 10 forms | 47.51 | 21.8890 | 29.9000 |
| atomForm update via state (10 forms x 50 updates) | 26.72 | 38.3380 | 50.9040 |
| atomForm update via DOM trigger (10 forms x 50 events) | 18.09 | 55.7560 | 66.3590 |
| atomForm setup with validation hooks x 10 forms | 15.42 | 66.5930 | 86.5420 |

#### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------ | ------------ | --------- | -------- |
| jQuery: manual render 1000 items | 1,400.42 | 0.7799 | 2.3000 |
| atom-effect: atomList render 1000 items | 199.07 | 5.2905 | 14.3020 |
| atom-effect: atomList render 1000 items (with bind callback) | 74.47 | 13.7740 | 26.6030 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,014.93 | 0.5392 | 1.2000 |
| Reconciliation: remove 50 items | 2,000.95 | 0.5554 | 1.3000 |

#### Mounting: Component Lifecycle

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------- | ------------ | --------- | -------- |
| atomMount initial setup (100 elements) | 994.14 | 1.1165 | 6.9200 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,609.10 | 0.4215 | 0.9000 |
| atomUnmount (100 elements) | 934.96 | 1.1589 | 3.9600 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,440.85 | 0.1220 | 0.3000 |

#### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------- | --------- | -------- |
| sanitize small safe HTML | 12,809,881.80 | 0.0001 | 0.0000 |
| sanitize medium safe HTML | 13,381,572.31 | 0.0001 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 13,496,039.80 | 0.0001 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 13,658,419.32 | 0.0001 | 0.0000 |
| scrub recursively nested srcdoc payloads | 14,000,497.09 | 0.0001 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 49,493.52 | 0.0174 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 36,939.37 | 0.0224 | 0.1000 |
| mitigate complex DOM Clobbering payload | 14,110,454.08 | 0.0001 | 0.0000 |

#### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| Standard input event propagation (100 events) | 2,967.98 | 0.3664 | 0.7000 |
| IME Composition input overhead (50 composition cycles) | 2,393.54 | 0.4733 | 1.0000 |
| Checkbox change event propagation (100 changes) | 5,262.09 | 0.2247 | 0.4000 |

#### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------------- | ------------ | --------- | -------- |
| Single reactive binding setup (atomText x 100) | 1,130.75 | 0.9491 | 2.6470 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 3,927.57 | 0.2882 | 0.7000 |
| Synchronous path updates (10 elements x 50 updates) | 8,791.25 | 0.1130 | 0.3000 |
| Asynchronous path updates (10 elements x 50 updates) | 7,080.35 | 0.1695 | 0.4000 |

#### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------- | ------------ | --------- | -------- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 1,046.65 | 0.9617 | 1.1000 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 788.96 | 1.2750 | 1.7000 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 442.18 | 2.2779 | 3.3240 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 415.15 | 2.4232 | 2.8760 |

#### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------- | ------------ | --------- | -------- |
| No-op (Same reference, no diffing) | 171.85 | 6.9130 | 21.9080 |
| Append 100 items (Tail insertion) | 169.51 | 7.1165 | 22.9030 |
| Prepend 100 items (Head insertion) | 173.75 | 6.9290 | 21.9050 |
| Reverse list (1000 items diff & swap) | 170.61 | 7.2660 | 24.5110 |
| Filter/Remove 500 items | 174.15 | 6.9435 | 22.3060 |
| Clear all items | 169.07 | 7.2820 | 25.8240 |

#### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------ | --------- | -------- |
| cleanup() - non-reactive 1000 elements tree scan | 1,089.85 | 0.9625 | 2.5620 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 209.94 | 5.1330 | 15.3050 |

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
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 32,366.36 | 0.0257 | 0.1000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 27,754.90 | 0.0295 | 0.1000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 15,540.94 | 0.0500 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 593.46 | 1.8412 | 7.5860 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 552.32 | 1.9773 | 8.0420 |

#### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------------- | ------------ | --------- | -------- |
| 100 widgets batch update (50 rounds) | 114.67 | 9.1726 | 21.0220 |
| Mount/Unmount 100 components (10 cycles) | 56.67 | 18.5556 | 36.7000 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,737.77 | 0.6359 | 2.3420 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 1,599.80 | 0.6888 | 2.4460 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 155.06 | 6.4754 | 7.7000 |

#### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------- | ------------ | --------- | -------- |
| Update 1 field in 10-field form (x100) | 112,621.87 | 0.0082 | 0.1000 |
| Update 1 field in 100-field form (x100) | 15,956.46 | 0.0476 | 0.2000 |
| Update 1 field in 1000-field form (O(1) validation, x100) | 2,628.19 | 0.3932 | 0.7000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
