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
| Create 100 text bindings | 114.71 | 8.7174 | 21.8232 |
| Update text propagation (100el × 50) | 131.17 | 7.6239 | 13.1202 |
| Text binding with formatter (100el × 50) | 135.12 | 7.4009 | 8.8899 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 66.45 | 15.0487 | 28.8493 |
| Update html propagation (100el × 50) | 70.35 | 14.2142 | 15.9232 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 149.44 | 6.6916 | 9.9292 |
| Toggle class (100el × 100) | 149.12 | 6.7058 | 9.0231 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 122.61 | 8.1559 | 11.3847 |
| Update css (100el × 100) | 126.70 | 7.8929 | 9.9490 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 129.44 | 7.7255 | 14.6758 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 136.14 | 7.3456 | 13.8003 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 70.96 | 14.0928 | 18.8393 |
| Hide toggle (100el × 100) | 71.46 | 13.9946 | 16.9942 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 83.35 | 11.9974 | 17.2549 |
| Update composite (100el × 50) | 84.12 | 11.8882 | 16.3469 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 855,918 | 0.0012 | 0.0013 |
| Clean large | 42,345 | 0.0236 | 0.0311 |
| Single dangerous tag | 620,635 | 0.0016 | 0.0024 |
| Multiple dangerous tags | 322,735 | 0.0031 | 0.0044 |
| Event-handler attrs | 144,801 | 0.0069 | 0.0146 |
| Mixed attr profile | 150,951 | 0.0066 | 0.0088 |
| 100 × clean small | 10,197 | 0.0981 | 0.1128 |
| 100 × mixed attr profile | 1,556 | 0.6426 | 1.0890 |
| 100 × multi dangerous tags | 3,482 | 0.2872 | 0.3133 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 212.76 | 4.7001 | 13.7629 |
| Render 500 items | 55.67 | 17.9626 | 24.5802 |
| Render 1000 items | 27.42 | 36.4728 | 58.9281 |
| Append 10 items to 100 | 262.75 | 3.8059 | 6.7950 |
| Remove 10 items from 100 | 263.89 | 3.7895 | 7.2688 |
| Full shuffle 100 items | 263.46 | 3.7956 | 7.3662 |
| Update 10 of 100 items content | 268.44 | 3.7253 | 6.2397 |
| Render 100 with bind callback | 47.42 | 21.0869 | 32.3138 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 40.78 | 24.5227 | 45.9480 |
| Atom → DOM propagation (100 × 100) | 45.22 | 22.1162 | 25.5178 |
| DOM → Atom propagation (100 events) | 826.46 | 1.2100 | 2.3050 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 71.28 | 14.0284 | 17.3634 |
| Toggle checkbox (atom → DOM) × 100 | 70.49 | 14.1855 | 18.2473 |
| Toggle checkbox via DOM event × 100 | 994.66 | 1.0054 | 2.0436 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 867.47 | 1.1528 | 2.1434 |
| With debounce option | 862.71 | 1.1591 | 2.1041 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,355.81 | 0.2980 | 0.7461 |
| Toggle 50 todos (update callback) | 301.11 | 3.3211 | 7.9382 |
| Filter switch (computed → atomList) | 286.46 | 3.4909 | 6.2976 |
| Full workflow: add → toggle → filter → delete | 2,232.39 | 0.4479 | 1.6567 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,662.33 | 0.6016 | 1.7776 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 160.66 | 6.2243 | 13.0979 |
| 20 widgets batch update (50 rounds) | 47.92 | 20.8679 | 26.2807 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 22.94 | 43.6004 | 60.7307 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 622.31 | 1.6069 | 3.3149 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 627.42 | 1.5938 | 3.5917 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,370.45 | 0.7297 | 1.4979 |
