# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category       | Key Metric   | Value          | Technical Context                       |
| :------------- | :----------- | :------------- | :-------------------------------------- |
| **SlotBuffer** | push (small) | 950.9K ops/sec | Internal high-performance buffer (x100) |
| **Option**     | isSome check | 2.04M ops/sec  | Reactive-compatible Option type (x100)  |
| **Result** | ok creation | 931.7K ops/sec | Error handling primitive (x100) |
| **Type Guard** | isPromise    | 1.24M ops/sec  | Fast async primitive detection (x100)   |

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
| Literal assignment         | 1,245,716.51 | 0.0008    | 0.0008   |
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

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :----------------------------- | :----------- | :-------- | :------- |
| Literal assignment | 1,245,716.51 | 0.0008 | 0.0008 |
| Boolean flag check | 1,247,855.01 | 0.0008 | 0.0008 |
| Ternary error fallback (mixed) | 1,084,553.09 | 0.0009 | 0.0018 |
| Native try/catch (mixed) | 63,392.56 | 0.0159 | 0.0242 |

#### Result Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| Result.ok creation | 931,663.52 | 0.0011 | 0.0018 |
| Result.err creation | 931,967.14 | 0.0011 | 0.0018 |
| Result.tryCatch (mixed) | 76,258.84 | 0.0133 | 0.0200 |

---

### 3. Data Structures: SlotBuffer (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| push (small, x100) | 950,938.27 | 0.0011 | 0.0016 |
| push (large, x10) | 85,060.03 | 0.0121 | 0.0203 |
| has (x100) | 294,644.49 | 0.0034 | 0.0036 |
| forEach (x100) | 48,338.53 | 0.0208 | 0.0272 |
| compact (x100) | 26,794.87 | 0.0380 | 0.0526 |
| some (early exit, x100) | 714,278.95 | 0.0014 | 0.0015 |
| some (full scan, x100) | 66,886.95 | 0.0151 | 0.0267 |

---

### 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :------------------------ | :----------- | :-------- | :------- |
| isPromise: native promise | 1,240,833.37 | 0.0008 | 0.0008 |
| isPromise: thenable | 1,239,018.17 | 0.0008 | 0.0008 |
| isPromise: object | 1,008,797.26 | 0.0010 | 0.0010 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 893,769.65 | 0.0011 | 0.0012 |
