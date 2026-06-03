# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-06-02
**Version**: v0.33.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x100)

### Native Comparison (null/undefined)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 447,332.65 | 0.0022 | 0.0041 |
| Null check | 448,532.39 | 0.0022 | 0.0029 |
| Nullish coalescing (mixed) | 236,831.91 | 0.0042 | 0.0064 |
| Inline ternary map | 443,777.88 | 0.0023 | 0.0024 |
| If-Else branch (mixed) | 237,861.30 | 0.0042 | 0.0050 |

### Option Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 261,967.29 | 0.0038 | 0.0078 |
| isSome | 303,876.47 | 0.0033 | 0.0046 |
| unwrapOr (mixed) | 185,636.55 | 0.0054 | 0.0086 |
| map | 249,744.31 | 0.0040 | 0.0054 |
| match (mixed) | 183,923.44 | 0.0054 | 0.0075 |
| fromNullable (mixed) | 176,925.28 | 0.0057 | 0.0086 |

---

## 2. Result Primitives (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 257,364.11 | 0.0039 | 0.0071 |
| Result.match (mixed) | 180,072.29 | 0.0056 | 0.0073 |
| Result.tryCatch (mixed) | 4,453.57 | 0.2245 | 0.2795 |

---

## 3. Data Structures: SlotBuffer

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x100) | 339,383.22 | 0.0029 | 0.0058 |
| push (large, x10) | 48,539.10 | 0.0206 | 0.0319 |
| has (x100) | 170,887.21 | 0.0059 | 0.0066 |
| forEach (x100) | 67,467.76 | 0.0148 | 0.0241 |
| compact (x100) | 29,579.17 | 0.0338 | 0.0471 |
| some (early exit, x100) | 285,208.94 | 0.0035 | 0.0036 |
| some (full scan, x100) | 99,244.38 | 0.0101 | 0.0180 |

---

## 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 292,856.91 | 0.0034 | 0.0067 |
| isPromise: thenable | 302,482.35 | 0.0033 | 0.0033 |
| isPromise: object | 288,971.44 | 0.0035 | 0.0034 |
| isOption: true | 300,017.53 | 0.0033 | 0.0033 |
| isOption: false | 250,369.68 | 0.0040 | 0.0047 |
| isPromise: mixed data | 173,693.70 | 0.0058 | 0.0100 |
