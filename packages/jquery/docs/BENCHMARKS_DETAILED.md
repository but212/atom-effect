# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-02-21
**Version**: v0.22.1
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 128 | 7.8096 | 21.9671 |
| Update text propagation (100el × 50) | 143 | 6.9771 | 8.6848 |
| Text binding with formatter (100el × 50) | 141 | 7.0743 | 11.3553 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 59 | 16.9058 | 27.3061 |
| Update html propagation (100el × 50) | 62 | 16.1100 | 24.3897 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 149 | 6.7203 | 11.6452 |
| Toggle class (100el × 100) | 148 | 6.7342 | 11.3728 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 121 | 8.2372 | 14.1729 |
| Update css (100el × 100) | 127 | 7.8970 | 10.4908 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 135 | 7.4083 | 16.4344 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 142 | 7.0206 | 12.3293 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 75 | 13.2740 | 20.8186 |
| Hide toggle (100el × 100) | 75 | 13.2769 | 18.5167 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 94 | 10.6649 | 16.7940 |
| Update composite (100el × 50) | 93 | 10.7682 | 15.1927 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 1,215,312 | 0.0008 | 0.0009 |
| Clean large | 48,083 | 0.0208 | 0.0283 |
| Single dangerous tag | 816,955 | 0.0012 | 0.0018 |
| Multiple dangerous tags | 391,991 | 0.0026 | 0.0050 |
| Event-handler attrs | 174,112 | 0.0057 | 0.0140 |
| Mixed attr profile | 172,653 | 0.0058 | 0.0138 |
| 100 × clean small | 14,969 | 0.0668 | 0.0855 |
| 100 × mixed attr profile | 1,800 | 0.5554 | 0.8609 |
| 100 × multi dangerous tags | 4,222 | 0.2368 | 0.2814 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 96 | 10.4207 | 24.8863 |
| Render 500 items | 20 | 49.5631 | 75.7217 |
| Render 1000 items | 10 | 101.5900 | 129.3200 |
| Append 10 items to 100 | 104 | 9.6418 | 10.8840 |
| Remove 10 items from 100 | 105 | 9.5113 | 13.0210 |
| Full shuffle 100 items | 109 | 9.1960 | 10.9423 |
| Update 10 of 100 items content | 108 | 9.2593 | 12.2913 |
| Render 100 with bind callback | 65 | 15.4280 | 25.8039 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 44 | 22.5721 | 41.1766 |
| Atom → DOM propagation (100 × 100) | 47 | 21.0736 | 26.5835 |
| DOM → Atom propagation (100 events) | 881 | 1.1346 | 2.1601 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 78 | 12.7774 | 17.7253 |
| Toggle checkbox (atom → DOM) × 100 | 77 | 12.9970 | 15.0882 |
| Toggle checkbox via DOM event × 100 | 1,036 | 0.9653 | 2.4049 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 908 | 1.1004 | 2.4558 |
| With debounce option | 864 | 1.1569 | 2.4753 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,026 | 0.2484 | 1.5423 |
| Toggle 50 todos (update callback) | 121 | 8.2192 | 24.3171 |
| Filter switch (computed → atomList) | 104 | 9.5249 | 15.6585 |
| Full workflow: add → toggle → filter → delete | 2,011 | 0.4971 | 2.5027 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,415 | 0.7063 | 2.4019 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 185 | 5.3829 | 14.5514 |
| 20 widgets batch update (50 rounds) | 55 | 18.0592 | 23.7299 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 20 | 49.7795 | 57.3290 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 581 | 1.7194 | 4.5109 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 590 | 1.6934 | 4.1922 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,139 | 0.8776 | 1.7533 |
