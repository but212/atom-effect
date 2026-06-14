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
| Literal assignment | 2,743,394.30 | 0.0004 | 0.0006 |
| Null check | 2,729,508.60 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,655,665.61 | 0.0004 | 0.0004 |
| Inline ternary map | 2,733,046.04 | 0.0004 | 0.0004 |
| If-Else branch (mixed) | 2,635,051.05 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,725,252.95 | 0.0006 | 0.0007 |
| isSome | 2,036,332.15 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,963,012.63 | 0.0005 | 0.0005 |
| map | 1,720,964.48 | 0.0006 | 0.0006 |
| match (mixed) | 1,949,272.39 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,831,887.60 | 0.0005 | 0.0007 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,743,394.30 | 0.0004 | 0.0006 |
| Boolean flag check | 2,661,208.24 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,577,711.87 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 477,088.67 | 0.0021 | 0.0022 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,661,452.20 | 0.0006 | 0.0007 |
| Result.err creation | 1,658,315.46 | 0.0006 | 0.0007 |
| isOk | 1,913,660.04 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,963,012.63 | 0.0005 | 0.0005 |
| map | 1,720,964.48 | 0.0006 | 0.0006 |
| Result.match (mixed) | 1,885,785.92 | 0.0005 | 0.0006 |
| Result.tryCatch (mixed) | 438,389.26 | 0.0023 | 0.0026 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,341,428.52 | 0.0004 | 0.0006 |
| push (large, x10) | 38,927.95 | 0.0257 | 0.0365 |
| has (x10) | 1,328,331.50 | 0.0008 | 0.0008 |
| forEach (x10) | 530,575.37 | 0.0019 | 0.0020 |
| compact (x10) | 343,551.30 | 0.0029 | 0.0035 |
| some (early exit, x10) | 2,332,649.59 | 0.0004 | 0.0004 |
| some (full scan, x10) | 888,664.65 | 0.0011 | 0.0014 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,028,846.13 | 0.0005 | 0.0009 |
| isPromise: thenable | 2,070,781.68 | 0.0005 | 0.0008 |
| isPromise: object | 2,027,913.43 | 0.0005 | 0.0005 |
| isOption: true | 2,129,685.69 | 0.0005 | 0.0005 |
| isOption: false | 2,027,001.06 | 0.0005 | 0.0009 |
| isPromise: mixed data | 1,957,886.99 | 0.0005 | 0.0005 |
