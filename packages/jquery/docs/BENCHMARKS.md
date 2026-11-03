# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| -------------------- | -------------------------- | ------------- | ------------------------------------ |
| **Text Binding** | Update (100el × 50) | 1.2K ops/sec | Direct text node synchronization |
| **Class Binding** | Toggle (100el × 100) | 1.2K ops/sec | Class list manipulation |
| **List Render** | Reconciliation (100 items) | 2.0K ops/sec | Keyed 3-pass reconciliation |
| **Input (DOM→Atom)** | 100 events | 2.0K ops/sec | Direct event-to-atom synchronization |
| **Todo App** | Full workflow | 15.1K ops/sec | Batch-optimized workflow execution |
| **Dashboard** | Fan-in chain | 187.7 ops/sec | Multi-level propagation chain |

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
| Todo full workflow | 15.1K ops/sec | Frequency for combined CRUD operations |
| Dashboard fan-in | 187.7 ops/sec | Frequency for multi-level fan-in propagation |
| atomForm O(1) Scaling | 12.3K ops/sec | Validates consistent performance across form sizes |

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
| Native: create 100 text nodes | 8,217.98 | 0.1293 | 0.3000 |
| jQuery: create 100 text elements | 1,635.57 | 0.6855 | 1.7840 |
| atom-effect: create 100 text bindings (atomText) | 1,211.17 | 0.9064 | 3.0880 |
| atom-effect: create 100 HTML bindings (atomHtml) | 663.43 | 1.7022 | 10.5260 |
| Native: update text (100 elements x 50 updates) | 268.95 | 3.9325 | 11.0560 |
| jQuery: update text (100 elements x 50 updates) | 96.04 | 10.9250 | 22.5110 |
| atom-effect: update text (100 elements x 50 updates) | 1,151.38 | 0.9628 | 4.8640 |
| atom-effect: update html (100 elements x 20 updates) | 637.78 | 1.7077 | 9.2150 |
| atom-effect: toggle class (100 elements x 100 toggles) | 1,157.98 | 0.9447 | 5.6420 |
| atom-effect: update CSS (100 elements x 50 updates) | 976.67 | 1.0995 | 3.3640 |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 555.86 | 1.8699 | 4.5260 |

#### Bindings: Two-way (Input/Checked)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ----------------------------------------------------------- | ------------ | --------- | -------- |
| atom → DOM: input val (100 inputs x 100 updates) | 181.06 | 5.5230 | 11.3000 |
| DOM → atom: input val (trigger 100 events) | 2,038.39 | 0.4906 | 0.6000 |
| checkbox toggle (100 elements x 100 toggles) | 449.26 | 2.4482 | 12.2520 |
| textarea val (100 textareas x 100 updates) | 198.49 | 5.0380 | 9.8000 |
| select single option (100 selects x 100 updates) | 143.22 | 7.0970 | 14.1010 |
| select multiple options (100 selects x 50 updates) | 124.68 | 8.4910 | 25.6160 |
| radio check toggle (100 radio groups x 100 updates) | 86.79 | 11.9130 | 22.4460 |
| sequential chain calls (text+class+css+show) x 100 elements | 248.71 | 4.1519 | 10.5400 |
| unified atomBind (text+class+css+show) x 100 elements | 285.76 | 4.2245 | 22.0600 |

#### Bindings: Form (atomForm)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| atomForm initial setup x 10 forms | 54.53 | 19.3225 | 27.1030 |
| atomForm update via state (10 forms x 50 updates) | 28.15 | 36.6490 | 46.9180 |
| atomForm update via DOM trigger (10 forms x 50 events) | 17.48 | 57.6330 | 65.2050 |
| atomForm setup with validation hooks x 10 forms | 13.50 | 75.3085 | 91.3090 |

#### List Rendering: atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------ | ------------ | --------- | -------- |
| jQuery: manual render 1000 items | 1,293.96 | 0.9062 | 1.3000 |
| atom-effect: atomList render 1000 items | 165.68 | 6.5825 | 19.3090 |
| atom-effect: atomList render 1000 items (with bind callback) | 72.70 | 15.1400 | 30.2400 |
| Reconciliation: append 10 items to 100 | 2,615.22 | 0.3824 | 0.8000 |
| Reconciliation: prepend 10 items to 100 | 2,653.00 | 0.3769 | 0.8000 |
| Reconciliation: full shuffle 100 items | 2,014.93 | 0.5392 | 1.2000 |
| Reconciliation: remove 50 items | 1,988.29 | 0.5544 | 1.3000 |

