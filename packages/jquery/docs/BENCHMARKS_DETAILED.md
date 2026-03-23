# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-21
**Version**: v0.23.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 116 | 8.5503 | 20.7099 |
| Update text propagation (100el × 50) | 131 | 7.5796 | 9.9464 |
| Text binding with formatter (100el × 50) | 132 | 7.5354 | 10.9419 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 67 | 14.7416 | 27.0617 |
| Update html propagation (100el × 50) | 73 | 13.6958 | 16.6579 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 151 | 6.6128 | 10.5373 |
| Toggle class (100el × 100) | 152 | 6.5565 | 11.3358 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 124 | 8.0385 | 11.4972 |
| Update css (100el × 100) | 128 | 7.7843 | 10.1067 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 138 | 7.2296 | 12.7587 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 143 | 6.9553 | 11.5658 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73 | 13.6209 | 18.7701 |
| Hide toggle (100el × 100) | 75 | 13.2461 | 14.2375 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 87 | 11.4424 | 13.8630 |
| Update composite (100el × 50) | 88 | 11.2988 | 13.5453 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 854,574 | 0.0012 | 0.0012 |
| Clean large | 42,104 | 0.0238 | 0.0351 |
| Single dangerous tag | 645,151 | 0.0016 | 0.0016 |
| Multiple dangerous tags | 331,153 | 0.0030 | 0.0032 |
| Event-handler attrs | 153,458 | 0.0065 | 0.0072 |
| Mixed attr profile | 151,803 | 0.0066 | 0.0074 |
| 100 × clean small | 10,154 | 0.0985 | 0.1097 |
| 100 × mixed attr profile | 1,568 | 0.6374 | 0.8513 |
| 100 × multi dangerous tags | 3,469 | 0.2882 | 0.3472 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 246 | 4.0535 | 12.3053 |
| Render 500 items | 63 | 15.6668 | 25.2072 |
| Render 1000 items | 31 | 31.3173 | 48.9605 |
| Append 10 items to 100 | 288 | 3.4632 | 6.9863 |
| Remove 10 items from 100 | 293 | 3.4108 | 6.6759 |
| Full shuffle 100 items | 291 | 3.4326 | 6.7292 |
| Update 10 of 100 items content | 292 | 3.4222 | 6.7795 |
| Render 100 with bind callback | 51 | 19.3020 | 28.6148 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 41 | 24.2475 | 42.6675 |
| Atom → DOM propagation (100 × 100) | 45 | 21.7832 | 24.6118 |
| DOM → Atom propagation (100 events) | 833 | 1.2003 | 2.2047 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 71 | 14.0182 | 18.2698 |
| Toggle checkbox (atom → DOM) × 100 | 71 | 13.9207 | 19.5019 |
| Toggle checkbox via DOM event × 100 | 996 | 1.0039 | 1.8374 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 865 | 1.1551 | 2.1112 |
| With debounce option | 859 | 1.1638 | 1.9458 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,673 | 0.2723 | 0.7301 |
| Toggle 50 todos (update callback) | 337 | 2.9657 | 6.1461 |
| Filter switch (computed → atomList) | 321 | 3.1147 | 5.8910 |
| Full workflow: add → toggle → filter → delete | 2,356 | 0.4243 | 1.8477 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,662 | 0.6016 | 1.7217 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 171 | 5.8191 | 13.9451 |
| 20 widgets batch update (50 rounds) | 53 | 18.7815 | 23.4747 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 24 | 41.6444 | 59.9150 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 643 | 1.5541 | 3.2494 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 658 | 1.5181 | 3.2513 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,488 | 0.6717 | 1.2432 |
