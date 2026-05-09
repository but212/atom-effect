# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-05-09
**Version**: v0.32.1

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x100)

### Native Comparison (null/undefined)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 437,390.86 | 0.0023 | 0.0024 |
| Null check | 438,260.95 | 0.0023 | 0.0023 |
| Nullish coalescing (mixed) | 232,257.83 | 0.0043 | 0.0071 |
| Inline ternary map | 429,683.29 | 0.0023 | 0.0045 |
| If-Else branch (mixed) | 231,166.87 | 0.0043 | 0.0044 |

### Option Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 257,518.48 | 0.0039 | 0.0046 |
| isSome | 294,479.17 | 0.0034 | 0.0062 |
| unwrapOr (mixed) | 182,966.15 | 0.0055 | 0.0061 |
| map | 248,562.98 | 0.0040 | 0.0045 |
| match (mixed) | 180,733.38 | 0.0055 | 0.0059 |
| fromNullable (mixed) | 179,240.00 | 0.0056 | 0.0062 |

---

## 2. Result Primitives (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 253,760.10 | 0.0039 | 0.0070 |
| Result.match (mixed) | 183,014.27 | 0.0055 | 0.0098 |
| Result.tryCatch (mixed) | 4,296.16 | 0.2328 | 0.2771 |

---

## 3. Data Structures: SlotBuffer

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x100) | 325,262.60 | 0.0031 | 0.0061 |
| push (large, x10) | 50,266.99 | 0.0199 | 0.0305 |
| has (x100) | 177,378.73 | 0.0056 | 0.0065 |
| forEach (x100) | 69,952.25 | 0.0143 | 0.0238 |
| compact (x100) | 38,239.68 | 0.0262 | 0.0375 |
| some (early exit, x100) | 352,437.87 | 0.0028 | 0.0028 |
| some (full scan, x100) | 106,159.04 | 0.0094 | 0.0175 |

---

## 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 287,991.22 | 0.0035 | 0.0042 |
| isPromise: thenable | 290,726.73 | 0.0034 | 0.0070 |
| isPromise: object | 268,001.70 | 0.0037 | 0.0075 |
| isOption: true | 288,328.98 | 0.0035 | 0.0069 |
| isOption: false | 291,089.37 | 0.0034 | 0.0034 |
| isPromise: mixed data | 169,857.32 | 0.0059 | 0.0099 |
