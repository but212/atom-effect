# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-02
**Version**: v0.23.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 125 | 8.0309 | 18.7180 |
| Update text propagation (100el × 50) | 134 | 7.4393 | 13.4547 |
| Text binding with formatter (100el × 50) | 132 | 7.5599 | 13.5968 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 65 | 15.3753 | 25.2670 |
| Update html propagation (100el × 50) | 68 | 14.7983 | 23.7169 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 156 | 6.4251 | 9.5791 |
| Toggle class (100el × 100) | 151 | 6.6346 | 15.3291 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 132 | 7.5696 | 11.2183 |
| Update css (100el × 100) | 134 | 7.4830 | 9.3965 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 138 | 7.2707 | 12.4748 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 144 | 6.9436 | 12.1461 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 71 | 14.1108 | 20.4541 |
| Hide toggle (100el × 100) | 72 | 13.9172 | 17.8430 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 89 | 11.2761 | 17.8911 |
| Update composite (100el × 50) | 89 | 11.2170 | 18.3598 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 890,838 | 0.0011 | 0.0022 |
| Clean large | 42,318 | 0.0236 | 0.0383 |
| Single dangerous tag | 655,802 | 0.0015 | 0.0022 |
| Multiple dangerous tags | 331,499 | 0.0030 | 0.0058 |
| Event-handler attrs | 153,833 | 0.0065 | 0.0151 |
| Mixed attr profile | 153,554 | 0.0065 | 0.0150 |
| 100 × clean small | 10,383 | 0.0963 | 0.1211 |
| 100 × mixed attr profile | 1,592 | 0.6282 | 0.9093 |
| 100 × multi dangerous tags | 3,552 | 0.2815 | 0.4108 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 247 | 4.0538 | 10.6523 |
| Render 500 items | 61 | 16.3134 | 35.7587 |
| Render 1000 items | 30 | 33.0158 | 58.1451 |
| Append 10 items to 100 | 277 | 3.6109 | 6.8062 |
| Remove 10 items from 100 | 285 | 3.5057 | 8.3036 |
| Full shuffle 100 items | 285 | 3.5143 | 11.0197 |
| Update 10 of 100 items content | 290 | 3.4443 | 9.8008 |
| Render 100 with bind callback | 50 | 19.8605 | 33.7713 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 44 | 22.5603 | 38.2542 |
| Atom → DOM propagation (100 × 100) | 47 | 21.3814 | 25.5606 |
| DOM → Atom propagation (100 events) | 899 | 1.1129 | 2.2954 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 76 | 13.1657 | 17.5105 |
| Toggle checkbox (atom → DOM) × 100 | 75 | 13.2921 | 24.2348 |
| Toggle checkbox via DOM event × 100 | 1,100 | 0.9087 | 1.6679 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 963 | 1.0386 | 1.9161 |
| With debounce option | 940 | 1.0639 | 1.8910 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,527 | 0.2209 | 1.3090 |
| Toggle 50 todos (update callback) | 337 | 2.9704 | 8.1301 |
| Filter switch (computed → atomList) | 314 | 3.1878 | 8.3691 |
| Full workflow: add → toggle → filter → delete | 2,296 | 0.4356 | 2.2339 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,606 | 0.6228 | 2.1124 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 200 | 5.0066 | 12.5920 |
| 20 widgets batch update (50 rounds) | 55 | 18.1559 | 22.2764 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 23 | 43.1756 | 52.3654 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 616 | 1.6235 | 4.1100 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 637 | 1.5703 | 3.8001 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,418 | 0.7052 | 1.6975 |
