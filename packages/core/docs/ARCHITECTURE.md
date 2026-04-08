# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect`. It bridges the gap between the core principles and the technical trade-offs required to realize them in a high-performance environment.

---

## 0. The Conceptual Bridge: From Usage to Internals

Before diving into the bitwise flags and version hashing, it is helpful to understand how the high-level API maps to the internal engine.

- **Unified Surface**: While you use `atom`, `computed`, and `effect`, they are all specialized instances of a single internal class: **`ReactiveNode`**. This ensures consistent memory layout (Monomorphism) for V8 optimization.
  - **Push (Notification Phase)**: When an atom changes, it "pushes" a dirty signal to its immediate subscribers. No calculation happens yet.
  - **Pull (Evaluation Phase)**: When you read a `.value` or when an effect runs, the node "pulls" the latest versions from its dependencies to see if it actually needs to re-compute.
- **The Scheduler's Role**: Effects don't run immediately. They are queued in a **Scheduler**. This allows the library to "coalesce" multiple atom updates into a single effect execution, ensuring efficiency.
- **Small Vector Optimization (SVO)**: To minimize GC overhead and closure heap-allocations, the engine manually unrolls "Small Vector" paths (first 4 slots) for subscriber and dependency link storage.

---

## 1. Atomic Principles: Autonomous Nodes

The core design focuses on **decentralized responsibility**. Truth is not managed by an external orchestrator; instead, each node is intended to remain the source of truth for its own state.

### Key Mechanisms

1. **Local Versioning**: Nodes track their own `version`. Staleness is determined by comparing a node's current state with what was previously observed by its subscribers.
2. **Implicit Subscriptions**: Relationships are formed through usage. Reading a `.value` registers the caller as a dependency automatically via `trackingContext`.
3. **Lifecycle Snapshots**: For asynchronous tasks, nodes capture a snapshot of their dependencies' versions. This allows a node to detect if the "world" has moved on during its execution.

### Core Class Hierarchy

To maximize performance and maintain consistent behavior, the engine uses a unified inheritance structure optimized for **V8 Hidden Class Monomorphism**:

- **`ReactiveNode<T>`**: The single, unified base class for all reactive primitives (**Atoms**, **Computeds**, **Effects**). By merging the roles of **Producer** (observable) and **Consumer** (observer) into a single "God Class", the engine ensures that every reactive object shares a consistent memory layout and avoids hidden class transitions during its lifecycle.
  - **Monomorphic Initialization**: All internal fields (including `_slots`, `_deps`, and `_nextEpoch`) are pre-initialized in the constructor to ensure a stable object shape from the moment of creation.
  - **Subscriber Management**: Provides `subscribe()` and `_notifySubscribers()` capabilities. Automatically cleans up buffer memory by nulling out `_slots` when the last subscriber is removed.
  - **Dependency Tracking**: Manages a `DepSlotBuffer` and provides optimized dirty checking logic (`_isDirty`). Critical tracking loops are manually unrolled for performance.
  - **Type Safety**: Uses generic type `T` to ensure type-safe notifications for subscribers.
- **`AtomImpl<T>`**: A pure producer node that holds mutable state. It extends `ReactiveNode<T>` but keeps its dependency list (`_deps`) null to save memory.
  - **Iterative Sync Notification**: Features a specialized `_flushNotifications()` loop that converts synchronous recursion into iteration. This prevents stack overflow when a subscriber recursively updates the same atom, while ensuring that all state transitions are notified in the correct order.
  - **Bitwise State Integrity**: Uses direct bitwise operations on the `flags` property to ensure atomic state updates and prevent data loss from concurrent flag manipulation.
- **`ComputedAtomImpl<T>`**: A hybrid node that both consumes dependencies and produces a derived value. It fully leverages both producer and consumer facets of `ReactiveNode<T>`.
- **`EffectImpl`**: A pure consumer node that performs side effects. It extends `ReactiveNode<void>` and keeps its subscriber list (`_slots`) null.

### The Fundamental Trade-off: Local vs. Global

To make autonomous judgment possible, a **Global Epoch** is accepted. While each node makes its own decision, it does so based on a shared "pulse" of time. Absolute decentralization is traded for the performance and consistency of a single global counter (managed via `nextEpoch`), which utilizes `SMI_MAX` bitwise wrapping to remain V8-friendly and avoid `0` as an uninitialized state.

---

## 2. The Glitch-Free Guarantee: Epoch & Version

A "glitch" occurs when an inconsistent intermediate state is observed. The approach is to separate the **Moment of Change (Epoch)** from the **Result of Change (Version)**.

- **Global Epoch**: Incremented whenever a mutation starts. It acts as a "logical clock" to identify *when* something happened across the entire system.
- **Local Version**: Incremented only when a node's *value* actually changes.
  - **Sentinel Value**: Both Epoch and Version avoid `0` (wrapping to `1`). This ensures `0` can be used as a reliable "uninitialized" or "never seen" marker across the engine.

