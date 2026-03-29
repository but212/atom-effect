# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-29
**Version**: v0.26.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 141.54 | 7.0652 | 16.9755 |
| Update text propagation (100el × 50) | 157.41 | 6.3529 | 11.9271 |
| Text binding with formatter (100el × 50) | 161.85 | 6.1784 | 7.6124 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 80.74 | 12.3858 | 22.0726 |
| Update html propagation (100el × 50) | 86.48 | 11.5632 | 15.9512 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 182.02 | 5.4940 | 6.9109 |
| Toggle class (100el × 100) | 180.04 | 5.5543 | 10.2042 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 151.18 | 6.6145 | 9.7660 |
| Update css (100el × 100) | 152.32 | 6.5649 | 11.1218 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 159.63 | 6.2645 | 11.6499 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 170.16 | 5.8769 | 10.6866 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 88.20 | 11.3381 | 14.3569 |
| Hide toggle (100el × 100) | 87.88 | 11.3796 | 14.7750 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 103.05 | 9.7037 | 12.2440 |
| Update composite (100el × 50) | 102.63 | 9.7433 | 12.9313 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 866,950 | 0.0012 | 0.0016 |
| Clean large | 47,405 | 0.0211 | 0.0277 |
| Single dangerous tag | 642,295 | 0.0016 | 0.0025 |
| Multiple dangerous tags | 340,854 | 0.0029 | 0.0034 |
| Event-handler attrs | 161,586 | 0.0062 | 0.0106 |
| Mixed attr profile | 170,712 | 0.0059 | 0.0069 |
| 100 × clean small | 10,658 | 0.0938 | 0.1084 |
| 100 × mixed attr profile | 1,762 | 0.5674 | 0.9500 |
| 100 × multi dangerous tags | 3,769 | 0.2653 | 0.2902 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 226.55 | 4.4141 | 11.4596 |
| Render 500 items | 57.87 | 17.2812 | 26.0307 |
| Render 1000 items | 29.30 | 34.1274 | 53.7920 |
| Append 10 items to 100 | 262.91 | 3.8035 | 7.3265 |
| Remove 10 items from 100 | 264.38 | 3.7825 | 7.7007 |
| Full shuffle 100 items | 263.38 | 3.7969 | 8.4166 |
| Update 10 of 100 items content | 268.78 | 3.7205 | 6.9906 |
| Render 100 with bind callback | 56.33 | 17.7524 | 26.7595 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 51.09 | 19.5716 | 38.6035 |
| Atom → DOM propagation (100 × 100) | 58.25 | 17.1664 | 18.7566 |
| DOM → Atom propagation (100 events) | 861.90 | 1.1602 | 2.2080 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 92.22 | 10.8437 | 13.4136 |
| Toggle checkbox (atom → DOM) × 100 | 92.49 | 10.8116 | 11.9403 |
| Toggle checkbox via DOM event × 100 | 1,062.41 | 0.9413 | 1.9250 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 881.36 | 1.1346 | 2.1735 |
| With debounce option | 896.91 | 1.1149 | 2.1725 |

### atomLens (New)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create lens (shallow) (x1000) | 783.85 | 1.2758 | 4.1958 |
| Create lens (deep path) (x1000) | 694.41 | 1.4401 | 4.7127 |
| Compose lenses (x1000) | 208.87 | 4.7876 | 11.7679 |
| Read via lens (deep) (x1000) | 24,686 | 0.0405 | 0.0487 |
| Write via lens (no change) (x1000) | 7,322 | 0.1366 | 0.1431 |
| Write via lens (with change) (x1000) | 1,908 | 0.5239 | 0.6187 |
| Write via lens (array element) (x1000) | 1,518 | 0.6586 | 1.0011 |
| Source → Lens propagation (x1000) | 58,584 | 0.0171 | 0.0289 |
| Lens → Source propagation (x1000) | 1,750 | 0.5711 | 0.7476 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,355.57 | 0.2296 | 0.6268 |
| Toggle 50 todos (update callback) | 301.73 | 3.3142 | 8.7495 |
| Filter switch (computed → atomList) | 279.47 | 3.5782 | 6.3840 |
| Full workflow: add → toggle → filter → delete | 2,540.48 | 0.3936 | 1.8284 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,977.43 | 0.5057 | 1.8323 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 203.91 | 4.9041 | 12.0851 |
| 20 widgets batch update (50 rounds) | 56.44 | 17.7179 | 20.6964 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 29.46 | 33.9469 | 52.1679 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 779.69 | 1.2826 | 2.9320 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 792.87 | 1.2612 | 3.0688 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,522.96 | 0.6566 | 1.4297 |

### atomForm — O(1) Scaling (New)

| Scenario | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Update 1 field in 10-field form (x1000) | 51,714 | 0.0193 | 0.0290 |
| Update 1 field in 100-field form (x1000) | 50,407 | 0.0198 | 0.0291 |

> **Analysis**: These results demonstrate true **O(1) scaling**. By isolating the state update cost, we observe that form size has negligible impact on field dispatch performance, maintaining over **50 million updates per second** (internal throughput) for both small and medium-sized forms.
