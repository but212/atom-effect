# Detailed Benchmark Results (Utils)

This document provides raw data and detailed breakdowns for the `@but212/atom-effect-utils` performance suite.

**Last Updated**: 2026-05-19
**Version**: v0.33.0

- **Runtime**: Node.js v22.x
- **Infrastructure**: ubuntu-latest (GitHub Actions)

---

## 1. Option Primitives (x100)

### Native Comparison (null/undefined)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 420,448.80 | 0.0024 | 0.0029 |
| Null check | 419,654.88 | 0.0024 | 0.0024 |
| Nullish coalescing (mixed) | 231,713.62 | 0.0043 | 0.0050 |
| Inline ternary map | 405,060.15 | 0.0025 | 0.0066 |
| If-Else branch (mixed) | 213,775.70 | 0.0047 | 0.0105 |

### Option Operations

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 223,956.55 | 0.0045 | 0.0051 |
| isSome | 259,798.64 | 0.0038 | 0.0043 |
| unwrapOr (mixed) | 172,296.08 | 0.0058 | 0.0097 |
| map | 213,512.75 | 0.0047 | 0.0055 |
| match (mixed) | 168,124.92 | 0.0059 | 0.0101 |
| fromNullable (mixed) | 167,395.23 | 0.0060 | 0.0108 |

---

## 2. Result Primitives (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 259,249.37 | 0.0039 | 0.0067 |
| Result.match (mixed) | 182,703.34 | 0.0055 | 0.0070 |
| Result.tryCatch (mixed) | 4,290.75 | 0.2331 | 0.2849 |

---

## 3. Data Structures: SlotBuffer

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x100) | 343,757.59 | 0.0029 | 0.0044 |
| push (large, x10) | 50,582.83 | 0.0198 | 0.0303 |
| has (x100) | 185,123.11 | 0.0054 | 0.0061 |
| forEach (x100) | 70,102.99 | 0.0143 | 0.0236 |
| compact (x100) | 33,097.96 | 0.0302 | 0.0420 |
| some (early exit, x100) | 354,550.26 | 0.0028 | 0.0028 |
| some (full scan, x100) | 106,575.81 | 0.0094 | 0.0173 |

---

## 4. Utilities: Type Guards (x100)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 301,138.28 | 0.0033 | 0.0040 |
| isPromise: thenable | 307,815.63 | 0.0032 | 0.0035 |
| isPromise: object | 294,456.26 | 0.0034 | 0.0034 |
| isOption: true | 303,878.37 | 0.0033 | 0.0040 |
| isOption: false | 305,554.75 | 0.0033 | 0.0033 |
| isPromise: mixed data | 177,842.23 | 0.0056 | 0.0058 |
