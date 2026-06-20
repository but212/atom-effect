# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| :--- | :--- | :--- | :--- |
| **SlotBuffer** | push (small) | 2.10M ops/sec | Internal high-performance buffer (x10) |
| **Option** | isSome check | 1.97M ops/sec | Reactive-compatible Option type (x10) |
| **Result** | ok creation | 1.78M ops/sec | Error handling primitive (x10) |
| **Type Guard** | isPromise | 2.12M ops/sec | Fast async primitive detection (x10) |

---

## Running Benchmarks

```bash
# Run all utility benchmarks
pnpm bench:all
```

## Benchmark Categories

### 1. Data Structures

- **SlotBuffer**: A specialized buffer optimized for frequent additions and iterations, used in the dependency tracking engine.
- **Option / Result**: Functional programming primitives designed for safe value handling without the overhead of heavy abstractions.

### 2. Utilities

- **Type Guards**: High-performance type detection for common JS primitives and library-specific types.
- **Native Comparison**: Performance baselines comparing library primitives against native JS language features.

---

## Latest Results

**Version**: v0.34.0
**Last Updated**: 2026-06-20
**Environment**:

- **Node.js**: v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> For a complete breakdown of all test cases and raw data, refer to the **[Detailed Benchmark Results](./BENCHMARKS_DETAILED.md)**.
