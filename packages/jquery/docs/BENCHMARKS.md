# Benchmark Documentation — atom-effect-jquery

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Context |
| ---------- | ---------- | ----- | ------- |
| **Text Binding** | Propagation (100el × 50) | 103 ops/sec | ~9.7ms per round |
| **Class Binding** | Toggle (100el × 100) | 135 ops/sec | ~7.4ms per round |
| **List Render** | 100 items | 70 ops/sec | ~14.3ms per render |
| **Input (DOM→Atom)** | 100 events | 887 ops/sec | ~1.1ms per round |
| **Todo App** | Full workflow | 1,940 ops/sec | ~0.52ms per cycle |
| **Dashboard** | Fan-in chain | 620 ops/sec | ~1.6ms per update |

## Running Benchmarks

```bash
# Run all jquery benchmarks
pnpm bench

# Run only micro-benchmarks
pnpm bench:micro

# Run only macro-benchmarks
pnpm bench:macro
```

## Benchmark Categories

### Micro-Benchmarks

Located in `__benchmarks__/micro/`, these test individual binding operations:

- **Binding**: atomText, atomHtml, atomClass, atomCss, atomAttr, atomProp, atomShow/Hide, atomBind
- **List**: atomList render, append, remove, shuffle, partial update, bind callback
- **Input**: atomVal, atomChecked, debounce

### Macro-Benchmarks

Located in `__benchmarks__/macro/`, these test real-world DOM scenarios:

- **Todo App**: Add, toggle, filter, delete with DOM rendering
- **Dashboard**: Multi-widget binding, mount/unmount cycles, computed→DOM chains

## Interpreting Results

### Reading the Numbers

- **ops/sec (Hz)**: Operations per second. **Higher is better**.
- **Mean (ms)**: Average time per operation.
- **p99 (ms)**: 99th percentile latency (worst-case for 99% of operations).

### What Good Performance Looks Like

| Metric | Good Performance | Why It Matters |
| -------- | ---------------- | -------------- |
| **Text propagation** | >80 ops/sec | Smooth text updates at 60fps |
| **List render (100)** | >50 ops/sec | Responsive list operations |
| **DOM→Atom events** | >500 ops/sec | Low-latency input handling |
| **Full workflow** | >1K ops/sec | Production-ready throughput |

### Red Flags

- **Binding creation <30 ops/sec**: DOM overhead too high
- **List render (100) <20 ops/sec**: Reconciliation issues
- **DOM→Atom <100 ops/sec**: Event handler bottleneck
- **Mount/unmount <10 ops/sec**: Memory leak or cleanup issues

## Latest Results

**Version**: v0.21.0
**Last Updated**: 2026-02-12
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> **[View Detailed Results](./BENCHMARKS_DETAILED.md)**

### Key Highlights

| Benchmark | Result | Analysis |
| ---------- | ------ | -------- |
| atomText propagation | 103 ops/sec | Consistent DOM text updates |
| atomClass toggle | 135 ops/sec | Fast class manipulation |
| atomList render (100) | 70 ops/sec | Efficient list reconciliation |
| atomVal DOM→Atom | 887 ops/sec | Near-instant input sync |
| Todo full workflow | 1,940 ops/sec | Production-ready |
| Dashboard fan-in | 620 ops/sec | Efficient computed→DOM chain |

## Contributing Benchmarks

When adding new benchmarks:

1. **Micro**: Test a single DOM binding operation in isolation
2. **Macro**: Test a realistic DOM workflow (e.g., "todo app with rendering")

See [CONTRIBUTING.md](../../../CONTRIBUTING.md#benchmarks) for details.
