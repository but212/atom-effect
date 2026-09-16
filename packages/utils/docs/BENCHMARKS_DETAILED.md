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
| Literal assignment | 1,236,210.13 | 0.0008 | 0.0008 |
| Null check | 2,632,515.04 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004 | 0.0004 |
| Inline ternary map | 2,617,729.87 | 0.0004 | 0.0007 |
| If-Else branch (mixed) | 2,557,144.38 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,800,793.52 | 0.0006 | 0.0009 |
| isSome | 2,042,392.33 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 811,472.08 | 0.0012 | 0.0013 |
| map | 764,269.52 | 0.0014 | 0.0025 |
| match (mixed) | 1,949,443.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,778,256.30 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 1,236,210.13 | 0.0008 | 0.0008 |
| Boolean flag check | 1,236,390.98 | 0.0008 | 0.0008 |
| Ternary error fallback (mixed) | 1,199,416.13 | 0.0008 | 0.0009 |
| Native try/catch (mixed) | 351,981.23 | 0.0029 | 0.0030 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 779,253.47 | 0.0013 | 0.0025 |
| Result.err creation | 781,209.85 | 0.0013 | 0.0017 |
| isOk | 838,287.32 | 0.0012 | 0.0012 |
| unwrapOr (mixed) | 811,472.08 | 0.0012 | 0.0013 |
| map | 764,269.52 | 0.0014 | 0.0025 |
| Result.match (mixed) | 809,452.22 | 0.0013 | 0.0015 |
| Result.tryCatch (mixed) | 318,912.21 | 0.0032 | 0.0039 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 1,106,979.40 | 0.0009 | 0.0010 |
| push (large, x10) | 20,965.57 | 0.0500 | 0.1158 |
| has (x10) | 854,106.53 | 0.0012 | 0.0012 |
| forEach (x10) | 324,870.99 | 0.0032 | 0.0033 |
| compact (x10) | 294,294.96 | 0.0035 | 0.0045 |
| some (early exit, x10) | 1,027,003.86 | 0.0010 | 0.0010 |
| some (full scan, x10) | 360,724.59 | 0.0028 | 0.0028 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 854,872.05 | 0.0012 | 0.0012 |
| isPromise: thenable | 855,103.17 | 0.0012 | 0.0012 |
| isPromise: object | 841,154.26 | 0.0012 | 0.0012 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 825,580.90 | 0.0012 | 0.0013 |
