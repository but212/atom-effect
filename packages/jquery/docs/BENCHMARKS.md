# Benchmark Documentation — atom-effect-jquery

Benchmarking suite for `@but212/atom-effect-jquery` to measure DOM binding performance and detect regressions.

## Performance Summary

| Category | Key Metric | Value | Context |
| ---------- | ---------- | ----- | ------- |
| **Text Binding** | Update (100el × 50) | 922.6 ops/sec | Efficient set-and-notify |
| **Class Binding** | Toggle (100el × 100) | 938.0 ops/sec | Fast optimized toggle |
| **List Render** | Reconciliation (100 items) | 1,024.9 ops/sec | Smooth list updates |
| **Input (DOM→Atom)** | 100 events | 1,949.6 ops/sec | Minimal event overhead |
| **Todo App** | Full workflow | 12,988.5 ops/sec | High-throughput DOM sync |
| **Dashboard** | Fan-in chain | 5,196.7 ops/sec | Scalable reactive topology |

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
- **Sanitize**: sanitizeHtml with different profiles and batch sizes
- **Lens**: atomLens creation, reading, writing, and propagation

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
| **Text propagation** | >100 ops/sec | Smooth text updates at 60fps |
| **List render (100)** | >150 ops/sec | Responsive list operations |
| **DOM→Atom events** | >500 ops/sec | Low-latency input handling |
| **Full workflow** | >1K ops/sec | Production-ready throughput |

### Red Flags

- **Binding creation <30 ops/sec**: DOM overhead too high
- **List render (100) <20 ops/sec**: Reconciliation issues
- **DOM→Atom <100 ops/sec**: Event handler bottleneck
- **Mount/unmount <10 ops/sec**: Memory leak or cleanup issues

## Latest Results

**Version**: v0.31.0
**Last Updated**: 2026-04-20
**Environment**:

- **Node.js**: v22.x
- **Browser**: Chromium (via Vitest browser mode)
- **OS**: ubuntu-latest (GitHub Actions)

> **[View Detailed Results](./BENCHMARKS_DETAILED.md)**

### Key Highlights

| Benchmark | Result | Analysis |
| ---------- | ------ | -------- |
| atomText update (100el × 50) | 922.6 ops/sec | Consistent DOM text updates |
| atomClass toggle (100el × 100) | 938.0 ops/sec | Fast class manipulation |
| atomList reconciliation (100 items) | 1,024.9 ops/sec | Efficient list reconciliation |
| atomVal DOM→Atom (100 events) | 1,949.6 ops/sec | Near-instant input sync |
| Todo full workflow | 12,988.5 ops/sec | Optimized for web-apps |
| Dashboard fan-in | 5,196.7 ops/sec | Efficient computed→DOM chain |
| atomForm O(1) Scaling | 408.2K ops/sec | O(1) field dispatch validated |

## Contributing Benchmarks

When adding new benchmarks:

1. **Micro**: Test a single DOM binding operation in isolation
2. **Macro**: Test a realistic DOM workflow (e.g., "todo app with rendering")

See [CONTRIBUTING.md](../../../CONTRIBUTING.md#benchmarks) for details.