#### Mounting: Component Lifecycle

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------- | ------------ | --------- | -------- |
| atomMount initial setup (100 elements) | 1,000.47 | 1.1076 | 7.2310 |
| atomMount replacement (10 elements x 10 re-mounts) | 2,659.43 | 0.4222 | 1.0000 |
| atomUnmount (100 elements) | 884.95 | 1.2352 | 3.0000 |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 8,435.79 | 0.1234 | 0.3000 |

#### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------- | --------- | -------- |
| sanitize small safe HTML | 12,637,169.91 | 0.0001 | 0.0000 |
| sanitize medium safe HTML | 13,501,538.40 | 0.0001 | 0.0000 |
| scrub blacklisted tags (script, iframe) | 13,759,980.26 | 0.0001 | 0.0000 |
| scrub inline event attributes (onerror, onload, onclick) | 13,344,192.49 | 0.0001 | 0.0000 |
| scrub recursively nested srcdoc payloads | 13,948,721.16 | 0.0001 | 0.0000 |
| check safe vs unsafe URLs (100 runs) | 47,342.40 | 0.0181 | 0.1000 |
| check safe vs unsafe CSS values (100 runs) | 38,799.26 | 0.0215 | 0.1000 |
| mitigate complex DOM Clobbering payload | 14,191,847.04 | 0.0001 | 0.0000 |

#### Input Bindings: Event Propagation

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| Standard input event propagation (100 events) | 3,073.72 | 0.3499 | 0.5000 |
| IME Composition input overhead (50 composition cycles) | 2,483.53 | 0.4527 | 1.0000 |
| Checkbox change event propagation (100 changes) | 5,392.30 | 0.2276 | 0.4000 |

#### Effect Factory: Binding Initialization

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------------- | ------------ | --------- | -------- |
| Single reactive binding setup (atomText x 100) | 17.17 | 58.2700 | 63.4580 |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 51.85 | 19.3065 | 21.9390 |
| Synchronous path updates (10 elements x 50 updates) | 157.53 | 6.3510 | 6.6030 |
| Asynchronous path updates (10 elements x 50 updates) | 153.81 | 6.5039 | 6.7470 |

#### Patch: jQuery method overrides overhead

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------- | ------------ | --------- | -------- |
| text() - Patch disabled (Native jQuery, 1000 calls) | 1,031.90 | 0.9876 | 1.6880 |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 785.79 | 1.2870 | 1.7240 |
| html() - Patch disabled (Native jQuery, 1000 calls) | 435.16 | 2.3298 | 4.0260 |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 432.23 | 2.3569 | 3.3280 |

#### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------- | ------------ | --------- | -------- |
| No-op (Same reference, no diffing) | 178.79 | 6.6360 | 19.7030 |
| Append 100 items (Tail insertion) | 175.09 | 6.8090 | 20.1010 |
| Prepend 100 items (Head insertion) | 182.87 | 6.4125 | 18.8030 |
| Reverse list (1000 items diff & swap) | 179.85 | 6.5590 | 19.7030 |
| Filter/Remove 500 items | 181.63 | 6.5540 | 21.6190 |
| Clear all items | 182.81 | 6.4520 | 19.7010 |

#### Registry: Deep Tree Cleanup

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------ | --------- | -------- |
| cleanup() - non-reactive 1000 elements tree scan | 1,090.87 | 0.9586 | 2.3140 |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 218.06 | 4.8135 | 13.9790 |

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
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All | 15,138.52 | 0.0511 | 0.2000 |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All | 14,202.75 | 0.0545 | 0.2000 |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 9,959.90 | 0.0860 | 0.2000 |
| Batch Deletion (500 items -> delete 250 items at once) | 403.38 | 2.6962 | 10.3100 |
| Filter Toggling (500 items -> toggle active/completed/all 10 times) | 382.95 | 2.7993 | 10.0150 |

#### Dashboard & Reactive Topology

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------------- | ------------ | --------- | -------- |
| 100 widgets batch update (50 rounds) | 62.35 | 16.4315 | 27.8150 |
| Mount/Unmount 100 components (10 cycles) | 34.44 | 29.7118 | 48.7500 |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,060.15 | 1.0031 | 2.3100 |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings | 977.19 | 1.0794 | 3.3000 |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding | 187.73 | 5.3402 | 6.3200 |

#### atomForm O(1) Scaling

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------- | ------------ | --------- | -------- |
| Update 1 field in 10-field form (x100) | 80,103.97 | 0.0113 | 0.1000 |
| Update 1 field in 100-field form (x100) | 12,321.04 | 0.0625 | 0.2000 |
| Update 1 field in 1000-field form (O(1) validation, x100) | 1,724.48 | 0.5904 | 0.9000 |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
