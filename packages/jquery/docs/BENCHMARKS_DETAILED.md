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
| Create 100 text bindings | 124 | 8.0108 | 21.6031 |
| Update text propagation (100el × 50) | 137 | 7.2955 | 12.6882 |
| Text binding with formatter (100el × 50) | 133 | 7.5110 | 21.6936 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 64 | 15.4262 | 35.8189 |
| Update html propagation (100el × 50) | 67 | 14.9130 | 31.0772 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 155 | 6.4360 | 10.1864 |
| Toggle class (100el × 100) | 152 | 6.5400 | 16.2827 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 133 | 7.5081 | 10.7570 |
| Update css (100el × 100) | 134 | 7.4078 | 12.2815 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 138 | 7.2028 | 19.9600 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 147 | 6.7867 | 16.7909 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73 | 13.6352 | 22.2196 |
| Hide toggle (100el × 100) | 74 | 13.3655 | 33.8135 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 91 | 10.9358 | 28.2141 |
| Update composite (100el × 50) | 92 | 10.7845 | 23.4913 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 865,538 | 0.0012 | 0.0096 |
| Clean large | 42,321 | 0.0236 | 0.0460 |
| Single dangerous tag | 642,585 | 0.0016 | 0.0104 |
| Multiple dangerous tags | 326,009 | 0.0031 | 0.0124 |
| Event-handler attrs | 150,366 | 0.0067 | 0.0220 |
| Mixed attr profile | 152,387 | 0.0066 | 0.0175 |
| 100 × clean small | 10,083 | 0.0992 | 0.1824 |
| 100 × mixed attr profile | 1,575 | 0.6349 | 0.9041 |
| 100 × multi dangerous tags | 3,528 | 0.2834 | 0.4814 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 254 | 3.9324 | 11.1525 |
| Render 500 items | 61 | 16.2799 | 32.3712 |
| Render 1000 items | 30 | 32.9649 | 52.3413 |
| Append 10 items to 100 | 279 | 3.5842 | 9.4385 |
| Remove 10 items from 100 | 284 | 3.5144 | 9.9272 |
| Full shuffle 100 items | 284 | 3.5096 | 9.0301 |
| Update 10 of 100 items content | 289 | 3.4512 | 10.2309 |
| Render 100 with bind callback | 51 | 19.4522 | 34.3418 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 43 | 22.8860 | 40.8136 |
| Atom → DOM propagation (100 × 100) | 46 | 21.4890 | 25.4605 |
| DOM → Atom propagation (100 events) | 903 | 1.1072 | 2.1648 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 73 | 13.5534 | 21.0946 |
| Toggle checkbox (atom → DOM) × 100 | 74 | 13.3466 | 15.2351 |
| Toggle checkbox via DOM event × 100 | 1,075 | 0.9298 | 1.9393 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 984 | 1.0160 | 2.0687 |
| With debounce option | 948 | 1.0548 | 2.1004 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,506 | 0.2219 | 1.2298 |
| Toggle 50 todos (update callback) | 340 | 2.9362 | 8.5252 |
| Filter switch (computed → atomList) | 318 | 3.1396 | 8.1117 |
| Full workflow: add → toggle → filter → delete | 2,388 | 0.4186 | 2.0483 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,620 | 0.6170 | 1.9577 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 202 | 4.9358 | 13.3935 |
| 20 widgets batch update (50 rounds) | 56 | 17.6974 | 22.4105 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 24 | 41.6593 | 62.8244 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 635 | 1.5740 | 4.0533 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 661 | 1.5124 | 3.9904 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,496 | 0.6684 | 1.5628 |
