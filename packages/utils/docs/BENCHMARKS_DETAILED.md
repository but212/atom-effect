# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-06-20
**Version**: v0.34.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x10)

### Native Comparison (null/undefined) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,595,419.22 | 0.0004 | 0.0008 |
| Null check | 2,632,515.04 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004 | 0.0004 |
| Inline ternary map | 2,617,729.87 | 0.0004 | 0.0007 |
| If-Else branch (mixed) | 2,557,144.38 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,800,793.52 | 0.0006 | 0.0009 |
| isSome | 2,042,392.33 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,809,045.36 | 0.0006 | 0.0006 |
| map | 1,819,555.63 | 0.0005 | 0.0006 |
| match (mixed) | 1,949,443.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,778,256.30 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,595,419.22 | 0.0004 | 0.0008 |
| Boolean flag check | 2,667,717.45 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,562,055.33 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 491,497.15 | 0.0020 | 0.0021 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,653,422.61 | 0.0006 | 0.0010 |
| Result.err creation | 1,835,664.18 | 0.0005 | 0.0006 |
| isOk | 2,047,918.54 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,809,045.36 | 0.0006 | 0.0006 |
| map | 1,819,555.63 | 0.0005 | 0.0006 |
| Result.match (mixed) | 1,967,052.22 | 0.0005 | 0.0005 |
| Result.tryCatch (mixed) | 445,931.10 | 0.0022 | 0.0042 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,154,667.87 | 0.0005 | 0.0005 |
| push (large, x10) | 39,196.47 | 0.0255 | 0.0359 |
| has (x10) | 1,418,206.57 | 0.0007 | 0.0007 |
| forEach (x10) | 527,649.79 | 0.0019 | 0.0019 |
| compact (x10) | 318,628.69 | 0.0031 | 0.0058 |
| some (early exit, x10) | 2,181,586.10 | 0.0005 | 0.0009 |
| some (full scan, x10) | 849,014.17 | 0.0012 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,116,584.72 | 0.0005 | 0.0005 |
| isPromise: thenable | 2,145,303.12 | 0.0005 | 0.0005 |
| isPromise: object | 2,045,171.77 | 0.0005 | 0.0005 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,874,665.03 | 0.0005 | 0.0006 |
