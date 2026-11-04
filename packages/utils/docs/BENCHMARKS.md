# Benchmark Documentation

Benchmarking suite for `@but212/atom-effect-utils` to quantify the performance of internal data structures and utility functions.

## Performance Summary

| Category       | Key Metric   | Value          | Technical Context                       |
| :------------- | :----------- | :------------- | :-------------------------------------- |
| **SlotBuffer** | push (small) | 950.9K ops/sec | Internal high-performance buffer (x100) |
| **Result**     | ok creation  | 931.7K ops/sec | Error handling primitive (x100)         |

---

## Running Benchmarks

```bash
# Run all utility benchmarks
pnpm bench:all
```

## Benchmark Categories

### 1. Data Structures & Functional Primitives

- **SlotBuffer**: A specialized buffer optimized for frequent additions and iterations, used in the dependency tracking engine.
- **Result**: Functional programming primitive designed for safe error handling without the overhead of heavy abstractions.

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

### 1. Result Primitives (x100)

#### Result Operations (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| Result.ok creation | 931,663.52 | 0.0011 | 0.0018 |
| Result.err creation | 931,967.14 | 0.0011 | 0.0018 |
| Result.tryCatch (mixed) | 76,258.84 | 0.0133 | 0.0200 |

---

### 2. Data Structures: SlotBuffer (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :---------------------- | :----------- | :-------- | :------- |
| push (small, x100) | 950,938.27 | 0.0011 | 0.0016 |
| push (large, x10) | 85,060.03 | 0.0121 | 0.0203 |
| has (x100) | 294,644.49 | 0.0034 | 0.0036 |
| forEach (x100) | 48,338.53 | 0.0208 | 0.0272 |
| compact (x100) | 26,794.87 | 0.0380 | 0.0526 |
| some (early exit, x100) | 714,278.95 | 0.0014 | 0.0015 |
| some (full scan, x100) | 66,886.95 | 0.0151 | 0.0267 |