### Rationale

By comparing `version` instead of just reacting to `epoch`, unnecessary re-calculations are avoided. If a dependency's output is the same as before, nodes further down the chain can stay idle.

---

### 3. Error Propagation: Beyond Recursion

Errors in a `ComputedAtom` are not just local; they propagate through the dependency graph. Unlike traditional reactive libraries that use recursion, we use an iterative approach for stability.

### Iterative Walk (BFS)

To prevent `RangeError: Maximum call stack size exceeded` in extremely deep chains (e.g., chains with >1,000 nodes), property accessors like `hasError` and `errors` utilize a **Breadth-First Search (BFS)** iterative traversal instead of recursion.

- **Safety**: Guaranteed stack independence regardless of graph depth.
- **Deduplication**: Uses a `Set` to track visited nodes, ensuring each dependency is checked only once.

### HAS_ERROR Bitwise Guard

- **O(1) Local Check**: Each node maintains a `HAS_ERROR` bitwise flag.
- **Transitive Integrity**: While the local flag provides instant detection for the node itself, the iterative walk ensures total graph integrity by discovering errors tucked deep in the upstream tree.

### Async Error Recovery

When an asynchronous computation fails, the atom transitions to the `REJECTED` state and sets `HAS_ERROR`. Upon a dependency change:

1. **Reset**: Both `HAS_ERROR` and `REJECTED` flags are cleared immediately before the retry starts.
2. **Transition**: The atom moves to `IDLE` or `PENDING`, ensuring that subscribers (like UI components) see a clean "loading" state during the recovery attempt instead of a stale error.

## 4. Efficiency through Deferral: Two-Phase Propagation

To reduce unnecessary work, a **Notify-and-Check** approach is used.

1. **Phase 1: Notification**: When an atom changes, it notifies its immediate subscribers. For **Computed** nodes, this sets the `DIRTY` flag. For **Effects**, this schedules an execution check via the scheduler.
2. **Phase 2: Evaluation (Sweep)**: The check differs by node type:
   - **Computed**: On `.value` access, it calls `_isDirty()` to determine if re-computation is needed. This uses a **Hot-path Check**: it first checks the last known dependency that caused a change. If that dependency is still updating, the node is known to be dirty in $O(1)$.
   - **Effect**: Before re-executing, `_isDirty()` is called. This performs a structural walk of dependency versions.

**Trade-off: Fast Path (O(1)) vs. Full Walk (O(N))**
The validation process uses layered heuristics to minimize expensive work. The **Hot-path Check (O(1))** provides instant dirty detection for recurring updates by caching the last dirty index. Only if that misses does the engine perform a structural walk of dependencies.

## 5. Integrity at the Async Boundary

Async computed nodes are treated as state machines, using **version snapshots** to guard against race conditions.

- **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

### Synchronous Tracking Constraint

Reactivity in the engine is **strictly synchronous**. The `trackingContext` (which determines the current subscriber) uses a stack-based `run()` mechanism that restores the previous context immediately after the provided function returns.

- **Why `untracked()` is Sync-Only**: If an async function were passed to `untracked()`, the context would be cleared, the function would return a `Promise`, and the original context would be restored **before** the code after the first `await` even runs. This would lead to "Tracking Leakage" where async code unexpectedly tracks dependencies in the outer scope.
- **The Solution**: For async operations, use `peek()`. Since `peek()` explicitly avoids the `trackingContext` without needing a wrapper, it is safe to use anywhere, including across multiple `await` boundaries.

### Effect Cleanup Isolation

Similarly, effect cleanup functions are executed within an **`untracked()`** scope. This prevents **"Tracking Leakage"** where any reactive reads performed during cleanup (e.g., logging old state or releasing resources) would inadvertently be registered as dependencies for the next execution cycle.

**Implementation Detail**: Bitwise flags (e.g., `PENDING`, `RESOLVED`, `RECOMPUTING`) are used to keep state transitions fast and memory-efficient.

## 6. Resource Stewardship: Memory Management

Reactivity systems are prone to memory leaks if subscriptions are not cleaned up. Two mechanisms are used to manage memory efficiently: **Subscriber Management** and **Array Pooling**.

- **DepSlotBuffer (Dependency Tracking)**: A specialized `SlotBuffer` for dependency links. It features:
  - **Mega-Node Optimization**: A hybrid O(1) `Map` fallback when dependencies exceed 32, ensuring performance even for extremely large graphs.
  - **Synchronization Guarantee**: Internal lookup maps are strictly synchronized during all relocation operations (`insertNew`, `claimExisting`), preventing stale cache hits.
  - **Active Count Tracking**: The `size` property strictly reflects the number of active (non-null) elements, enabling reliable traversal even in sparse buffer scenarios.
  - **O(1) Free-Index Slot Reuse**: Uses a stack-based index reuse strategy to reclaim nulled slots in $O(1)$ time, eliminating linear scans during subscriber/dependency churn.
  - **Manual Loop Unrolling**: Dependency collection and notifications are manually unrolled for the first 4 slots to bypass closure allocations and iterator dispatch.
  - **Automatic Cleanup**: Reactive nodes automatically set `_slots` to `null` when the subscriber count drops to zero during unsubscription or notification compaction, ensuring that idle nodes do not retain empty buffer objects.
  - **Safe Retrieval**: Implemented `claimExisting` to reuse existing dependency links during re-evaluation, minimizing churn.
