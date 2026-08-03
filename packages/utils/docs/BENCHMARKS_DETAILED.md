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
| Literal assignment | 2,669,539.48 | 0.0004 | 0.0004 |
| Null check | 2,632,515.04 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,528,804.14 | 0.0004 | 0.0004 |
| Inline ternary map | 2,617,729.87 | 0.0004 | 0.0007 |
| If-Else branch (mixed) | 2,557,144.38 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,800,793.52 | 0.0006 | 0.0009 |
| isSome | 2,042,392.33 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,955,843.57 | 0.0005 | 0.0006 |
| map | 1,794,185.44 | 0.0006 | 0.0006 |
| match (mixed) | 1,949,443.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,778,256.30 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,669,539.48 | 0.0004 | 0.0004 |
| Boolean flag check | 2,634,951.67 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,503,547.25 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 479,448.24 | 0.0021 | 0.0022 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,801,612.15 | 0.0006 | 0.0006 |
| Result.err creation | 1,698,333.91 | 0.0006 | 0.0007 |
| isOk | 2,003,633.13 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,955,843.57 | 0.0005 | 0.0006 |
| map | 1,794,185.44 | 0.0006 | 0.0006 |
| Result.match (mixed) | 1,942,277.12 | 0.0005 | 0.0005 |
| Result.tryCatch (mixed) | 452,664.40 | 0.0022 | 0.0027 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,235,038.22 | 0.0004 | 0.0005 |
| push (large, x10) | 38,436.93 | 0.0260 | 0.0385 |
| has (x10) | 1,401,145.91 | 0.0007 | 0.0007 |
| forEach (x10) | 527,581.84 | 0.0019 | 0.0020 |
| compact (x10) | 338,578.99 | 0.0030 | 0.0035 |
| some (early exit, x10) | 2,205,929.10 | 0.0005 | 0.0005 |
| some (full scan, x10) | 896,741.39 | 0.0011 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,036,943.76 | 0.0005 | 0.0009 |
| isPromise: thenable | 2,081,268.38 | 0.0005 | 0.0009 |
| isPromise: object | 2,014,141.08 | 0.0005 | 0.0005 |
| isOption: true | 2,107,975.23 | 0.0005 | 0.0005 |
| isOption: false | 2,093,706.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,896,523.73 | 0.0005 | 0.0006 |
