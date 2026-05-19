# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category | Key Metric | Value | Technical Context |
| :--- | :--- | :--- | :--- |
| **SlotBuffer** | push (small) | 343.8K ops/sec | Internal high-performance buffer (x100) |
| **Option** | isSome check | 259.8K ops/sec | Reactive-compatible Option type (x100) |
| **Result** | ok creation | 259.2K ops/sec | Error handling primitive (x100) |
| **Type Guard** | isPromise | 301.1K ops/sec | Fast async primitive detection (x100) |

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

**Version**: v0.33.0
**Last Updated**: 2026-05-19
**Environment**:

- **Node.js**: v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

> [!NOTE]
> For a complete breakdown of all test cases and raw data, refer to the **[Detailed Benchmark Results](./BENCHMARKS_DETAILED.md)**.
