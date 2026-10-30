# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category             | Key Metric                 | Value         | Technical Context                    |
| -------------------- | -------------------------- | ------------- | ------------------------------------ |
| **Text Binding**     | Update (100el × 50)        | 1.8K ops/sec  | Direct text node synchronization     |
| **Class Binding**    | Toggle (100el × 100)       | 1.8K ops/sec  | Class list manipulation              |
| **List Render**      | Reconciliation (100 items) | 3.2K ops/sec  | Keyed 3-pass reconciliation          |
| **Input (DOM→Atom)** | 100 events                 | 2.0K ops/sec  | Direct event-to-atom synchronization |
| **Todo App**         | Full workflow              | 23.4K ops/sec | Batch-optimized workflow execution   |
| **Dashboard**        | Fan-in chain               | 209.0 ops/sec | Multi-level propagation chain        |

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

| Benchmark                           | Result        | Technical Context                                  |
| ----------------------------------- | ------------- | -------------------------------------------------- |
| atomText update (100el × 50)        | 1.8K ops/sec  | Frequency for 5,000 total text node updates        |
| atomClass toggle (100el × 100)      | 1.8K ops/sec  | Frequency for 10,000 total class list toggles      |
| atomList reconciliation (100 items) | 3.2K ops/sec  | Frequency for 100-item reconciliation cycles       |
| atomVal DOM→Atom (100 events)       | 2.0K ops/sec  | Frequency for 100 sequential input events          |
| Todo full workflow                  | 23.4K ops/sec | Frequency for combined CRUD operations             |
| Dashboard fan-in                    | 209.0 ops/sec | Frequency for multi-level fan-in propagation       |
| atomForm O(1) Scaling               | 13.1K ops/sec | Validates consistent performance across form sizes |

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

| Benchmark Case                                             | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------- | ------------ | --------- | -------- |
| Native: create 100 text nodes                              | 9,397.34     | 0.0945    | 0.3000   |
| jQuery: create 100 text elements                           | 2,308.31     | 0.4819    | 2.0000   |
| atom-effect: create 100 text bindings (atomText)           | 1,779.39     | 0.6283    | 3.3090   |
| atom-effect: create 100 HTML bindings (atomHtml)           | 1,093.20     | 0.9972    | 4.2000   |
| Native: update text (100 elements x 50 updates)            | 398.04       | 2.7144    | 8.9000   |
| jQuery: update text (100 elements x 50 updates)            | 162.37       | 6.5860    | 14.4030  |
| atom-effect: update text (100 elements x 50 updates)       | 1,826.26     | 0.6128    | 3.8760   |
| atom-effect: update html (100 elements x 20 updates)       | 1,113.30     | 0.9792    | 4.4000   |
| atom-effect: toggle class (100 elements x 100 toggles)     | 1,821.79     | 0.6014    | 2.5320   |
| atom-effect: update CSS (100 elements x 50 updates)        | 1,649.58     | 0.6665    | 4.2000   |
| atom-effect: toggle visibility (100 elements x 50 toggles) | 1,077.11     | 0.9708    | 1.4000   |

#### Bindings: Two-way (Input/Checked)

| Benchmark Case                                              | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ----------------------------------------------------------- | ------------ | --------- | -------- |
| atom → DOM: input val (100 inputs x 100 updates)            | 181.06       | 5.5230    | 11.3000  |
| DOM → atom: input val (trigger 100 events)                  | 2,038.39     | 0.4906    | 0.6000   |
| checkbox toggle (100 elements x 100 toggles)                | 795.72       | 1.3484    | 7.7000   |
| textarea val (100 textareas x 100 updates)                  | 198.49       | 5.0380    | 9.8000   |
| select single option (100 selects x 100 updates)            | 273.15       | 3.7834    | 9.4360   |
| select multiple options (100 selects x 50 updates)          | 218.86       | 4.6743    | 10.6740  |
| radio check toggle (100 radio groups x 100 updates)         | 161.17       | 6.4045    | 12.1030  |
| sequential chain calls (text+class+css+show) x 100 elements | 588.39       | 2.1470    | 8.2050   |
| unified atomBind (text+class+css+show) x 100 elements       | 662.12       | 1.5826    | 6.3000   |

