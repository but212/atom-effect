# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-29
**Version**: v0.25.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 114.97 | 8.6982 | 21.4203 |
| Update text propagation (100el × 50) | 131.73 | 7.5914 | 13.2732 |
| Text binding with formatter (100el × 50) | 134.30 | 7.4462 | 9.7862 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 67.41 | 14.8332 | 26.1197 |
| Update html propagation (100el × 50) | 72.20 | 13.8494 | 18.7191 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 152.12 | 6.5740 | 8.2241 |
| Toggle class (100el × 100) | 150.69 | 6.6360 | 12.7885 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 121.83 | 8.2079 | 13.0693 |
| Update css (100el × 100) | 122.71 | 8.1491 | 12.1670 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 130.80 | 7.6452 | 14.0090 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 139.06 | 7.1913 | 13.6360 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73.25 | 13.6507 | 16.3099 |
| Hide toggle (100el × 100) | 73.31 | 13.6404 | 17.2127 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 82.67 | 12.0959 | 18.3212 |
| Update composite (100el × 50) | 82.55 | 12.1138 | 20.1634 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 836,906 | 0.0012 | 0.0013 |
| Clean large | 42,371 | 0.0236 | 0.0319 |
| Single dangerous tag | 637,731 | 0.0016 | 0.0016 |
| Multiple dangerous tags | 328,827 | 0.0030 | 0.0032 |
| Event-handler attrs | 153,403 | 0.0065 | 0.0072 |
| Mixed attr profile | 151,809 | 0.0066 | 0.0074 |
| 100 × clean small | 10,097 | 0.0990 | 0.1097 |
| 100 × mixed attr profile | 1,559 | 0.6412 | 0.9361 |
| 100 × multi dangerous tags | 3,528 | 0.2834 | 0.3270 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 217.26 | 4.6029 | 12.6555 |
| Render 500 items | 59.35 | 16.8487 | 27.4324 |
| Render 1000 items | 30.10 | 33.2221 | 50.2030 |
| Append 10 items to 100 | 273.80 | 3.6523 | 6.0966 |
| Remove 10 items from 100 | 264.50 | 3.7807 | 6.6208 |
| Full shuffle 100 items | 274.97 | 3.6367 | 6.2761 |
| Update 10 of 100 items content | 270.15 | 3.7017 | 7.6331 |
| Render 100 with bind callback | 48.76 | 20.5046 | 30.8939 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 41.45 | 24.1208 | 43.5575 |
| Atom → DOM propagation (100 × 100) | 46.21 | 21.6368 | 25.2235 |
| DOM → Atom propagation (100 events) | 848.22 | 1.1789 | 2.1556 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 70.72 | 14.1398 | 22.8348 |
| Toggle checkbox (atom → DOM) × 100 | 73.31 | 13.6398 | 14.5961 |
| Toggle checkbox via DOM event × 100 | 1,001.87 | 0.9981 | 1.9498 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 874.50 | 1.1435 | 2.0727 |
| With debounce option | 874.94 | 1.1429 | 1.9823 |

### atomLens (New)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create lens (shallow) (x1000) | 930.10 | 1.0752 | 3.8850 |
| Create lens (deep path) (x1000) | 886.76 | 1.1277 | 3.5993 |
| Compose lenses (x1000) | 246.49 | 4.0569 | 10.4933 |
| Read via lens (deep) (x1000) | 21,498 | 0.0465 | 0.0583 |
| Write via lens (no change) (x1000) | 6,622 | 0.1510 | 0.1606 |
| Write via lens (with change) (x1000) | 1,959 | 0.5103 | 0.6931 |
| Write via lens (array element) (x1000) | 1,568 | 0.6377 | 0.8185 |
| Source → Lens propagation (x1000) | 78,596 | 0.0127 | 0.0250 |
| Lens → Source propagation (x1000) | 1,889 | 0.5291 | 0.6228 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,268.97 | 0.3059 | 0.8381 |
| Toggle 50 todos (update callback) | 303.50 | 3.2948 | 8.7252 |
| Filter switch (computed → atomList) | 285.70 | 3.5002 | 6.4910 |
| Full workflow: add → toggle → filter → delete | 2,168.12 | 0.4612 | 1.6330 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,639.48 | 0.6100 | 1.5486 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 163.52 | 6.1153 | 13.0501 |
| 20 widgets batch update (50 rounds) | 48.72 | 20.5226 | 25.2433 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 23.85 | 41.9206 | 49.9321 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 648.98 | 1.5409 | 3.2681 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 644.47 | 1.5517 | 3.3351 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,447.57 | 0.6908 | 1.3202 |
