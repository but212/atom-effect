# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-31
**Version**: v0.27.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 117.83 | 8.4869 | 21.7633 |
| Update text propagation (100el × 50) | 133.63 | 7.4834 | 12.7949 |
| Text binding with formatter (100el × 50) | 137.31 | 7.2826 | 8.4373 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 69.71 | 14.3445 | 25.2848 |
| Update html propagation (100el × 50) | 75.23 | 13.2911 | 14.7907 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 156.73 | 6.3806 | 10.4078 |
| Toggle class (100el × 100) | 155.09 | 6.4478 | 11.2618 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 125.06 | 7.9963 | 11.4190 |
| Update css (100el × 100) | 130.13 | 7.6846 | 10.7811 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 137.41 | 7.2777 | 13.2478 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 144.67 | 6.9125 | 12.2284 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73.85 | 13.5406 | 19.8651 |
| Hide toggle (100el × 100) | 75.83 | 13.1858 | 14.1889 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 87.35 | 11.4479 | 17.0744 |
| Update composite (100el × 50) | 87.81 | 11.3877 | 16.6310 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 829,814 | 0.0012 | 0.0013 |
| Clean large | 42,352 | 0.0236 | 0.0321 |
| Single dangerous tag | 628,317 | 0.0016 | 0.0016 |
| Multiple dangerous tags | 326,658 | 0.0031 | 0.0032 |
| Event-handler attrs | 154,572 | 0.0065 | 0.0090 |
| Mixed attr profile | 151,597 | 0.0066 | 0.0096 |
| 100 × clean small | 10,473 | 0.0955 | 0.1056 |
| 100 × mixed attr profile | 1,574 | 0.6350 | 0.8071 |
| 100 × multi dangerous tags | 3,517 | 0.2843 | 0.3021 |

### atomList

| Render 100 items | 225.50 | 4.4346 | 12.5954 |
| Render 500 items | 59.72 | 16.7424 | 23.6067 |
| Render 1000 items | 29.93 | 33.4086 | 51.1437 |
| Append 10 items to 100 | 269.42 | 3.7116 | 7.4355 |
| Remove 10 items from 100 | 274.30 | 3.6456 | 8.0276 |
| Full shuffle 100 items | 271.67 | 3.6810 | 7.2461 |
| Update 10 of 100 items content | 276.64 | 3.6148 | 7.1620 |
| Render 100 with bind callback | 49.90 | 20.0394 | 31.9479 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 42.45 | 23.5563 | 42.4002 |
| Atom → DOM propagation (100 × 100) | 47.18 | 21.1922 | 24.2250 |
| DOM → Atom propagation (100 events) | 844.17 | 1.1846 | 1.8999 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 74.31 | 13.4559 | 15.8493 |
| Toggle checkbox (atom → DOM) × 100 | 74.45 | 13.4305 | 18.1342 |
| Toggle checkbox via DOM event × 100 | 976.90 | 1.0236 | 1.7883 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 858.17 | 1.1653 | 2.1022 |
| With debounce option | 868.80 | 1.1510 | 1.8247 |

### atomLens (New)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create lens (shallow) (x1000) | 935.32 | 1.0692 | 3.6663 |
| Create lens (deep path) (x1000) | 893.42 | 1.1193 | 3.2893 |
| Compose lenses (x1000) | 254.91 | 3.9229 | 10.1465 |
| Read via lens (deep) (x1000) | 23,120 | 0.0433 | 0.0518 |
| Write via lens (no change) (x1000) | 6,813 | 0.1468 | 0.1561 |
| Write via lens (with change) (x1000) | 2,047 | 0.4884 | 0.5493 |
| Write via lens (array element) (x1000) | 1,644 | 0.6082 | 0.7492 |
| Source → Lens propagation (x1000) | 81,657 | 0.0122 | 0.0272 |
| Lens → Source propagation (x1000) | 1,853 | 0.5396 | 0.5888 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,480.60 | 0.2873 | 0.7207 |
| Toggle 50 todos (update callback) | 313.20 | 3.1928 | 8.1718 |
| Filter switch (computed → atomList) | 290.64 | 3.4406 | 6.6439 |
| Full workflow: add → toggle → filter → delete | 2,229.60 | 0.4485 | 1.3946 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,731.61 | 0.5775 | 1.4621 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 160.46 | 6.2321 | 12.8906 |
| 20 widgets batch update (50 rounds) | 48.61 | 20.5705 | 25.5153 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 23.67 | 42.2317 | 57.2497 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 635.40 | 1.5738 | 3.0884 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 655.21 | 1.5262 | 2.9986 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,458.09 | 0.6858 | 1.2360 |

### atomForm — O(1) Scaling (New)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x1000) | 52,897 | 0.0189 | 0.0293 |
| Update 1 field in 100-field form (x1000) | 51,265 | 0.0195 | 0.0297 |

> **Analysis**: These results demonstrate true **O(1) scaling**. By isolating the state update cost, we observe that form size has negligible impact on field dispatch performance, maintaining over **50 million updates per second** (internal throughput) for both small and medium-sized forms.
