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
| Literal assignment | 2,364,218.15 | 0.0004 | 0.0005 |
| Null check | 2,362,461.21 | 0.0004 | 0.0005 |
| Nullish coalescing (mixed) | 2,295,693.81 | 0.0004 | 0.0005 |
| Inline ternary map | 2,402,338.33 | 0.0004 | 0.0004 |
| If-Else branch (mixed) | 2,329,586.63 | 0.0004 | 0.0005 |

### Option Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Some creation | 1,657,424.13 | 0.0006 | 0.0011 |
| isSome | 1,811,689.99 | 0.0006 | 0.0010 |
| unwrapOr (mixed) | 1,819,491.14 | 0.0005 | 0.0006 |
| map | 1,640,140.75 | 0.0006 | 0.0007 |
| match (mixed) | 1,736,310.80 | 0.0006 | 0.0006 |
| fromNullable (mixed) | 1,680,618.60 | 0.0006 | 0.0006 |

---

## 2. Result Primitives (x10)

### Native Comparison (try/catch) (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Literal assignment | 2,678,608.74 | 0.0004 | 0.0004 |
| Boolean flag check | 2,680,946.74 | 0.0004 | 0.0004 |
| Ternary error fallback (mixed) | 2,548,473.11 | 0.0004 | 0.0004 |
| Native try/catch (mixed) | 492,138.99 | 0.0020 | 0.0021 |

### Result Operations (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| Result.ok creation | 1,788,782.99 | 0.0006 | 0.0006 |
| Result.err creation | 1,805,249.25 | 0.0006 | 0.0007 |
| isOk | 2,033,977.08 | 0.0005 | 0.0005 |
| unwrapOr (mixed) | 1,932,785.37 | 0.0005 | 0.0005 |
| map | 1,778,058.90 | 0.0006 | 0.0007 |
| Result.match (mixed) | 1,966,475.65 | 0.0005 | 0.0005 |
| Result.tryCatch (mixed) | 444,104.94 | 0.0023 | 0.0025 |

---

## 3. Data Structures: SlotBuffer (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| push (small, x10) | 2,109,158.19 | 0.0005 | 0.0006 |
| push (large, x10) | 36,620.84 | 0.0273 | 0.0386 |
| has (x10) | 1,392,131.77 | 0.0007 | 0.0007 |
| forEach (x10) | 529,137.06 | 0.0019 | 0.0019 |
| compact (x10) | 313,823.61 | 0.0032 | 0.0038 |
| some (early exit, x10) | 2,159,130.88 | 0.0005 | 0.0005 |
| some (full scan, x10) | 891,006.49 | 0.0011 | 0.0012 |

---

## 4. Utilities: Type Guards (x10)

| Test Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| :--- | :--- | :--- | :--- |
| isPromise: native promise | 2,042,450.49 | 0.0005 | 0.0006 |
| isPromise: thenable | 2,004,224.97 | 0.0005 | 0.0009 |
| isPromise: object | 1,965,401.87 | 0.0005 | 0.0005 |
| isOption: true | 2,022,963.84 | 0.0005 | 0.0009 |
| isOption: false | 2,049,433.04 | 0.0005 | 0.0005 |
| isPromise: mixed data | 1,803,922.71 | 0.0006 | 0.0006 |
