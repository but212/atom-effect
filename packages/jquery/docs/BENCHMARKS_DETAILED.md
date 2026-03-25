# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-03-25
**Version**: v0.24.1
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 118.43 | 8.4439 | 21.6938 |
| Update text propagation (100el × 50) | 134.47 | 7.4365 | 12.7557 |
| Text binding with formatter (100el × 50) | 139.27 | 7.1804 | 8.3040 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 69.56 | 14.3741 | 26.4254 |
| Update html propagation (100el × 50) | 74.87 | 13.3548 | 14.9413 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 156.58 | 6.3866 | 7.7365 |
| Toggle class (100el × 100) | 153.43 | 6.5177 | 12.6539 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 124.93 | 8.0042 | 11.2316 |
| Update css (100el × 100) | 128.01 | 7.8121 | 11.8513 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 135.89 | 7.3590 | 13.8152 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 141.01 | 7.0915 | 13.7321 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 73.35 | 13.6321 | 17.9592 |
| Hide toggle (100el × 100) | 74.04 | 13.5051 | 16.3400 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 87.50 | 11.4275 | 14.5454 |
| Update composite (100el × 50) | 88.24 | 11.3320 | 17.3843 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 863,193 | 0.0012 | 0.0012 |
| Clean large | 42,312 | 0.0236 | 0.0316 |
| Single dangerous tag | 644,881 | 0.0016 | 0.0016 |
| Multiple dangerous tags | 331,366 | 0.0030 | 0.0032 |
| Event-handler attrs | 153,255 | 0.0065 | 0.0126 |
| Mixed attr profile | 152,777 | 0.0065 | 0.0073 |
| 100 × clean small | 10,366 | 0.0965 | 0.1064 |
| 100 × mixed attr profile | 1,580 | 0.6327 | 0.7953 |
| 100 × multi dangerous tags | 3,564 | 0.2805 | 0.3065 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 224.90 | 4.4464 | 13.0345 |
| Render 500 items | 60.00 | 16.6646 | 24.9978 |
| Render 1000 items | 30.27 | 33.0316 | 50.4044 |
| Append 10 items to 100 | 278.26 | 3.5937 | 5.8574 |
| Remove 10 items from 100 | 279.68 | 3.5755 | 5.9353 |
| Full shuffle 100 items | 280.84 | 3.5607 | 6.3647 |
| Update 10 of 100 items content | 286.27 | 3.4933 | 5.0449 |
| Render 100 with bind callback | 50.05 | 19.9799 | 31.1834 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 42.64 | 23.4508 | 45.3452 |
| Atom → DOM propagation (100 × 100) | 47.46 | 21.0684 | 23.6747 |
| DOM → Atom propagation (100 events) | 866.31 | 1.1543 | 1.9536 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 74.84 | 13.3616 | 16.0898 |
| Toggle checkbox (atom → DOM) × 100 | 75.40 | 13.2610 | 14.3020 |
| Toggle checkbox via DOM event × 100 | 1,017.54 | 0.9828 | 1.6487 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 886.34 | 1.1282 | 2.0402 |
| With debounce option | 889.19 | 1.1246 | 1.8841 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 3,498.86 | 0.2858 | 0.7352 |
| Toggle 50 todos (update callback) | 318.86 | 3.1362 | 7.9294 |
| Filter switch (computed → atomList) | 300.31 | 3.3299 | 6.4025 |
| Full workflow: add → toggle → filter → delete | 2,235.75 | 0.4473 | 1.5087 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,746.09 | 0.5727 | 1.3855 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 174.46 | 5.7321 | 13.0268 |
| 20 widgets batch update (50 rounds) | 50.44 | 19.8247 | 27.6041 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 24.46 | 40.8712 | 57.0708 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 660.28 | 1.5145 | 2.9500 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 672.79 | 1.4864 | 3.0382 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,478.61 | 0.6763 | 1.2320 |
