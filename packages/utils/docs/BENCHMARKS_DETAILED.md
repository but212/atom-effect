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
| Literal assignment | 2,614,563.79 | 0.0004 | 0.0004 |
| Null check | 2,632,515.04 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004 | 0.0004 |
| Inline ternary map | 2,617,729.87 | 0.0004 | 0.0007 |
| If-Else branch (mixed) | 2,557,144.38 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,800,793.52 | 0.0006 | 0.0009 |
| isSome | 2,042,392.33 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,881,190.31 | 0.0005 | 0.0010 |
| map | 1,753,708.03 | 0.0006 | 0.0006 |
| match (mixed) | 1,949,443.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,778,256.30 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,614,563.79 | 0.0004 | 0.0004 |
| Boolean flag check | 2,603,995.32 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,532,750.38 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 492,948.74 | 0.0020 | 0.0021 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,793,760.52 | 0.0006 | 0.0006 |
| Result.err creation | 1,664,760.36 | 0.0006 | 0.0007 |
| isOk | 1,983,457.12 | 0.0005 | 0.0009 |
| unwrapOr (mixed) | 1,881,190.31 | 0.0005 | 0.0010 |
| map | 1,753,708.03 | 0.0006 | 0.0006 |
| Result.match (mixed) | 1,913,727.22 | 0.0005 | 0.0009 |
| Result.tryCatch (mixed) | 451,012.09 | 0.0022 | 0.0038 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,156,235.90 | 0.0005 | 0.0005 |
| push (large, x10) | 37,958.43 | 0.0263 | 0.0373 |
| has (x10) | 1,404,795.16 | 0.0007 | 0.0007 |
| forEach (x10) | 526,036.07 | 0.0019 | 0.0019 |
| compact (x10) | 330,597.90 | 0.0030 | 0.0034 |
| some (early exit, x10) | 2,138,215.19 | 0.0005 | 0.0005 |
| some (full scan, x10) | 862,755.65 | 0.0012 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,131,238.30 | 0.0005 | 0.0006 |
| isPromise: thenable | 2,163,269.13 | 0.0005 | 0.0005 |
| isPromise: object | 2,078,191.36 | 0.0005 | 0.0005 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,893,972.36 | 0.0005 | 0.0006 |
