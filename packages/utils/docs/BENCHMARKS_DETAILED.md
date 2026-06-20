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
| Literal assignment | 2,477,985.59 | 0.0004 | 0.0004 |
| Null check | 2,512,466.61 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,398,946.25 | 0.0004 | 0.0004 |
| Inline ternary map | 2,545,179.04 | 0.0004 | 0.0004 |
| If-Else branch (mixed) | 2,432,576.18 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,779,947.06 | 0.0006 | 0.0006 |
| isSome | 1,973,262.80 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,893,140.03 | 0.0005 | 0.0006 |
| map | 1,762,135.18 | 0.0006 | 0.0006 |
| match (mixed) | 1,882,944.32 | 0.0005 | 0.0006 |
| fromNullable (mixed) | 1,795,652.24 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,477,985.59 | 0.0004 | 0.0004 |
| Boolean flag check | 2,577,921.41 | 0.0004 | 0.0008 |
| Ternary error fallback (mixed) | 2,492,039.49 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 478,169.05 | 0.0021 | 0.0033 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,778,608.64 | 0.0006 | 0.0007 |
| Result.err creation | 1,769,728.50 | 0.0006 | 0.0006 |
| isOk | 1,895,700.51 | 0.0005 | 0.0010 |
| unwrapOr (mixed) | 1,893,140.03 | 0.0005 | 0.0006 |
| map | 1,762,135.18 | 0.0006 | 0.0006 |
| Result.match (mixed) | 1,905,398.29 | 0.0005 | 0.0006 |
| Result.tryCatch (mixed) | 435,260.74 | 0.0023 | 0.0025 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,101,990.32 | 0.0005 | 0.0005 |
| push (large, x10) | 39,019.35 | 0.0256 | 0.0369 |
| has (x10) | 1,422,100.11 | 0.0007 | 0.0007 |
| forEach (x10) | 506,656.09 | 0.0020 | 0.0035 |
| compact (x10) | 324,761.50 | 0.0031 | 0.0051 |
| some (early exit, x10) | 2,130,405.90 | 0.0005 | 0.0005 |
| some (full scan, x10) | 858,705.57 | 0.0012 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,115,792.28 | 0.0005 | 0.0006 |
| isPromise: thenable | 2,075,778.91 | 0.0005 | 0.0009 |
| isPromise: object | 2,024,315.21 | 0.0005 | 0.0009 |
| isOption: true | 2,142,570.38 | 0.0005 | 0.0005 |
| isOption: false | 2,117,203.23 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,914,315.67 | 0.0005 | 0.0005 |
