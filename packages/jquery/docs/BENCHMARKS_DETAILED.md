# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-26
**Version**: v0.25.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 116.73 | 8.5666 | 21.4365 |
| Update text propagation (100el × 50) | 134.01 | 7.4619 | 10.6925 |
| Text binding with formatter (100el × 50) | 137.68 | 7.2631 | 8.7616 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 68.99 | 14.4945 | 27.0682 |
| Update html propagation (100el × 50) | 73.88 | 13.5346 | 18.9463 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 154.35 | 6.4788 | 7.9985 |
| Toggle class (100el × 100) | 151.90 | 6.5833 | 11.3102 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 122.46 | 8.1661 | 11.3774 |
| Update css (100el × 100) | 124.71 | 8.0186 | 10.3723 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 133.18 | 7.5084 | 14.1626 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 140.37 | 7.1239 | 12.8781 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73.65 | 13.5760 | 16.4887 |
| Hide toggle (100el × 100) | 71.93 | 13.9021 | 17.2898 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 83.63 | 11.9570 | 17.2659 |
| Update composite (100el × 50) | 84.81 | 11.7910 | 18.5108 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 852,323 | 0.0012 | 0.0019 |
| Clean large | 41,651 | 0.0240 | 0.0465 |
| Single dangerous tag | 636,027 | 0.0016 | 0.0016 |
| Multiple dangerous tags | 328,738 | 0.0030 | 0.0033 |
| Event-handler attrs | 153,429 | 0.0065 | 0.0072 |
| Mixed attr profile | 151,483 | 0.0066 | 0.0084 |
| 100 × clean small | 9,993 | 0.1001 | 0.1100 |
| 100 × mixed attr profile | 1,561 | 0.6403 | 0.9623 |
| 100 × multi dangerous tags | 3,489 | 0.2866 | 0.3288 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 223.31 | 4.4782 | 12.1167 |
| Render 500 items | 59.23 | 16.8808 | 22.2369 |
| Render 1000 items | 29.76 | 33.5966 | 50.2878 |
| Append 10 items to 100 | 273.77 | 3.6527 | 5.4383 |
| Remove 10 items from 100 | 275.67 | 3.6275 | 5.8406 |
| Full shuffle 100 items | 275.22 | 3.6335 | 6.2352 |
| Update 10 of 100 items content | 279.22 | 3.5814 | 5.2630 |
| Render 100 with bind callback | 48.90 | 20.4484 | 31.5719 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 42.15 | 23.7233 | 42.4649 |
| Atom → DOM propagation (100 × 100) | 46.77 | 21.3788 | 23.8870 |
| DOM → Atom propagation (100 events) | 860.37 | 1.1623 | 2.1097 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 74.20 | 13.4757 | 20.0999 |
| Toggle checkbox (atom → DOM) × 100 | 76.31 | 13.1028 | 14.2003 |
| Toggle checkbox via DOM event × 100 | 1,007.95 | 0.9921 | 1.8874 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 878.17 | 1.1387 | 2.0412 |
| With debounce option | 886.10 | 1.1285 | 2.0092 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,463.24 | 0.2887 | 0.7490 |
| Toggle 50 todos (update callback) | 312.88 | 3.1961 | 8.4239 |
| Filter switch (computed → atomList) | 287.70 | 3.4758 | 6.2329 |
| Full workflow: add → toggle → filter → delete | 2,217.83 | 0.4509 | 1.5136 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,689.21 | 0.5920 | 1.5744 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 168.58 | 5.9318 | 13.3213 |
| 20 widgets batch update (50 rounds) | 48.63 | 20.5620 | 25.0579 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 24.00 | 41.6544 | 56.9382 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 639.27 | 1.5643 | 3.0540 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 649.07 | 1.5407 | 3.3778 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,441.76 | 0.6936 | 1.2920 |
