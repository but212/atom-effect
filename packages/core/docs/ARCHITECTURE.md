# Architecture & Design

This document describes the internal architecture of `@but212/atom-effect`. It details the relationship between core reactive principles and the technical implementations designed to optimize performance and reliability.

---

## 0. Conceptual Overview: From API to Engine

The high-level API (`atom`, `computed`, `effect`) is built upon a unified internal execution engine designed for V8 performance and memory efficiency.

- **Unified Core Interface**: All reactive primitives implement the internal **`ReactiveNode`** interface. This ensures a consistent data structure and property layout across different node types, allowing the engine to handle them uniformly and efficiently.
- **Push-Pull Hybrid Model**:
  - **Push (Notification Phase)**: When a source atom changes, it propagates a "dirty" signal to its immediate subscribers. This phase marks nodes for re-evaluation without performing calculations.
  - **Pull (Evaluation Phase)**: When a node's value is accessed or an effect executes, it performs a "pull" to validate the versions of its dependencies, triggering re-computation only if necessary.
- **Scheduler and Coalescing**: Effects do not execute immediately upon state change. Instead, they are queued in a **`ReactiveScheduler`** (defined in `core/scheduler.ts`) that utilizes a **Double-Buffering Strategy** (Active, Standby, Batch). The scheduler is implemented as an encapsulated class, ensuring that internal scheduling state remains protected during execution cycles while maintaining high cache locality.
- **Lightweight Tracking**: Dependency tracking is managed via a plain `TrackingContext` object with dedicated free functions (`pushTrackingSubscriber`, `popTrackingSubscriber`, `rollbackTrackingSubscriber`). This approach minimizes object creation overhead while providing deterministic recovery during nested evaluations or error scenarios. The core engine utilizes native `try/catch` and `null/undefined` in high-frequency hot paths to minimize allocation overhead.
- **SMI Optimization**: The engine explicitly ensures that hot-path integers (versions, epochs, session IDs) stay within V8's **Small Integer (SMI)** range (31-bit signed). This prevents performance-degrading transitions from SMIs to heap-allocated doubles (HeapNumbers).
- **Small Vector Optimization (SVO)**: To minimize heap allocations and GC pressure, the engine uses inline slots (`_s0` through `_s3`) tracked by a **4-bit occupancy mask**. These buffers implement a standardized **Array-like API** (`length`, `at()`, `push()`) and use explicit constructor initialization to ensure V8 Hidden Class stability, preventing polymorphic transitions during high-frequency slot discovery.
- **Bitwise Branding**: Primitives are identified using a bitwise mask (`BrandFlags`) stored on a single `BRAND` symbol, defined in `constants/branding.ts`. This allows for constant-time type identification without multiple property lookups.
- **Strategy-Based Notification**: Subscriber notifications use a dispatch table strategy (in `core/base.ts`) to eliminate conditional branching in hot notification loops, improving JIT dispatch performance.
- **Isolated Debug Metadata**: Debug information such as IDs and names are attached via non-enumerable symbols, ensuring that debugging features do not interfere with object iteration, serialization, or production performance.

---

## 1. Principles of Reactive Nodes

The system is designed around autonomous nodes that manage their own state and dependencies.

### Key Mechanisms

1. **Local Versioning**: Every node maintains a `version` counter. A node determines if it is stale by comparing its stored dependency versions with the current versions of those dependencies.
2. **Implicit Subscription**: Dependency relationships are established automatically when a node's `.value` is read within a reactive context (tracked via `trackingContext`).
3. **Version Snapshots**: Asynchronous operations capture snapshots of dependency versions. If these versions change before the operation completes, the result is considered stale and discarded.

### Class Hierarchy

