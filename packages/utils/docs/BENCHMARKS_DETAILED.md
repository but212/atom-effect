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
| Literal assignment | 2,818,082.78 | 0.0004 | 0.0006 |
| Null check | 2,812,064.48 | 0.0004 | 0.0004 |
| Nullish coalescing (mixed) | 2,722,319.40 | 0.0004 | 0.0004 |
| Inline ternary map | 2,808,022.56 | 0.0004 | 0.0004 |
| If-Else branch (mixed) | 2,706,053.32 | 0.0004 | 0.0004 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,787,765.66 | 0.0006 | 0.0007 |
| isSome | 2,056,664.91 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 2,026,892.19 | 0.0005 | 0.0005 |
| map | 1,783,291.72 | 0.0006 | 0.0006 |
| match (mixed) | 2,018,192.05 | 0.0005 | 0.0005 |
| fromNullable (mixed) | 1,889,912.89 | 0.0005 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,818,082.78 | 0.0004 | 0.0006 |
| Boolean flag check | 2,800,700.61 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,707,179.03 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 486,069.74 | 0.0021 | 0.0028 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,762,575.00 | 0.0006 | 0.0006 |
| Result.err creation | 1,746,519.05 | 0.0006 | 0.0010 |
| isOk | 2,087,166.70 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 2,026,892.19 | 0.0005 | 0.0005 |
| map | 1,783,291.72 | 0.0006 | 0.0006 |
| Result.match (mixed) | 2,017,170.10 | 0.0005 | 0.0009 |
| Result.tryCatch (mixed) | 444,397.75 | 0.0023 | 0.0031 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,257,853.35 | 0.0004 | 0.0005 |
| push (large, x10) | 36,514.53 | 0.0274 | 0.0457 |
| has (x10) | 1,341,775.46 | 0.0007 | 0.0008 |
| forEach (x10) | 530,336.36 | 0.0019 | 0.0020 |
| compact (x10) | 360,014.42 | 0.0028 | 0.0034 |
| some (early exit, x10) | 2,290,751.03 | 0.0004 | 0.0005 |
| some (full scan, x10) | 890,181.04 | 0.0011 | 0.0014 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 1,984,763.25 | 0.0005 | 0.0009 |
| isPromise: thenable | 2,049,658.85 | 0.0005 | 0.0005 |
| isPromise: object | 1,987,462.82 | 0.0005 | 0.0005 |
| isOption: true | 2,032,720.51 | 0.0005 | 0.0005 |
| isOption: false | 2,011,299.49 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,893,419.22 | 0.0005 | 0.0005 |
