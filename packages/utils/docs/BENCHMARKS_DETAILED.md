# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-06-05
**Version**: v0.33.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x100)

### Native Comparison (null/undefined)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 556,196.56 | 0.0018 | 0.0036 |
| Null check | 556,332.71 | 0.0018 | 0.0019 |
| Nullish coalescing (mixed) | 265,431.12 | 0.0038 | 0.0066 |
| Inline ternary map | 554,299.91 | 0.0018 | 0.0020 |
| If-Else branch (mixed) | 264,800.97 | 0.0038 | 0.0060 |

### Option Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 259,732.98 | 0.0039 | 0.0055 |
| isSome | 365,019.66 | 0.0027 | 0.0029 |
| unwrapOr (mixed) | 213,143.86 | 0.0047 | 0.0050 |
| map | 251,460.74 | 0.0040 | 0.0054 |
| match (mixed) | 208,118.89 | 0.0048 | 0.0074 |
| fromNullable (mixed) | 204,072.28 | 0.0049 | 0.0065 |

---

## 2. Result Primitives (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 278,735.59 | 0.0036 | 0.0058 |
| Result.match (mixed) | 205,686.30 | 0.0049 | 0.0092 |
| Result.tryCatch (mixed) | 4,895.70 | 0.2043 | 0.3646 |

---

## 3. Data Structures: SlotBuffer

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x100) | 341,794.94 | 0.0029 | 0.0059 |
| push (large, x10) | 51,481.50 | 0.0194 | 0.0266 |
| has (x100) | 173,888.33 | 0.0058 | 0.0091 |
| forEach (x100) | 32,944.76 | 0.0304 | 0.0356 |
| compact (x100) | 31,142.08 | 0.0321 | 0.0421 |
| some (early exit, x100) | 286,663.85 | 0.0035 | 0.0038 |
| some (full scan, x100) | 112,597.23 | 0.0089 | 0.0122 |

---

## 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 368,064.36 | 0.0027 | 0.0030 |
| isPromise: thenable | 375,404.47 | 0.0027 | 0.0029 |
| isPromise: object | 351,477.53 | 0.0028 | 0.0031 |
| isOption: true | 372,122.25 | 0.0027 | 0.0029 |
| isOption: false | 364,125.53 | 0.0027 | 0.0057 |
| isPromise: mixed data | 192,435.23 | 0.0052 | 0.0097 |
