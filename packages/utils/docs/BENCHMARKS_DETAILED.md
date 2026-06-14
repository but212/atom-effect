# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-06-12
**Version**: v0.33.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x10)

### Native Comparison (null/undefined) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,663,557.97 | 0.0004 | 0.0006 |
| Null check | 2,647,535.23 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,575,142.98 | 0.0004 | 0.0004 |
| Inline ternary map | 2,654,060.07 | 0.0004 | 0.0004 |
| If-Else branch (mixed) | 2,561,167.36 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,617,315.39 | 0.0006 | 0.0010 |
| isSome | 1,972,501.00 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,910,184.90 | 0.0005 | 0.0006 |
| map | 1,667,857.28 | 0.0006 | 0.0007 |
| match (mixed) | 1,897,979.01 | 0.0005 | 0.0006 |
| fromNullable (mixed) | 1,764,807.64 | 0.0006 | 0.0007 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,663,557.97 | 0.0004 | 0.0006 |
| Boolean flag check | 2,737,095.33 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,643,980.77 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 483,711.38 | 0.0021 | 0.0022 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,733,740.79 | 0.0006 | 0.0006 |
| Result.err creation | 1,733,755.67 | 0.0006 | 0.0009 |
| isOk | 2,033,980.19 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,910,184.90 | 0.0005 | 0.0006 |
| map | 1,667,857.28 | 0.0006 | 0.0007 |
| Result.match (mixed) | 1,981,533.83 | 0.0005 | 0.0005 |
| Result.tryCatch (mixed) | 449,187.04 | 0.0022 | 0.0028 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,325,441.69 | 0.0004 | 0.0007 |
| push (large, x10) | 37,968.77 | 0.0263 | 0.0377 |
| has (x10) | 1,351,661.33 | 0.0007 | 0.0008 |
| forEach (x10) | 530,202.31 | 0.0019 | 0.0020 |
| compact (x10) | 261,382.24 | 0.0038 | 0.0049 |
| some (early exit, x10) | 2,326,894.90 | 0.0004 | 0.0005 |
| some (full scan, x10) | 898,916.41 | 0.0011 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 1,977,227.68 | 0.0005 | 0.0009 |
| isPromise: thenable | 2,055,197.26 | 0.0005 | 0.0008 |
| isPromise: object | 1,975,136.97 | 0.0005 | 0.0005 |
| isOption: true | 2,059,112.04 | 0.0005 | 0.0006 |
| isOption: false | 1,951,401.12 | 0.0005 | 0.0009 |
| isPromise: mixed data | 1,913,424.40 | 0.0005 | 0.0006 |
