# Benchmark Results - Detailed

**Last Updated**: 2026-03-31
**Version**: v0.27.0
**Environment**:

- **Node.js**: v22.x
- **OS**: ubuntu-latest (GitHub Actions)

> *Note: These numbers represent pure engine throughput in isolation. Actual app performance often depends on external factors like DOM updates and layout.*

## 1. Micro-Benchmarks

### Atom - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 1000 Atoms (Primitives) | 7,143 | 0.1400 | 0.5272 |
| Create 1000 Atoms (Objects) | 6,923 | 0.1444 | 0.5421 |
| Read 1000 Atoms (Value) | 39,140 | 0.0255 | 0.0343 |
| Read 1000 Atoms (Peek) | 713,749 | 0.0014 | 0.0014 |
| Write 1000 Atoms | 333,774 | 0.0030 | 0.0032 |
| Subscribe/Unsubscribe (x100) | 262,075 | 0.0038 | 0.0056 |
| Notify 1 Subscriber (x1000) | 28,289 | 0.0353 | 0.0438 |
| Untracked Read (x1000) | 38,857 | 0.0257 | 0.0345 |

### Computed - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 2,090 | 0.4784 | 1.0060 |
| Create (3 Deps) (x1000) | 1,341 | 0.7457 | 1.2728 |
| Create Chain (100) | 20,010 | 0.0500 | 0.0638 |
| Read (Single Dep) (x1000) | 44,264 | 0.0226 | 0.0310 |
| Read (Multiple) (x1000) | 36,964 | 0.0271 | 0.0437 |
| Nested Computation (x1000) | 37,132 | 0.0269 | 0.0367 |
| Recompute (Single Dep) (x1000) | 10,836 | 0.0923 | 0.1755 |
| Recompute (Chain of 10) | 330,812 | 0.0030 | 0.0058 |
| No Recompute (Unchanged) (x1000) | 36,698 | 0.0272 | 0.0363 |
| Lazy (Not Accessed) (x1000) | 2,238 | 0.4467 | 0.9653 |
| Lazy (Accessed Once) (x1000) | 1,265 | 0.7902 | 1.4403 |
| Lazy (Multiple Access) (x1000) | 1,172 | 0.8525 | 1.5398 |
| Cache Invalidation (x1000) | 10,605 | 0.0943 | 0.1109 |
| Diamond Invalidation (x1000) | 11,695 | 0.0855 | 0.1019 |
| Dispose (x1000) | 2,312 | 0.4324 | 0.9908 |
| Dispose Chain | 339,168 | 0.0029 | 0.0034 |

### Effect - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create (Single Dep) (x1000) | 858 | 1.1649 | 2.1721 |
| Create (Multiple Deps) (x1000) | 562 | 1.7789 | 3.3090 |
| Create 10 Effects | 99,268 | 0.0101 | 0.0206 |
| Execution (Dep Change) (x1000) | 18,192 | 0.0550 | 0.0812 |
| Execution (Multiple) (x1000) | 8,869 | 0.1127 | 0.1414 |
| With Computed Dep (x1000) | 17,825 | 0.0561 | 0.0657 |
| Re-runs (10 times) (x1000) | 1,780 | 0.5617 | 0.5965 |
| Multiple on Same Dep (x1000) | 18,083 | 0.0553 | 0.0645 |
| With Cleanup (Creation) (x1000) | 807 | 1.2388 | 2.1342 |
| Cleanup on Dep Change (x1000) | 18,122 | 0.0552 | 0.0638 |
| Dispose (x1000) | 963 | 1.0381 | 1.7156 |
| Dispose (with Cleanup) (x1000) | 939 | 1.0650 | 1.7413 |
| Dispose 10 Effects | 97,768 | 0.0102 | 0.0204 |

### Batch & Untracked - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Batch Update (2) (x1000) | 5,262 | 0.1900 | 0.2579 |
| Batch Update (10) (x1000) | 2,074 | 0.4820 | 0.5560 |
| Batch Update (100) (x1000) | 272 | 3.6726 | 3.7838 |
| Without Batch (10) (x1000) | 2,543 | 0.3932 | 0.4413 |
| With Batch (10) (x1000) | 312 | 3.2009 | 3.3570 |
| Nested Batch (2 levels) (x1000) | 3,825 | 0.2614 | 0.3371 |
| Nested Batch (5 levels) (x1000) | 1,753 | 0.5703 | 0.6527 |
| Batch with Computed (x1000) | 626 | 1.5959 | 1.7123 |
| Batch with Diamond (x1000) | 766 | 1.3052 | 1.4512 |

### Propagation - Micro

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| 1 to 1 (Depth 1000) | 3,646 | 0.2742 | 0.5156 |
| 1 to N (Fan Out 1000) | 5,158 | 0.1939 | 0.2718 |
| N to 1 (Fan In 1000) | 26,685 | 0.0375 | 0.0650 |

