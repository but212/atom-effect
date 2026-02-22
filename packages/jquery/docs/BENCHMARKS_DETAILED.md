# Benchmark Results - Detailed (jQuery Bindings)

**Last Updated**: 2026-02-23
**Version**: v0.22.2
**Environment**:

- **Node.js**: v20.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These benchmarks run in jsdom. Real browser performance may differ due to layout, paint, and compositing costs.*

## 1. Micro-Benchmarks

### atomText Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 text bindings | 123 | 8.6874 | 19.3341 |
| Update text propagation (100el × 50) | 136 | 8.1561 | 12.5412 |
| Text binding with formatter (100el × 50) | 134 | 8.2192 | 13.8343 |

### atomHtml Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 html bindings | 66 | 15.6171 | 22.3024 |
| Update html propagation (100el × 50) | 69 | 15.3514 | 21.8383 |

### atomClass Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 class bindings | 157 | 7.0969 | 9.6191 |
| Toggle class (100el × 100) | 156 | 6.1783 | 10.8227 |

### atomCss Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 css bindings | 134 | 8.5201 | 9.4834 |
| Update css (100el × 100) | 137 | 8.1300 | 9.5752 |

### atomAttr Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update attr (100el × 100) | 139 | 7.7974 | 14.3531 |

### atomProp Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create + update prop (100el × 100) | 144 | 7.7466 | 12.7549 |

### atomShow / atomHide Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Show toggle (100el × 100) | 75 | 13.7473 | 20.1910 |
| Hide toggle (100el × 100) | 76 | 13.5278 | 19.2196 |

### atomBind (unified)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create composite (text+class+css+show) × 100 | 91 | 11.6315 | 14.8285 |
| Update composite (100el × 50) | 92 | 11.5919 | 15.4410 |

### sanitizeHtml

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Clean small | 833,884 | 0.0012 | 0.0020 |
| Clean large | 42,334 | 0.0234 | 0.0315 |
| Single dangerous tag | 639,357 | 0.0016 | 0.0021 |
| Multiple dangerous tags | 330,712 | 0.0030 | 0.0050 |
| Event-handler attrs | 151,264 | 0.0064 | 0.0149 |
| Mixed attr profile | 150,605 | 0.0064 | 0.0148 |
| 100 × clean small | 9,519 | 0.1046 | 0.1245 |
| 100 × mixed attr profile | 1,579 | 0.6338 | 0.7905 |
| 100 × multi dangerous tags | 3,484 | 0.2902 | 0.3488 |

### atomList

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Render 100 items | 105 | 9.6090 | 23.0928 |
| Render 500 items | 22 | 44.8550 | 68.9342 |
| Render 1000 items | 11 | 91.9219 | 121.4200 |
| Append 10 items to 100 | 112 | 9.4430 | 15.1255 |
| Remove 10 items from 100 | 114 | 9.4058 | 10.9807 |
| Full shuffle 100 items | 117 | 8.8766 | 10.0514 |
| Update 10 of 100 items content | 118 | 8.8288 | 10.4639 |
| Render 100 with bind callback | 51 | 19.4092 | 35.4087 |

### atomVal Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 input val bindings | 45 | 21.8966 | 42.5437 |
| Atom → DOM propagation (100 × 100) | 48 | 21.4250 | 22.2253 |
| DOM → Atom propagation (100 events) | 901 | 1.0843 | 2.1711 |

### atomChecked Binding

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 checkbox bindings | 78 | 13.1468 | 19.5703 |
| Toggle checkbox (atom → DOM) × 100 | 78 | 13.4456 | 14.1478 |
| Toggle checkbox via DOM event × 100 | 1,107 | 0.8839 | 1.9778 |

### atomVal with Debounce

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Without debounce (baseline) | 962 | 1.0177 | 2.1706 |
| With debounce option | 928 | 1.0517 | 2.0656 |

## 2. Macro-Benchmarks

### Todo App — DOM Scenarios

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Add 50 todos (atomList + render) | 4,510 | 0.2195 | 1.3816 |
| Toggle 50 todos (update callback) | 142 | 8.0711 | 15.9853 |
| Filter switch (computed → atomList) | 112 | 9.3578 | 31.1479 |
| Full workflow: add → toggle → filter → delete | 2,403 | 0.3990 | 2.0262 |

### Todo App — Stats with Effects

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Todo stats auto-update (add 100 items) | 1,585 | 0.5883 | 2.1786 |

### Dashboard — Multi-Widget Binding

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 20 widgets with atomText + atomCss (creation) | 197 | 5.5306 | 13.2639 |
| 20 widgets batch update (50 rounds) | 55 | 18.0576 | 22.9207 |

### Dashboard — Mount/Unmount Cycles

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Mount and unmount 20 components (10 cycles) | 24 | 42.7046 | 48.5798 |

### Dashboard — Computed → DOM Chain

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep computed chain (5 levels) → atomText (20 widgets) | 634 | 1.4463 | 4.0631 |
| Fan-out: 1 atom → 20 computed → 20 DOM bindings | 650 | 1.4231 | 3.8226 |
| Fan-in: 20 atoms → 1 computed → 1 DOM binding | 1,187 | 0.8068 | 1.7042 |