#### Bindings: Form (atomForm)

| Benchmark Case                                         | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| atomForm initial setup x 10 forms                      | 50.09        | 21.2650   | 30.0020  |
| atomForm update via state (10 forms x 50 updates)      | 27.74        | 36.8610   | 50.8000  |
| atomForm update via DOM trigger (10 forms x 50 events) | 19.11        | 52.5645   | 61.5140  |
| atomForm setup with validation hooks x 10 forms        | 15.32        | 66.9295   | 85.2020  |

#### List Rendering: atomList

| Benchmark Case                                               | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------ | ------------ | --------- | -------- |
| jQuery: manual render 1000 items                             | 2,047.25     | 0.5365    | 2.6620   |
| atom-effect: atomList render 1000 items                      | 290.82       | 3.6974    | 11.9840  |
| atom-effect: atomList render 1000 items (with bind callback) | 99.14        | 10.4115   | 22.9100  |
| Reconciliation: append 10 items to 100                       | 2,615.22     | 0.3824    | 0.8000   |
| Reconciliation: prepend 10 items to 100                      | 2,653.00     | 0.3769    | 0.8000   |
| Reconciliation: full shuffle 100 items                       | 3,234.31     | 0.3612    | 0.9000   |
| Reconciliation: remove 50 items                              | 3,260.49     | 0.3595    | 0.9000   |

#### Mounting: Component Lifecycle

| Benchmark Case                                          | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------- | ------------ | --------- | -------- |
| atomMount initial setup (100 elements)                  | 1,425.05     | 0.7802    | 2.4960   |
| atomMount replacement (10 elements x 10 re-mounts)      | 3,826.60     | 0.3136    | 0.4000   |
| atomUnmount (100 elements)                              | 1,526.47     | 1.1083    | 4.1500   |
| mount and deep unmount (depth 4, breadth 3 ~ 120 nodes) | 10,538.12    | 0.0786    | 0.2000   |

#### Sanitize: Safe Content & Vulnerability checks

| Benchmark Case                                           | ops/sec (Hz)  | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------- | --------- | -------- |
| sanitize small safe HTML                                 | 16,280,249.11 | 0.0001    | 0.0000   |
| sanitize medium safe HTML                                | 19,101,365.10 | 0.0001    | 0.0000   |
| scrub blacklisted tags (script, iframe)                  | 19,200,812.21 | 0.0001    | 0.0000   |
| scrub inline event attributes (onerror, onload, onclick) | 19,277,878.18 | 0.0001    | 0.0000   |
| scrub recursively nested srcdoc payloads                 | 18,912,551.28 | 0.0001    | 0.0000   |
| check safe vs unsafe URLs (100 runs)                     | 79,916.21     | 0.0113    | 0.1000   |
| check safe vs unsafe CSS values (100 runs)               | 124,439.32    | 0.0075    | 0.1000   |
| mitigate complex DOM Clobbering payload                  | 19,198,562.21 | 0.0001    | 0.0000   |

#### Input Bindings: Event Propagation

| Benchmark Case                                         | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------ | ------------ | --------- | -------- |
| Standard input event propagation (100 events)          | 6,068.06     | 0.2057    | 0.4000   |
| IME Composition input overhead (50 composition cycles) | 4,409.66     | 0.2821    | 0.6000   |
| Checkbox change event propagation (100 changes)        | 8,150.27     | 0.1396    | 0.3000   |

#### Effect Factory: Binding Initialization

| Benchmark Case                                                   | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------------- | ------------ | --------- | -------- |
| Single reactive binding setup (atomText x 100)                   | 1,649.90     | 0.6598    | 2.5850   |
| Map reactive binding setup (atomClass with 5 keys x 20 elements) | 6,587.52     | 0.1820    | 0.3000   |
| Synchronous path updates (10 elements x 50 updates)              | 11,572.31    | 0.0692    | 0.2000   |
| Asynchronous path updates (10 elements x 50 updates)             | 9,890.26     | 0.0876    | 0.2000   |

#### Patch: jQuery method overrides overhead

