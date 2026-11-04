# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category       | Key Metric   | Value          | Technical Context                       |
| :------------- | :----------- | :------------- | :-------------------------------------- |
| **SlotBuffer** | push (small) | 972.6K ops/sec | Internal high-performance buffer (x100) |
| **Option**     | isSome check | 2.04M ops/sec  | Reactive-compatible Option type (x100)  |
| **Result** | ok creation | 1.25M ops/sec | Error handling primitive (x100) |
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
| Result.ok creation | 1,254,228.84 | 0.0008 | 0.0013 |
| Result.err creation | 1,268,519.59 | 0.0009 | 0.0013 |
| Result.tryCatch (mixed) | 82,216.17 | 0.0123 | 0.0178 |

---

### 3. Data Structures: SlotBuffer (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| push (small, x100) | 972,591.23 | 0.0012 | 0.0019 |
| push (large, x10) | 102,707.25 | 0.0103 | 0.0171 |
| has (x100) | 359,919.13 | 0.0028 | 0.0032 |
| forEach (x100) | 59,457.10 | 0.0169 | 0.0225 |
| compact (x100) | 35,097.61 | 0.0290 | 0.0402 |
| some (early exit, x100) | 1,029,463.99 | 0.0010 | 0.0019 |
| some (full scan, x100) | 86,336.44 | 0.0119 | 0.0206 |

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
