# Architecture & Design

This document describes the internal architecture of `@but212/atom-effect`. It details the relationship between core reactive principles and the technical implementations designed to optimize performance and reliability.

---

## 0. Conceptual Overview: From API to Engine

The high-level API (`atom`, `computed`, `effect`) is built upon a unified internal execution engine designed for V8 performance and memory efficiency.

- **Unified Base Class**: All reactive primitives are specialized instances of the internal **`ReactiveNode`** class. This ensures a consistent memory layout (Hidden Class Monomorphism), allowing the JavaScript engine to optimize property access.
- **Push-Pull Hybrid Model**:
  - **Push (Notification Phase)**: When a source atom changes, it propagates a "dirty" signal to its immediate subscribers. This phase marks nodes for re-evaluation without performing calculations.
  - **Pull (Evaluation Phase)**: When a node's value is accessed or an effect executes, it performs a "pull" to validate the versions of its dependencies, triggering re-computation only if necessary.
- **Scheduler and Coalescing**: Effects do not execute immediately upon state change. Instead, they are queued in a **Scheduler** that utilizes **Double Buffering** and a **Flat Loop** to coalesce multiple updates into a single execution cycle. This prevents redundant work and avoids call stack overflows.
- **Small Vector Optimization (SVO)**: To minimize heap allocations and garbage collection (GC) pressure, the engine uses inline slots (`_s0` through `_s3`) for the most common dependency and subscriber links before falling back to dynamic arrays. These buffers now implement a standardized **Array-like API** (`length`, `at()`, `push()`) for consistent, high-performance access.
- **Bitwise Branding**: Primitives are identified using a bitwise mask (`BrandFlags`) stored on a single `BRAND` symbol. This allows for constant-time type identification without multiple property lookups.
- **Isolated Debug Metadata**: Debug information such as IDs and names are attached via non-enumerable symbols, ensuring that debugging features do not interfere with object iteration, serialization, or production performance.

---

## 1. Principles of Reactive Nodes

The system is designed around autonomous nodes that manage their own state and dependencies.

### Key Mechanisms

1. **Local Versioning**: Every node maintains a `version` counter. A node determines if it is stale by comparing its stored dependency versions with the current versions of those dependencies.
2. **Implicit Subscription**: Dependency relationships are established automatically when a node's `.value` is read within a reactive context (tracked via `trackingContext`).
3. **Version Snapshots**: Asynchronous operations capture snapshots of dependency versions. If these versions change before the operation completes, the result is considered stale and discarded.

### Class Hierarchy

- **`ReactiveNode<T>`**: The foundation for all primitives. It manages subscriber lists (`_slots`), dependency lists (`_deps`), and state flags. It implements the `Disposable` interface for resource cleanup.
- **`AtomImpl<T>`**: A pure producer node for mutable state. It keeps its dependency list (`_deps`) null to save memory. It handles synchronous re-entrancy through a breadth-first notification loop.
- **`ComputedAtomImpl<T>`**: A hybrid node that acts as both a consumer (of dependencies) and a producer (of derived values). It manages lazy evaluation and result caching.
- **`EffectImpl`**: A pure consumer node for side effects. It keeps its subscriber list (`_slots`) null as it is a terminal node in the graph.

---

## 2. Consistency: Global Epoch and Local Version

To prevent "glitches" (observing inconsistent intermediate states), the engine distinguishes between time and value:

- **Global Epoch**: A global counter incremented whenever a mutation occurs. It serves as a logical clock to identify when changes happen across the system.
- **Local Version**: A node-specific counter incremented only when its *value* actually changes. If a computation re-evaluates but produces the same result (as determined by an equality check), its version remains unchanged, preventing downstream re-evaluations.
- **Zero-Value Reservation**: Both counters avoid the value `0` (wrapping to `1`). This allows `0` to be used as a reliable marker for "uninitialized" or "never seen" states.

---

## 3. Efficiency: Two-Phase Propagation

The engine utilizes a **Notify-and-Check** strategy to minimize redundant computations.

1. **Notification Phase**: A changed atom notifies its immediate subscribers. Computed nodes are marked as `DIRTY`, and effects are scheduled for execution.
2. **Validation Phase (Sweep)**:
   - **Computed**: When accessed, it checks if any dependency has a newer version. It uses a **Hot-path Optimization** (`_hotIndex`) to first check the dependency that most recently caused a change, providing $O(1)$ dirty detection in many cases.
   - **Iterative Check**: Dirty checking and error detection perform an iterative walk using a stack and a `Set` for deduplication. This prevents stack overflow in deep chains and provides consistent $O(1)$ lookup for already-visited nodes.
   - **Effect**: Before execution, it performs a structural walk to verify dependency versions.