- **`ReactiveNode<T>`**: The foundation for all primitives. It defines a standardized data structure including versioning, status flags, and a dedicated `_storage` object for managing subscriber lists and dependency buffers.
- **`AtomImpl<T>`**: A pure producer node for mutable state. Engine-visible fields (`flags`, `version`, `_storage`) are exposed as **public properties** for V8 monomorphic access, while value storage and notification scheduling remain **private (`#`)**. Maintains synchronous re-entrancy through a breadth-first notification loop.
- **`ComputedAtomImpl<T>`**: A hybrid node that acts as both a consumer (of dependencies) and a producer (of derived values). Follows the same dual-layer strategy: public engine fields for graph traversal, private fields for computation state, session tracking, and result caching.
- **`EffectImpl`**: A pure consumer node for side effects. It keeps its subscriber list (`_storage.slots`) null as it is a terminal node in the graph, managing its execution lifecycle and budget state through private orchestration fields.

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
   - **Iterative Check**: Dirty checking and error detection perform an iterative walk using a stack and a `Set` for deduplication. It utilizes **lookup tables** for state validation to manage internal transitions without explicit conditional branching. This prevents stack overflow in deep chains and provides consistent $O(1)$ lookup for already-visited nodes.
   - **Effect**: Before execution, it performs a structural walk to verify dependency versions.

---

## 4. Async Boundary Integrity

Asynchronous computed nodes manage their lifecycle as state machines, protecting against race conditions and stale data.

- **Async Drift Detection**: If dependencies change while a Promise is pending, the resolution is ignored. This is handled via an integrated `isDirty` check during the resolution phase. Resolution and state updates occur within the microtask cycle following the settlement of the Promise.
- **Session Management**: A rolling `_activeSessionId` (SMI optimized) ensures that only the result from the most current asynchronous session can resolve the node's state, preventing race conditions from stale computations.
- **Bitwise Partitioning**: Internal state is managed via a 31-bit integer field (V8 SMI optimized) with flags defined in `constants/flags.ts`:
  - **[0-7] Core**: `DISPOSED`, `IS_COMPUTED`.
  - **[8-15] Computed**: `DIRTY`, `RECOMPUTING`, `HAS_ERROR`.
  - **[16-23] Async**: `IDLE`, `PENDING`, `RESOLVED`, `REJECTED`.
  - **[24-30] implementation-specific**: `ATOM_SYNC`, `EFFECT_EXECUTING`.

---

## 5. Resource Stewardship

Memory and performance are managed through specialized structures:

- **`DependencyBuffer`**: A lightweight state container with module-level free functions for dependency tracking:
  - **Reconciliation API**: Uses exported functions (`claimExisting`, `insertNew`, `depBufferTruncateFrom`) for predictable access and memory efficiency.
  - **Memory Efficiency**: Transitions from linear scans to an $O(1)$ `Map` lookup only when the dependency count exceeds a performance threshold. The map is lazily initialized and released when the buffer shrinks below the threshold, reclaiming memory on long-lived nodes.
  - **Bitmask State**: Buffer status (e.g., `HAS_COMPUTEDS`) is encoded into a `flags` bitmask for efficient bulk checks and future extensibility.

---

## 6. Security and Boundaries

The engine enforces strict boundaries between logic and side effects.

- **Symmetric Boundary**: Atoms and Computeds are intended to be pure logic. Side effects are restricted to `effect` nodes.
- **Circularity Protection**: The `RECOMPUTING` flag detects synchronous circular dependencies, throwing an error to prevent infinite recursion.
- **Deterministic Tracking Recovery**: The tracking context uses a stack depth pointer and a **`rollbackTrackingSubscriber()`** mechanism to restore state after errors. This mechanism avoids the overhead associated with `try-finally` blocks in the core execution loops while maintaining context integrity.
- **Synchronous Tracking Boundary**: Dependency tracking is strictly synchronous. Dependencies accessed after an `await` keyword are not tracked because the `trackingContext` is cleared when the function yields.
- **Scheduler Integrity**:
  - **Deduplication**: Jobs are tagged with an epoch to prevent redundant scheduling within the same cycle.
  - **Double-Buffering**: Uses active and standby buffers within the **`SchedulerState`** to allow safe job scheduling even during an active flush cycle.
  - **Flat Loop**: Drains queues without recursion via **`schedulerDrainQueue`** (in `core/scheduler.ts`) to ensure stack safety.
  - **Memory Clearing**: Internal references in buffers are cleared to `undefined` immediately after execution to assist GC.

