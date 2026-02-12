# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-02-12
**Version**: v0.21.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 94 | 10.6319 | 22.4026 |
| Update text propagation (100el × 50) | 103 | 9.7023 | 10.9420 |
| Text binding with formatter (100el × 50) | 103 | 9.7388 | 10.8299 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 61 | 16.4206 | 25.7858 |
| Update html propagation (100el × 50) | 63 | 15.8375 | 18.0579 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 137 | 7.3167 | 9.3384 |
| Toggle class (100el × 100) | 135 | 7.4070 | 13.3671 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 114 | 8.7447 | 12.5275 |
| Update css (100el × 100) | 115 | 8.7049 | 11.5865 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 125 | 8.0324 | 12.0672 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 134 | 7.4821 | 12.1358 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 65 | 15.2947 | 17.6821 |
| Hide toggle (100el × 100) | 65 | 15.3314 | 16.9942 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 91 | 10.9712 | 15.8640 |
| Update composite (100el × 50) | 91 | 11.0454 | 16.0331 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 70 | 14.2720 | 26.4158 |
| Render 500 items | 15 | 66.5389 | 89.1507 |
| Render 1000 items | 8 | 131.92 | 159.04 |
| Append 10 items to 100 | 74 | 13.4899 | 18.1349 |
| Remove 10 items from 100 | 76 | 13.1620 | 15.7102 |
| Full shuffle 100 items | 77 | 13.0637 | 16.2520 |
| Update 10 of 100 items content | 75 | 13.2777 | 14.9729 |
| Render 100 with bind callback | 41 | 24.6255 | 34.0949 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 50 | 20.1160 | 35.8141 |
| Atom → DOM propagation (100 × 100) | 54 | 18.6215 | 24.4840 |
| DOM → Atom propagation (100 events) | 887 | 1.1273 | 2.0295 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 66 | 15.1016 | 20.6260 |
| Toggle checkbox (atom → DOM) × 100 | 66 | 15.1117 | 17.8700 |
| Toggle checkbox via DOM event × 100 | 980 | 1.0201 | 1.8962 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 937 | 1.0674 | 1.8913 |
| With debounce option | 966 | 1.0353 | 2.0308 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,739 | 0.2674 | 0.7453 |
| Toggle 50 todos (update callback) | 110 | 9.1163 | 16.2271 |
| Filter switch (computed → atomList) | 76 | 13.1756 | 14.7561 |
| Full workflow: add → toggle → filter → delete | 1,940 | 0.5154 | 1.1397 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,197 | 0.8351 | 1.7466 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 147 | 6.8047 | 15.1730 |
| 20 widgets batch update (50 rounds) | 21 | 47.5327 | 59.3301 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 16 | 61.3233 | 79.6732 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 412 | 2.4277 | 4.4716 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 411 | 2.4332 | 4.7084 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 620 | 1.6120 | 2.4062 |
