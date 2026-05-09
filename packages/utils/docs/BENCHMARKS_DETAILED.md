# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-05-10
**Version**: v0.32.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x100)

### Native Comparison (null/undefined)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 411,397.35 | 0.0024 | 0.0046 |
| Null check | 426,317.32 | 0.0023 | 0.0023 |
| Nullish coalescing (mixed) | 224,589.64 | 0.0045 | 0.0079 |
| Inline ternary map | 420,416.40 | 0.0024 | 0.0028 |
| If-Else branch (mixed) | 233,634.89 | 0.0043 | 0.0046 |

### Option Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 253,729.06 | 0.0039 | 0.0046 |
| isSome | 293,255.83 | 0.0034 | 0.0036 |
| unwrapOr (mixed) | 171,674.38 | 0.0058 | 0.0065 |
| map | 244,916.07 | 0.0041 | 0.0045 |
| match (mixed) | 181,223.36 | 0.0055 | 0.0064 |
| fromNullable (mixed) | 173,806.55 | 0.0058 | 0.0065 |

---

## 2. Result Primitives (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 231,797.51 | 0.0043 | 0.0083 |
| Result.match (mixed) | 184,095.76 | 0.0054 | 0.0070 |
| Result.tryCatch (mixed) | 4,443.34 | 0.2251 | 0.3185 |

---

## 3. Data Structures: SlotBuffer

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x100) | 331,711.49 | 0.0030 | 0.0059 |
| push (large, x10) | 47,790.66 | 0.0209 | 0.0355 |
| has (x100) | 174,982.10 | 0.0057 | 0.0062 |
| forEach (x100) | 69,763.17 | 0.0143 | 0.0236 |
| compact (x100) | 39,083.22 | 0.0256 | 0.0365 |
| some (early exit, x100) | 341,605.00 | 0.0029 | 0.0029 |
| some (full scan, x100) | 104,573.81 | 0.0096 | 0.0175 |

---

## 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 290,555.62 | 0.0034 | 0.0070 |
| isPromise: thenable | 276,260.28 | 0.0036 | 0.0070 |
| isPromise: object | 287,849.49 | 0.0035 | 0.0035 |
| isOption: true | 282,765.16 | 0.0035 | 0.0062 |
| isOption: false | 290,306.60 | 0.0034 | 0.0039 |
| isPromise: mixed data | 163,432.77 | 0.0061 | 0.0112 |
