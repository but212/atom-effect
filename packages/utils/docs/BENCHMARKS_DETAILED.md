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
| Literal assignment | 3,244,330.24 | 0.0003 | 0.0005 |
| Null check | 2,632,515.04 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004 | 0.0004 |
| Inline ternary map | 2,617,729.87 | 0.0004 | 0.0007 |
| If-Else branch (mixed) | 2,557,144.38 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,800,793.52 | 0.0006 | 0.0009 |
| isSome | 2,042,392.33 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 2,386,593.09 | 0.0004 | 0.0007 |
| map | 1,813,399.67 | 0.0006 | 0.0011 |
| match (mixed) | 1,949,443.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,778,256.30 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 3,244,330.24 | 0.0003 | 0.0005 |
| Boolean flag check | 3,196,147.55 | 0.0003 | 0.0005 |
| Ternary error fallback (mixed) | 3,076,253.21 | 0.0003 | 0.0006 |
| Native try/catch (mixed) | 601,125.39 | 0.0017 | 0.0019 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,869,791.18 | 0.0005 | 0.0011 |
| Result.err creation | 1,895,445.96 | 0.0005 | 0.0011 |
| isOk | 2,372,836.49 | 0.0004 | 0.0006 |
| unwrapOr (mixed) | 2,386,593.09 | 0.0004 | 0.0007 |
| map | 1,813,399.67 | 0.0006 | 0.0011 |
| Result.match (mixed) | 2,298,926.82 | 0.0004 | 0.0007 |
| Result.tryCatch (mixed) | 552,823.64 | 0.0018 | 0.0027 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,474,605.37 | 0.0004 | 0.0007 |
| push (large, x10) | 39,735.85 | 0.0252 | 0.0363 |
| has (x10) | 1,350,272.70 | 0.0007 | 0.0010 |
| forEach (x10) | 523,916.95 | 0.0019 | 0.0030 |
| compact (x10) | 381,934.61 | 0.0026 | 0.0034 |
| some (early exit, x10) | 2,494,588.54 | 0.0004 | 0.0006 |
| some (full scan, x10) | 801,103.95 | 0.0012 | 0.0016 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,627,568.05 | 0.0004 | 0.0007 |
| isPromise: thenable | 2,706,486.27 | 0.0004 | 0.0006 |
| isPromise: object | 2,628,923.60 | 0.0004 | 0.0006 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 2,477,411.41 | 0.0004 | 0.0006 |
