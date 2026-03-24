# Benchmark Results - Detailed

**Last Updated**: 2026-03-24
**Version**: v0.24.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 6,610 | 0.1513 | 0.6217 |
| Create 1000 Atoms (Objects) | 6,895 | 0.1450 | 0.5919 |
| Read 1000 Atoms (Value) | 39,306 | 0.0254 | 0.0402 |
| Read 1000 Atoms (Peek) | 670,890 | 0.0015 | 0.0019 |
| Write 1000 Atoms | 309,654 | 0.0032 | 0.0070 |
| Subscribe/Unsubscribe (x100) | 256,909 | 0.0039 | 0.0137 |
| Notify 1 Subscriber (x1000) | 29,777 | 0.0336 | 0.0428 |
| Untracked Read (x1000) | 39,329 | 0.0254 | 0.0355 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 1,967 | 0.5082 | 1.2401 |
| Create (3 Deps) (x1000) | 1,175 | 0.8505 | 1.9124 |
| Create Chain (100) | 18,251 | 0.0548 | 0.5325 |
| Read (Single Dep) (x1000) | 38,619 | 0.0259 | 0.0362 |
| Read (Multiple) (x1000) | 38,536 | 0.0259 | 0.0476 |
| Nested Computation (x1000) | 34,589 | 0.0289 | 0.0379 |
| Recompute (Single Dep) | 1,382,457 | 0.0007 | 0.0013 |
| Recompute (Chain of 10) | 321,211 | 0.0031 | 0.0059 |
| No Recompute (Unchanged) (x1000) | 38,333 | 0.0261 | 0.0378 |
| Lazy (Not Accessed) (x1000) | 2,217 | 0.4511 | 1.1852 |
| Lazy (Accessed Once) | 936,553 | 0.0011 | 0.0016 |
| Lazy (Multiple Access) | 852,481 | 0.0012 | 0.0021 |
| Cache Invalidation | 1,451,957 | 0.0007 | 0.0012 |
| Diamond Invalidation | 763,320 | 0.0013 | 0.0017 |
| Dispose (x1000) | 2,037 | 0.4909 | 1.2614 |
| Dispose Chain | 292,567 | 0.0034 | 0.0064 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) | 748,337 | 0.0013 | 0.0021 |
| Create (Multiple Deps) | 435,785 | 0.0023 | 0.0038 |
| Create 10 Effects | 90,207 | 0.0111 | 0.0207 |
| Execution (Dep Change) (x1000) | 17,702 | 0.0565 | 0.0778 |
| Execution (Multiple) (x1000) | 8,454 | 0.1183 | 0.1415 |
| With Computed Dep (x1000) | 18,696 | 0.0535 | 0.0710 |
| Re-runs (10 times) | 1,114,486 | 0.0009 | 0.0015 |
| Multiple on Same Dep (x1000) | 17,772 | 0.0563 | 0.0701 |
| With Cleanup | 546,742 | 0.0018 | 0.0024 |
| Cleanup on Dep Change (x1000) | 16,586 | 0.0603 | 0.0753 |
| Dispose | 677,506 | 0.0015 | 0.0022 |
| Dispose (with Cleanup) | 692,580 | 0.0014 | 0.0019 |
| Dispose 10 Effects | 89,712 | 0.0111 | 0.0208 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,855 | 0.1708 | 0.2973 |
| Batch Update (10) (x1000) | 2,713 | 0.3686 | 0.5435 |
| Batch Update (100) | 379,774 | 0.0026 | 0.0051 |
| Without Batch (10) | 832,951 | 0.0012 | 0.0021 |
| With Batch (10) | 274,926 | 0.0036 | 0.0070 |
| Nested Batch (2 levels) (x1000) | 3,736 | 0.2676 | 0.4834 |
| Nested Batch (5 levels) (x1000) | 1,735 | 0.5762 | 0.7900 |
| Batch with Computed | 519,103 | 0.0019 | 0.0028 |
| Batch with Diamond | 550,331 | 0.0018 | 0.0025 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,395 | 0.2945 | 0.5350 |
| 1 to N (Fan Out 1000) | 3,300 | 0.3030 | 0.6237 |
| N to 1 (Fan In 1000) | 21,371 | 0.0468 | 0.0745 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,797 | 0.2633 | 0.8020 |
| Create/Dispose 1K Computeds | 2,906 | 0.3441 | 0.9638 |
| Create/Dispose 1K Effects | 289 | 3.4574 | 4.6607 |
| Rapid GC (10K Cycles) | 527 | 1.8973 | 2.4371 |
| Subscription Churn (1K) | 23,309 | 0.0429 | 0.1813 |
| Object Pooling (10K) | 21 | 46.8269 | 48.5263 |
| Weak Reference Cleanup (1K) | 2,887 | 0.3463 | 0.9586 |
| Effect Cleanup (1K) | 117 | 8.5163 | 9.4449 |
| Circular Reference Cleanup | 19,572 | 0.0511 | 0.0838 |
| Large State Tree (10K) | 986 | 1.0133 | 1.8156 |
| Memory Usage Monitoring | 197 | 5.0589 | 5.9054 |

### Data Grid (1000 Rows) - Macro

| Operation | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,876 | 0.2051 | 0.4785 |
| [Atom] Initialize | 4,883 | 0.2048 | 0.4914 |
| [Vanilla] Sort (Name) | 4,539 | 0.2203 | 0.2657 |
| [Atom] Sort (Name) | 2,387 | 0.4188 | 0.8237 |
| [Vanilla] Filter (Department) | 487,567 | 0.0021 | 0.0032 |
| [Atom] Filter (Department) | 34,556 | 0.0289 | 0.0420 |
| [Vanilla] Sort + Filter + Paginate | 4,364 | 0.2291 | 0.3010 |
| [Atom] Sort + Filter + Paginate | 2,248 | 0.4448 | 0.5660 |
| Select/Deselect Rows | 2,450 | 0.4081 | 0.7871 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 36,917 | 0.0271 | 0.0423 |
| Wide Fan-out (1→100) | 32,765 | 0.0305 | 0.0413 |
| Diamond Pattern | 141,690 | 0.0071 | 0.0160 |
| Pyramid (50 levels) | 60,131 | 0.0166 | 0.0273 |
| Mixed (100A, 200C) | 135,055 | 0.0074 | 0.0156 |
| Circular Avoidance | 638,029 | 0.0016 | 0.0024 |
| Conditional Deps | 826,210 | 0.0012 | 0.0019 |
| Array Dynamic Deps | 846,666 | 0.0012 | 0.0017 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 789,253 | 0.0013 | 0.0033 |
| Toggle Completion | 17,482 | 0.0572 | 0.2087 |
| Filter (Active/Completed) | 950,355 | 0.0011 | 0.0018 |
| Delete (50 from 100) | 41,134 | 0.0243 | 0.0633 |
| Complete Workflow | 190,572 | 0.0052 | 0.0185 |
| Stats with Auto-update | 535,229 | 0.0019 | 0.0042 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Updates per frame (100 atoms) | 70,156 | 0.0143 | 0.0272 |
| Updates per frame (100 atoms, batched) | 41,883 | 0.0239 | 0.0404 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 8,562 | 0.1168 | 1.2871 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 201,071 | 0.0050 | 0.0145 |
| Form reset (no batch) | 617,017 | 0.0016 | 0.0026 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency | 763,273 | 0.0013 | 0.0020 |