| Benchmark Case                                       | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------- | ------------ | --------- | -------- |
| text() - Patch disabled (Native jQuery, 1000 calls)  | 1,678.06     | 0.6152    | 0.9000   |
| text() - Patch enabled (Reactive jQuery, 1000 calls) | 1,272.45     | 0.8287    | 1.1000   |
| html() - Patch disabled (Native jQuery, 1000 calls)  | 723.82       | 2.1248    | 4.0200   |
| html() - Patch enabled (Reactive jQuery, 1000 calls) | 719.90       | 1.4382    | 3.9100   |

#### List Diffing: Reconciliation computation overhead (1000 items)

| Benchmark Case                        | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------- | ------------ | --------- | -------- |
| No-op (Same reference, no diffing)    | 210.67       | 5.5955    | 17.7070  |
| Append 100 items (Tail insertion)     | 203.03       | 5.9435    | 20.6090  |
| Prepend 100 items (Head insertion)    | 205.89       | 5.7855    | 18.5110  |
| Reverse list (1000 items diff & swap) | 207.99       | 5.7130    | 19.3130  |
| Filter/Remove 500 items               | 208.02       | 5.7635    | 18.3200  |
| Clear all items                       | 216.44       | 5.5265    | 19.6030  |

#### Registry: Deep Tree Cleanup

| Benchmark Case                                           | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| -------------------------------------------------------- | ------------ | --------- | -------- |
| cleanup() - non-reactive 1000 elements tree scan         | 1,800.84     | 0.6020    | 1.6000   |
| cleanup() - reactive 1000 elements tree (mixed bindings) | 280.95       | 3.7502    | 10.8240  |

#### Debug Diagnostics: Runtime Overhead

| Benchmark Case                                             | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ---------------------------------------------------------- | ------------ | --------- | -------- |
| 100 elements x 20 updates (Debug Disabled)                 | 1,776.37     | 0.6214    | 0.8000   |
| 100 elements x 20 updates (Debug Enabled - console mocked) | 569.32       | 2.2303    | 12.9600  |

---

### 2. Macro-Benchmarks

#### Todo App Scenarios

| Scenario                                                                             | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| ------------------------------------------------------------------------------------ | ------------ | --------- | -------- |
| Full Workflow (small): Add(20) → Toggle(10) → Filter(active) → Delete(5) → All       | 23,398.71    | 0.0339    | 0.1000   |
| Full Workflow (large): Add(100) → Toggle(50) → Filter(active) → Delete(25) → All     | 20,223.55    | 0.0387    | 0.2000   |
| Full Workflow (massive): Add(500) → Toggle(250) → Filter(active) → Delete(125) → All | 11,565.76    | 0.0684    | 0.2000   |
| Batch Deletion (500 items -> delete 250 items at once)                               | 423.22       | 2.5142    | 8.1040   |
| Filter Toggling (500 items -> toggle active/completed/all 10 times)                  | 404.28       | 2.6234    | 9.0870   |

#### Dashboard & Reactive Topology

| Scenario                                                        | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------------- | ------------ | --------- | -------- |
| 100 widgets batch update (50 rounds)                            | 69.67        | 14.7583   | 26.1900  |
| Mount/Unmount 100 components (10 cycles)                        | 44.52        | 22.9182   | 34.8400  |
| Deep Propagation: 10-level Chain → 100 DOM Widgets (50 updates) | 1,196.22     | 0.9063    | 2.9380   |
| Fan-out: 1 Atom → 100 Computed → 100 DOM Bindings               | 1,155.30     | 0.9220    | 2.6700   |
| Fan-in: 100 Atoms → 1 Computed → 1 DOM Binding                  | 208.97       | 4.8410    | 7.3000   |

#### atomForm O(1) Scaling

| Scenario                                                  | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --------------------------------------------------------- | ------------ | --------- | -------- |
| Update 1 field in 10-field form (x100)                    | 92,105.54    | 0.0099    | 0.1000   |
| Update 1 field in 100-field form (x100)                   | 13,073.14    | 0.0583    | 0.2000   |
| Update 1 field in 1000-field form (O(1) validation, x100) | 1,765.39     | 0.5755    | 0.8000   |

> [!NOTE]
> Field updates scale efficiently from 10 fields (851K ops/sec) to 100 fields (373.8K ops/sec) and 1000 fields (58.0K ops/sec), representing highly optimized performance across form sizes.
