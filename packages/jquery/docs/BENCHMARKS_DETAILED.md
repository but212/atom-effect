# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-02-18
**Version**: v0.21.3
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 101 | 9.9078 | 23.2984 |
| Update text propagation (100el × 50) | 114 | 8.7887 | 10.7568 |
| Text binding with formatter (100el × 50) | 113 | 8.8391 | 10.5209 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 73 | 13.7392 | 27.3599 |
| Update html propagation (100el × 50) | 76 | 13.1284 | 20.2189 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 161 | 6.2238 | 9.8144 |
| Toggle class (100el × 100) | 160 | 6.2600 | 12.8383 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 132 | 7.5873 | 12.4127 |
| Update css (100el × 100) | 134 | 7.4760 | 12.5466 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 142 | 7.0446 | 12.8430 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 157 | 6.3843 | 10.6889 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 75 | 13.2520 | 20.4652 |
| Hide toggle (100el × 100) | 76 | 13.1086 | 18.3127 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 101 | 9.8728 | 17.8994 |
| Update composite (100el × 50) | 102 | 9.8361 | 14.6628 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 83 | 11.9816 | 25.0257 |
| Render 500 items | 19 | 53.9616 | 81.0881 |
| Render 1000 items | 9 | 108.25 | 135.31 |
| Append 10 items to 100 | 90 | 11.0710 | 21.4081 |
| Remove 10 items from 100 | 91 | 10.9629 | 13.2942 |
| Full shuffle 100 items | 91 | 10.9895 | 12.3035 |
| Update 10 of 100 items content | 92 | 10.8846 | 13.7201 |
| Render 100 with bind callback | 46 | 21.7797 | 33.0519 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 57 | 17.5689 | 35.7814 |
| Atom → DOM propagation (100 × 100) | 61 | 16.3683 | 27.3766 |
| DOM → Atom propagation (100 events) | 875 | 1.1430 | 2.0526 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 76 | 13.0841 | 17.6147 |
| Toggle checkbox (atom → DOM) × 100 | 78 | 12.8727 | 21.8696 |
| Toggle checkbox via DOM event × 100 | 984 | 1.0160 | 2.0034 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 933 | 1.0714 | 2.0226 |
| With debounce option | 953 | 1.0490 | 2.0456 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,046 | 0.2472 | 1.4535 |
| Toggle 50 todos (update callback) | 129 | 7.7689 | 19.5679 |
| Filter switch (computed → atomList) | 92 | 10.8794 | 12.2662 |
| Full workflow: add → toggle → filter → delete | 2,104 | 0.4754 | 2.3163 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,316 | 0.7597 | 2.3350 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 166 | 6.0136 | 16.2961 |
| 20 widgets batch update (50 rounds) | 23 | 43.6183 | 62.3963 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 20 | 51.2200 | 71.0577 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 461 | 2.1683 | 4.3507 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 474 | 2.1111 | 4.9588 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 654 | 1.5291 | 2.3930 |
