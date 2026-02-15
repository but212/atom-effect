# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-02-15
**Version**: v0.21.0
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 92 | 10.8625 | 24.9668 |
| Update text propagation (100el × 50) | 102 | 9.8135 | 11.6747 |
| Text binding with formatter (100el × 50) | 102 | 9.8031 | 12.1355 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 63 | 15.9266 | 25.0051 |
| Update html propagation (100el × 50) | 65 | 15.3082 | 18.2864 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 136 | 7.3439 | 10.9249 |
| Toggle class (100el × 100) | 140 | 7.1255 | 9.1017 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 118 | 8.4727 | 11.0920 |
| Update css (100el × 100) | 119 | 8.3848 | 10.4814 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 128 | 7.8080 | 13.2652 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 133 | 7.5239 | 12.3874 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 65 | 15.2707 | 18.3929 |
| Hide toggle (100el × 100) | 65 | 15.3621 | 18.3782 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 90 | 11.1301 | 14.9758 |
| Update composite (100el × 50) | 91 | 10.9736 | 13.3138 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 70 | 14.2312 | 27.3424 |
| Render 500 items | 16 | 64.3499 | 88.1378 |
| Render 1000 items | 8 | 129.61 | 155.52 |
| Append 10 items to 100 | 77 | 13.0572 | 14.4853 |
| Remove 10 items from 100 | 77 | 13.0500 | 15.1855 |
| Full shuffle 100 items | 75 | 13.2520 | 15.0626 |
| Update 10 of 100 items content | 76 | 13.2156 | 14.8284 |
| Render 100 with bind callback | 40 | 24.8403 | 34.1732 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 48 | 20.6333 | 36.3483 |
| Atom → DOM propagation (100 × 100) | 51 | 19.5682 | 24.7085 |
| DOM → Atom propagation (100 events) | 875 | 1.1423 | 2.2171 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 63 | 15.8322 | 22.1401 |
| Toggle checkbox (atom → DOM) × 100 | 65 | 15.3445 | 17.5001 |
| Toggle checkbox via DOM event × 100 | 984 | 1.0158 | 1.7978 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 939 | 1.0644 | 1.8002 |
| With debounce option | 986 | 1.0143 | 1.8213 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,640 | 0.2747 | 0.7708 |
| Toggle 50 todos (update callback) | 105 | 9.5435 | 16.8319 |
| Filter switch (computed → atomList) | 76 | 13.2085 | 18.5830 |
| Full workflow: add → toggle → filter → delete | 1,860 | 0.5376 | 2.0829 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,142 | 0.8757 | 2.4032 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 143 | 6.9942 | 15.8896 |
| 20 widgets batch update (50 rounds) | 21 | 47.2597 | 57.6211 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 17 | 59.2345 | 75.1753 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 419 | 2.3839 | 4.3289 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 422 | 2.3717 | 4.5705 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 612 | 1.6340 | 2.5860 |
