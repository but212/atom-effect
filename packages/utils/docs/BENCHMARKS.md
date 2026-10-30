# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category       | Key Metric   | Value          | Technical Context                       |
| :------------- | :----------- | :------------- | :-------------------------------------- |
| **SlotBuffer** | push (small) | 947.4K ops/sec | Internal high-performance buffer (x100) |
| **Option**     | isSome check | 2.04M ops/sec  | Reactive-compatible Option type (x100)  |
| **Result**     | ok creation  | 934.9K ops/sec | Error handling primitive (x100)         |
| **Type Guard** | isPromise    | 1.70M ops/sec  | Fast async primitive detection (x100)   |

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

## Detailed Results

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-06-20
**Version**: v0.34.0
- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

### 1. Option Primitives (x100)

#### Native Comparison (null/undefined) (x100)

| Test Case                  | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------- | :----------- | :-------- | :------- |
| Literal assignment         | 1,704,225.67 | 0.0006    | 0.0006   |
| Null check                 | 2,632,515.04 | 0.0004    | 0.0004   |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004    | 0.0004   |
| Inline ternary map         | 2,617,729.87 | 0.0004    | 0.0007   |
| If-Else branch (mixed)     | 2,557,144.38 | 0.0004    | 0.0004   |

#### Option Operations (x100)

| Test Case            | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------- | :----------- | :-------- | :------- |
| Some creation        | 1,800,793.52 | 0.0006    | 0.0009   |
| isSome               | 2,042,392.33 | 0.0005    | 0.0005   |
| unwrapOr (mixed)     | 811,472.08   | 0.0012    | 0.0013   |
| map                  | 764,269.52   | 0.0014    | 0.0025   |
| match (mixed)        | 1,949,443.39 | 0.0005    | 0.0005   |
| fromNullable (mixed) | 1,778,256.30 | 0.0006    | 0.0006   |

---

### 2. Result Primitives (x100)

#### Native Comparison (try/catch) (x100)

| Test Case                      | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| Literal assignment             | 1,704,225.67 | 0.0006    | 0.0006   |
| Boolean flag check             | 1,700,752.11 | 0.0006    | 0.0006   |
| Ternary error fallback (mixed) | 1,460,396.39 | 0.0007    | 0.0007   |
| Native try/catch (mixed)       | 76,192.05    | 0.0132    | 0.0195   |

#### Result Operations (x100)

| Test Case               | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| Result.ok creation      | 934,922.43   | 0.0011    | 0.0016   |
| Result.err creation     | 935,267.74   | 0.0011    | 0.0015   |
| Result.tryCatch (mixed) | 60,095.73    | 0.0168    | 0.0236   |

---

### 3. Data Structures: SlotBuffer (x100)

| Test Case               | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| push (small, x100)      | 947,363.91   | 0.0011    | 0.0020   |
| push (large, x10)       | 84,030.50    | 0.0123    | 0.0203   |
| has (x100)              | 294,604.53   | 0.0034    | 0.0035   |
| forEach (x100)          | 48,214.19    | 0.0208    | 0.0278   |
| compact (x100)          | 27,037.68    | 0.0375    | 0.0466   |
| some (early exit, x100) | 708,758.72   | 0.0014    | 0.0027   |
| some (full scan, x100)  | 67,166.40    | 0.0149    | 0.0216   |

---

### 4. Utilities: Type Guards (x100)

| Test Case                 | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------ | :----------- | :-------- | :------- |
| isPromise: native promise | 1,699,498.42 | 0.0006    | 0.0006   |
| isPromise: thenable       | 1,706,251.14 | 0.0006    | 0.0006   |
| isPromise: object         | 1,332,333.89 | 0.0008    | 0.0008   |
| isOption: true            | 2,107,975.23 | 0.0005    | 0.0005   |
| isOption: false           | 2,093,706.04 | 0.0005    | 0.0005   |
| isPromise: mixed data     | 1,184,140.27 | 0.0009    | 0.0016   |
