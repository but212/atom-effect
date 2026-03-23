# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-23
**Version**: v0.23.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 112 | 8.9054 | 21.3866 |
| Update text propagation (100el × 50) | 125 | 7.9512 | 14.0485 |
| Text binding with formatter (100el × 50) | 129 | 7.7229 | 11.6387 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 65 | 15.2688 | 27.4444 |
| Update html propagation (100el × 50) | 70 | 14.2109 | 21.1411 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 147 | 6.7657 | 10.6720 |
| Toggle class (100el × 100) | 148 | 6.7217 | 11.6739 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 116 | 8.5516 | 14.0475 |
| Update css (100el × 100) | 120 | 8.2972 | 13.1761 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 127 | 7.8586 | 14.0433 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 133 | 7.5109 | 13.2957 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 68 | 14.6687 | 21.2830 |
| Hide toggle (100el × 100) | 68 | 14.6749 | 20.5079 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 80 | 12.4482 | 18.1880 |
| Update composite (100el × 50) | 83 | 11.9506 | 16.5978 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 848,032 | 0.0012 | 0.0018 |
| Clean large | 42,296 | 0.0236 | 0.0328 |
| Single dangerous tag | 626,674 | 0.0016 | 0.0028 |
| Multiple dangerous tags | 322,591 | 0.0031 | 0.0058 |
| Event-handler attrs | 150,987 | 0.0066 | 0.0156 |
| Mixed attr profile | 150,423 | 0.0066 | 0.0154 |
| 100 × clean small | 10,161 | 0.0984 | 0.1281 |
| 100 × mixed attr profile | 1,557 | 0.6420 | 1.1074 |
| 100 × multi dangerous tags | 3,453 | 0.2896 | 0.3508 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 212 | 4.7073 | 14.3678 |
| Render 500 items | 56 | 17.8498 | 28.8317 |
| Render 1000 items | 28 | 35.5467 | 55.4989 |
| Append 10 items to 100 | 259 | 3.8514 | 9.1848 |
| Remove 10 items from 100 | 260 | 3.8353 | 9.1988 |
| Full shuffle 100 items | 264 | 3.7747 | 9.7139 |
| Update 10 of 100 items content | 269 | 3.7088 | 8.2787 |
| Render 100 with bind callback | 48 | 20.7699 | 31.4366 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 38 | 25.7095 | 44.8344 |
| Atom → DOM propagation (100 × 100) | 43 | 23.0176 | 29.4470 |
| DOM → Atom propagation (100 events) | 820 | 1.2182 | 2.5533 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 67 | 14.7326 | 21.1019 |
| Toggle checkbox (atom → DOM) × 100 | 68 | 14.6446 | 20.9548 |
| Toggle checkbox via DOM event × 100 | 950 | 1.0521 | 2.2682 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 847 | 1.1806 | 2.3109 |
| With debounce option | 856 | 1.1669 | 2.2988 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,463 | 0.2888 | 0.7684 |
| Toggle 50 todos (update callback) | 293 | 3.4115 | 9.6116 |
| Filter switch (computed → atomList) | 290 | 3.4464 | 8.0105 |
| Full workflow: add → toggle → filter → delete | 2,237 | 0.4469 | 2.1686 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,564 | 0.6393 | 2.2329 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 158 | 6.3153 | 14.7805 |
| 20 widgets batch update (50 rounds) | 47 | 21.0935 | 29.4905 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 22 | 45.0331 | 61.8786 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 607 | 1.6467 | 3.5831 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 605 | 1.6521 | 3.9569 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,338 | 0.7471 | 1.6016 |