- **Computed Optimizations**:
  - **Hot-path Check**: Caches the index of the last dirty dependency (`_hotIndex`) to provide $O(1)$ dirty detection for recurring state changes (e.g., animations, scrolls).

**Trade-off: Complexity vs. Zero-Allocation**
Managing inline slots and hybrid lookups adds internal complexity, but it significantly reduces Garbage Collection (GC) pressure and improves performance in high-frequency update scenarios.

## 7. Security & Boundaries

A **Symmetric Boundary** is enforced between production and consumption.

- **Atoms & Computeds (Pure)**: Intended to be free of side effects. They form the "logic" layer.
- **Effects (Impure)**: The designated place for side effects (DOM mutation, logging, API calls).

**Protection**: `RECOMPUTING` flags are used to detect circular dependencies. If a Computed node is accessed while it is already calculating, an error is raised to protect the integrity of the graph.

### Infinite Loop Defense

Effects can inadvertently create feedback loops (e.g., an effect that writes to an atom it also reads). Layered hard limits are in place to prevent runaway execution:

| Limit | Threshold | Scope |
| :--- | :--- | :--- |
| `MAX_EXECUTIONS_PER_EFFECT` | 100 per flush | Per individual effect |
| `MAX_EXECUTIONS_PER_FLUSH` | 10,000 per flush | Global across all effects (Checked in `incrementFlushExecutionCount`) |
| `MAX_EXECUTIONS_PER_SECOND` | 1,000 / sec (dev only) | Frequency guard per effect |

When a threshold is crossed, an `EffectError` is thrown and the offending effect is disposed to avoid blocking the main thread indefinitely.

- **Manual Override**: Calling **`run()`** manually on an effect will reset its local execution counter for the current flush epoch. This allows developers to force execution in scenarios where the safety limits might otherwise block it, provided the trigger is initiated outside of the standard reactive propagation loop.

---

The Core package provides fine-grained reactivity over monolithic state objects via **Lenses**. A lens is a first-class **`LensImpl`** node (subclass of `ReactiveNode`) that acts as a bidirectional bridge between a parent atom and focused consumers.

### Fine-Grained Filtering

Unlike a simple proxy, a `LensImpl` implements a **Granular Dirty Check** (`_deepDirtyCheck`):

1. **Lazy Consumption**: It only subscribes to the parent atom when it has its own active subscribers.
2. **Notification Filtering**: When the parent atom notifies, the lens pulls its specific sub-value and performs an `Object.is` check. It only increments its own `version` and notifies its listeners if its specific "slice" was affected.
3. **Peek Optimization**: The lens getter uses `peek()` to read the parent value. This ensures that a consumer (e.g., an effect) only adds the *lens* as a dependency, not the whole parent atom, preventing accidental "Leakage" of reactivity.

### Path Flattening

To avoid the performance degradation of nested reactive nodes, `atomLens` performs **Flattening** at creation time. If you create a lens from another lens, the engine merges the paths and points directly to the original parent atom. This ensures $O(1)$ notification depth regardless of composition complexity.

### Structural Sharing Logic

When a value is updated through a lens, the `setDeepValue` recursive helper creates a new object tree:

1. **Path Cloning**: Only clones the nodes along the specific path from the root to the leaf.
2. **Reference Preservation**: All other branches are preserved by reference. Unrelated effect nodes remain reference-equal (`===`), preventing "Re-render Storms".
3. **Monomorphic Equality**: Uses `Object.is` for zero-allocation identity checks before triggering parent atom updates.

### Type-Safe Paths

Lenses utilize recursive utility types (`Paths<T>`, `PathValue<T, P>`) to enforce safety:

- **Autocompletion**: Enumerates all possible dot-separated paths up to **8 levels deep** (V8 Smi-friendly recursion limit). Now intelligently filters out prototype methods and provides explicit support for numeric array indices (`${number}`).
- **Inference**: Precisely resolves the resulting type, eliminating `any` casts in user code. Now more robust with optional path handling.

### Subscription Lifecycle

Every lens maintains an internal connection to the parent atom managed via `subscribe()` counts. Calling `lens.dispose()` (supported via `[Symbol.dispose]`) disconnects this bridge and marks the lens as disposed, blocking any future setter operations to protect the integrity of the state tree.