### Infinite Loop Defense

The system implements hard limits to prevent runaway reactive cycles:

- **Per-Effect**: 100 executions per flush.
- **Global**: 10,000 executions per flush.
- **Frequency**: 1,000 executions per second (Development mode only).

---

## 7. Lenses and Structural Sharing

Lenses provide reactive access to nested properties within monolithic state objects.

- **Structural Sharing**: When updating a value through a lens, only the objects along the modified path are cloned. Unrelated branches maintain reference equality (`===`), preventing unnecessary downstream updates. The engine explicitly handles Arrays, Maps, Sets, and custom Class prototypes, ensuring structural integrity and prototype preservation.
- **Security**: The `setDeepValue` utility blocks access to `__proto__`, `constructor`, and `prototype` to prevent prototype pollution.
- **Type Safety**: Recursive utility types (`Paths`, `PathValue`) provide IDE autocompletion up to 8 levels deep.

---

## 8. Debugging and Observability

The debugging subsystem is designed for deep visibility with minimal production impact.

- **Class-based Diagnostic Hub**: In development, an encapsulated `DebugController` class manages node registries and update counters. In production, these are replaced by a static no-op controller, which JavaScript engines can optimize away or inline for zero runtime overhead.
- **Encapsulated Instrumentation**: By utilizing class-based controllers, the debug system isolates diagnostic state from the core reactive logic, ensuring that instrumentation does not interfere with engine performance or stability.
- **Finalization Tracking**: The debug registry uses `FinalizationRegistry` paired with `WeakRef` to ensure that tracking nodes for inspection does not prevent them from being garbage collected, while providing automatic metadata cleanup.
- **Traceability**: Errors are wrapped with contextual messages and machine-readable codes for easier debugging.

---

## 9. Error Handling

Errors are treated as part of the reactive graph, enabling robust recovery and traceability.

- **Iterative Accumulation**: Errors are collected using an iterative traversal logic (**`collectErrorsRecursive`**) with a stack and a `Set` for deduplication, avoiding recursion overhead.
- **Dependency Isolation**: Accessing error properties (`hasError`, `errors`) is performed in an `untracked` scope to prevent the consumer from inadvertently subscribing to the entire dependency tree of a failing node.
- **Recovery Signals**: The `recoverable` flag indicates whether a node can attempt re-evaluation if its dependencies change.

---

## 10. Encapsulation Strategy

The engine uses a **dual-layer encapsulation** model optimized for both V8 performance and API safety:

- **Public Engine Fields**: Properties required by the reactive graph traversal engine (`flags`, `version`, `_lastSeenEpoch`, `_trackEpoch`, `_trackCount`, `_error`, `_storage`) are declared as **public class fields**. This ensures V8 generates stable Hidden Classes with direct property access, avoiding getter/setter overhead in hot-path operations like dirty checking and notification.
- **Private Behavioral State**: Properties that control node-specific behavior (values, computation functions, equality checks, cleanup handles, session IDs, budget state) use **native private class fields (`#`)**. This protects behavioral invariants from external mutation while keeping the engine-visible shape uniform across node types.
- **Monomorphic Consistency**: All reactive node types (`AtomImpl`, `ComputedAtomImpl`, `EffectImpl`) follow the same field layout strategy, ensuring that shared engine functions (`nodeNotifySubscribers`, `nodeTrackDependency`, etc.) encounter a consistent property access pattern and remain monomorphic in V8's inline caches.
- **Modern Syntax**: Adoption of logical assignment operators and other ES2022 features to reduce boilerplate and improve code clarity without sacrificing performance.