### Internal Latency (Internal Structures)

| Benchmark Case | ops/sec (Hz) | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| SlotBuffer: Add 4 items (x1000) | 90,857 | 0.0110 | 0.0227 |
| Array: Push 4 items (baseline) (x1000) | 82,487 | 0.0121 | 0.1010 |
| SlotBuffer: Add 16 items (spill) (x1000) | 15,887 | 0.0629 | 0.1534 |
| Array: Push 16 items (baseline) (x1000) | 35,672 | 0.0280 | 0.1187 |
| SlotBuffer: Churn (8 rem + 8 add) (x1000) | 3,519 | 0.2841 | 0.3865 |
| DepSlotBuffer: Seal + isDirty (4 items) (x1000) | 31,714 | 0.0315 | 0.0399 |
| DepSlotBuffer: Claim existing (Inline hit) (x1000) | 22,201 | 0.0450 | 0.0541 |

## 2. Macro-Benchmarks

### Memory Stress - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create/Dispose 1K Atoms | 3,975 | 0.2515 | 0.6978 |
| Create/Dispose 1K Computeds | 2,996 | 0.3338 | 0.8032 |
| Create/Dispose 1K Effects | 338 | 2.9581 | 3.6547 |
| Rapid GC (10K Cycles) | 562 | 1.7764 | 2.2036 |
| Subscription Churn (1K) | 23,463 | 0.0426 | 0.1539 |
| Object Pooling (10K) | 21 | 46.9428 | 47.4785 |
| Weak Reference Cleanup (1K) | 2,962 | 0.3375 | 0.7955 |
| Effect Cleanup (1K) | 127 | 7.8438 | 8.5362 |
| Circular Reference Cleanup | 21,409 | 0.0467 | 0.0741 |
| Large State Tree (10K) | 990 | 1.0098 | 1.6727 |
| Memory Usage Monitoring | 197 | 5.0586 | 5.6702 |

### Data Grid (1000 Rows) - Macro

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| [Vanilla] Initialize | 4,864 | 0.2056 | 0.4613 |
| [Atom] Initialize | 4,951 | 0.2019 | 0.3933 |
| [Vanilla] Sort (Name) | 4,497 | 0.2224 | 0.2480 |
| [Atom] Sort (Name) | 2,417 | 0.4137 | 0.4748 |
| [Vanilla] Filter (Department) | 507,660 | 0.0020 | 0.0024 |
| [Atom] Filter (Department) | 35,106 | 0.0285 | 0.0383 |
| [Vanilla] Sort + Filter + Paginate | 4,392 | 0.2276 | 0.2551 |
| [Atom] Sort + Filter + Paginate | 2,219 | 0.4506 | 0.5059 |
| Select/Deselect Rows | 2,529 | 0.3954 | 0.7161 |

### Dependency Graphs - Macro

| Pattern | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Deep Chain (100 levels) | 38,590 | 0.0259 | 0.0352 |
| Wide Fan-out (1→100) | 48,290 | 0.0207 | 0.0298 |
| Diamond Pattern | 169,928 | 0.0059 | 0.0066 |
| Pyramid (50 levels) | 62,398 | 0.0160 | 0.0258 |
| Mixed (100A, 200C) | 158,316 | 0.0063 | 0.0071 |
| Circular Avoidance | 736,296 | 0.0014 | 0.0016 |
| Conditional Deps (x1000) | 4,798 | 0.2084 | 0.2277 |
| Array Dynamic Deps (x1000) | 4,814 | 0.2077 | 0.2246 |

### Todo App (100 Items) - Macro

| Action | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Create 100 Todos | 63,643 | 0.0157 | 0.0329 |
| Toggle Completion | 618,309 | 0.0016 | 0.0020 |
| Filter (Active/Completed) (x1000) | 5,277 | 0.1895 | 0.2191 |
| Delete (50 from 100) | 117,928 | 0.0085 | 0.0198 |
| Complete Workflow | 338,230 | 0.0030 | 0.0034 |
| Stats with Auto-update | 104,005 | 0.0096 | 0.0198 |

## 3. Realistic-Benchmarks

### Frame Budget (16ms target)

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| updates per frame (100 atoms) | 78,155 | 0.0128 | 0.0229 |
| updates per frame (100 atoms, batched) | 43,961 | 0.0227 | 0.0333 |

### Memory Stability

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Memory after component churn | 469 | 2.1305 | 2.8550 |

### Batch Efficiency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Form reset (batch) | 213,125 | 0.0047 | 0.0097 |
| Form reset (no batch) | 582,959 | 0.0017 | 0.0023 |

### Input Latency

| Scenario | ops/sec | Mean (ms) | p99 (ms) |
| --- | --- | --- | --- |
| Input to render latency (pure propagation) | 120.91 | 8.2706 | 9.3977 |