---

## 4. Async Boundary Integrity

Asynchronous computed nodes manage their lifecycle as state machines, protecting against race conditions and stale data.

- **Async Drift Detection**: If dependencies change while a Promise is pending, the resolution is ignored, and the computation is re-triggered.
- **Cancellation**: A `_promiseId` ensures that only the most recently initiated asynchronous operation can resolve the node's state.
- **Bitwise Partitioning**: Internal state is managed via a 31-bit integer field (V8 SMI optimized):
  - **[0-7] Core**: `DISPOSED`, `IS_COMPUTED`.
  - **[8-15] Computed**: `DIRTY`, `RECOMPUTING`, `HAS_ERROR`.
  - **[16-23] Async**: `IDLE`, `PENDING`, `RESOLVED`, `REJECTED`.
  - **[24-30] implementation-specific**: `ATOM_SYNC`, `EFFECT_EXECUTING`.

---

## 5. Resource Stewardship

Memory and performance are managed through specialized structures:

- **`DepSlotBuffer`**: A high-speed buffer for dependency tracking that features:
  - **Standardized API**: Implements `length`, `capacity`, `push()`, and `at()` for predictable access patterns.
  - **Manual Optimization**: Uses unrolled loops for inline slots and standard `for` loops for overflow to ensure zero-allocation performance.
  - **Size Duality**: Separates physical capacity from logical length for rapid iteration and hole reuse.
  - **Hybrid Lookup**: Uses an $O(1)$ `Map` fallback when the number of dependencies exceeds 32.
  - **Cache Locality**: Swaps active links to the head of the buffer during re-evaluation.
  - **Link Reuse**: The `claimExisting` logic reuses established dependency links to minimize allocation and subscription overhead.

---

## 6. Security and Boundaries

The engine enforces strict boundaries between logic and side effects.

- **Symmetric Boundary**: Atoms and Computeds are intended to be pure logic. Side effects are restricted to `effect` nodes.
- **Circularity Protection**: The `RECOMPUTING` flag detects synchronous circular dependencies, throwing an error to prevent infinite recursion.
- **Synchronous Tracking Boundary**: Dependency tracking is strictly synchronous. Dependencies accessed after an `await` keyword are not tracked because the `trackingContext` is cleared when the function yields.
- **Scheduler Integrity**:
  - **Deduplication**: Jobs are tagged with an epoch to prevent redundant scheduling within the same cycle.
  - **Flat Loop**: Drains queues without recursion to ensure stack safety.
  - **Memory Clearing**: Internal references are cleared to `undefined` immediately after execution to assist GC.

### Infinite Loop Defense

The system implements hard limits to prevent runaway reactive cycles:

- **Per-Effect**: 100 executions per flush.
- **Global**: 10,000 executions per flush.
- **Frequency**: 1,000 executions per second (Development mode only).

---

## 7. Lenses and Structural Sharing

Lenses provide reactive access to nested properties within monolithic state objects.

- **Structural Sharing**: When updating a value through a lens, only the objects along the modified path are cloned. Unrelated branches maintain reference equality (`===`), preventing unnecessary downstream updates.
- **Security**: The `setDeepValue` utility blocks access to `__proto__`, `constructor`, and `prototype` to prevent prototype pollution.
- **Type Safety**: Recursive utility types (`Paths`, `PathValue`) provide IDE autocompletion up to 8 levels deep. The engine explicitly handles arrays and broad string/number dictionaries, ensuring type stability across complex, dynamic state structures.

---

## 8. Debugging and Observability

The debugging subsystem is designed for deep visibility with minimal production impact.

- **Dual-Controller Strategy**: In development, `DevDebugController` manages node registries and update counters. In production, these are replaced by `ProdDebugController` (no-op), which JavaScript engines can optimize away.
- **WeakRef Registry**: The debug registry uses `WeakRef` to ensure that tracking nodes for inspection does not prevent them from being garbage collected.
- **Traceability**: User-provided names and unique IDs allow for clear identification of offending nodes in warnings (e.g., infinite loop detections).

---

## 9. Error Handling

Errors are treated as part of the reactive graph, enabling robust recovery and traceability.

- **Iterative Accumulation**: Errors are collected using an iterative traversal logic with a stack and a `Set` for deduplication, avoiding recursion overhead.
- **Dependency Isolation**: Accessing error properties (`hasError`, `errors`) is performed in an `untracked` scope to prevent the consumer from inadvertently subscribing to the entire dependency tree of a failing node.
- **Recovery Signals**: The `recoverable` flag indicates whether a node can attempt re-evaluation if its dependencies change.
