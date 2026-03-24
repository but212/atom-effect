# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-24
**Version**: v0.24.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 113 | 8.8417 | 21.6547 |
| Update text propagation (100el × 50) | 130 | 7.6687 | 10.8239 |
| Text binding with formatter (100el × 50) | 132 | 7.5269 | 9.0258 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 65 | 15.1820 | 27.4490 |
| Update html propagation (100el × 50) | 70 | 14.1377 | 15.8716 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 151 | 6.6069 | 8.3298 |
| Toggle class (100el × 100) | 147 | 6.8012 | 14.1918 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 123 | 8.0651 | 11.3671 |
| Update css (100el × 100) | 128 | 7.7874 | 10.9212 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 132 | 7.5740 | 13.1465 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 137 | 7.2799 | 13.4558 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 72 | 13.8852 | 17.7542 |
| Hide toggle (100el × 100) | 71 | 14.0195 | 18.1982 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 83 | 11.9404 | 17.4433 |
| Update composite (100el × 50) | 83 | 11.9314 | 17.1274 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 847,351 | 0.0012 | 0.0012 |
| Clean large | 42,251 | 0.0237 | 0.0393 |
| Single dangerous tag | 629,507 | 0.0016 | 0.0017 |
| Multiple dangerous tags | 325,458 | 0.0031 | 0.0032 |
| Event-handler attrs | 152,582 | 0.0066 | 0.0088 |
| Mixed attr profile | 150,620 | 0.0066 | 0.0136 |
| 100 × clean small | 9,806 | 0.1020 | 0.1325 |
| 100 × mixed attr profile | 1,561 | 0.6402 | 1.0617 |
| 100 × multi dangerous tags | 3,486 | 0.2868 | 0.3277 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 188 | 5.3060 | 13.8473 |
| Render 500 items | 33 | 29.4818 | 43.9199 |
| Render 1000 items | 11 | 84.0019 | 107.11 |
| Append 10 items to 100 | 227 | 4.3975 | 8.8600 |
| Remove 10 items from 100 | 228 | 4.3694 | 8.3581 |
| Full shuffle 100 items | 232 | 4.2921 | 8.6944 |
| Update 10 of 100 items content | 228 | 4.3854 | 8.2358 |
| Render 100 with bind callback | 48 | 20.5865 | 32.9275 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 40 | 24.3993 | 46.0222 |
| Atom → DOM propagation (100 × 100) | 46 | 21.6602 | 25.1314 |
| DOM → Atom propagation (100 events) | 830 | 1.2043 | 2.3086 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 72 | 13.8573 | 17.7891 |
| Toggle checkbox (atom → DOM) × 100 | 73 | 13.6846 | 17.3134 |
| Toggle checkbox via DOM event × 100 | 989 | 1.0105 | 1.9958 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 852 | 1.1730 | 2.2692 |
| With debounce option | 842 | 1.1864 | 2.3232 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,268 | 0.3060 | 0.7743 |
| Toggle 50 todos (update callback) | 277 | 3.5983 | 8.7481 |
| Filter switch (computed → atomList) | 242 | 4.1223 | 7.5820 |
| Full workflow: add → toggle → filter → delete | 2,152 | 0.4646 | 1.4864 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,626 | 0.6148 | 1.9550 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 163 | 6.1279 | 13.4794 |
| 20 widgets batch update (50 rounds) | 48 | 20.7533 | 26.1346 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 23 | 42.0450 | 54.4787 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 636 | 1.5720 | 3.1886 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 649 | 1.5387 | 3.5710 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,363 | 0.7334 | 1.4863 |
