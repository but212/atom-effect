# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| ---------- | ---------- | ----- | ------- |
| **Text Binding** | Update (100el × 50) | 976.4 ops/sec | Direct text node synchronization |
| **Class Binding** | Toggle (100el × 100) | 1.0K ops/sec | Class list manipulation |
| **List Render** | Reconciliation (100 items) | 2.5K ops/sec | Keyed 3-pass reconciliation |
| **Input (DOM→Atom)** | 100 events | 2.0K ops/sec | Direct event-to-atom synchronization |
| **Todo App** | Full workflow | 16.9K ops/sec | Batch-optimized workflow execution |
| **Dashboard** | Fan-in chain | 2.5K ops/sec | Multi-level propagation chain |

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
- **Web Component**: Setup/teardown, context injection, and Shadow DOM boundary traversal.
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

> [!TIP]
> [View Detailed Results](./BENCHMARKS_DETAILED.md) for per-operation breakdown.

---

### Benchmark Highlights

| Benchmark | Result | Technical Context |
| ---------- | ------ | -------- |
| atomText update (100el × 50) | 976.4 ops/sec | Frequency for 5,000 total text node updates |
| atomClass toggle (100el × 100) | 1.0K ops/sec | Frequency for 10,000 total class list toggles |
| atomList reconciliation (100 items) | 2.5K ops/sec | Frequency for 100-item reconciliation cycles |
| atomVal DOM→Atom (100 events) | 2.0K ops/sec | Frequency for 100 sequential input events |
| Todo full workflow | 16.9K ops/sec | Frequency for combined CRUD operations |
| Dashboard fan-in | 2.5K ops/sec | Frequency for multi-level fan-in propagation |
| atomForm O(1) Scaling | 400.1K ops/sec | Validates consistent performance across form sizes |

## Contributing Benchmarks

When adding new benchmarks:

1. **Micro**: Test a single DOM binding operation in isolation.
2. **Macro**: Test a combined DOM workflow with rendering.

Refer to [CONTRIBUTING.md](../../../CONTRIBUTING.md#benchmarks) for further details.
