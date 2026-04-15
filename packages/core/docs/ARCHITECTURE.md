# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect`. It bridges the gap between the core principles and the technical trade-offs required to realize them in a high-performance environment.

---

## 0. The Conceptual Bridge: From Usage to Internals

Before diving into the bitwise flags and version hashing, it is helpful to understand how the high-level API maps to the internal engine.

- **Unified Surface**: While you use `atom`, `computed`, and `effect`, they are all specialized instances of a single internal class: **`ReactiveNode`**. This ensures consistent memory layout (Monomorphism) for V8 optimization.
  - **Push (Notification Phase)**: When an atom changes, it "pushes" a dirty signal to its immediate subscribers. No calculation happens yet.
  - **Pull (Evaluation Phase)**: When you read a `.value` or when an effect runs, the node "pulls" the latest versions from its dependencies to see if it actually needs to re-compute.
- **The Scheduler's Role**: Effects don't run immediately. They are queued in a **Scheduler**. This allows the library to "coalesce" multiple atom updates into a single effect execution, ensuring efficiency. The scheduler uses a **Double Buffering** strategy and a **Flat Loop** to ensure execution stability and prevent call stack overflows during recursive updates.
- **Small Vector Optimization (SVO)**: To minimize GC overhead and closure heap-allocations, the engine manually unrolls "Small Vector" paths (first 4 slots) for subscriber and dependency link storage.
- **Bitwise Branding Strategy**: To ensure high-performance type identification, all reactive primitives carry a single `BRAND` symbol property. Instead of checking for the existence of multiple distinct symbols, the engine uses a bitwise mask (`BrandFlags`) to verify if a node is an Atom, Computed, or Effect in a single constant-time operation.
- **Zero-cost Debug Metadata**: Debug information (ID, Type, Name) is injected using non-enumerable symbols. This ensures that debugging metadata does not interfere with object iteration (`Object.keys`), serialization (`JSON.stringify`), or production performance while providing deep traceability during development.

---

## 1. Atomic Principles: Autonomous Nodes

The core design focuses on **decentralized responsibility**. Truth is not managed by an external orchestrator; instead, each node is intended to remain the source of truth for its own state.

### Key Mechanisms

1. **Local Versioning**: Nodes track their own `version`. Staleness is determined by comparing a node's current state with what was previously observed by its subscribers.
2. **Implicit Subscriptions**: Relationships are formed through usage. Reading a `.value` registers the caller as a dependency automatically via `trackingContext`.
3. **Lifecycle Snapshots**: For asynchronous tasks, nodes capture a snapshot of their dependencies' versions. This allows a node to detect if the "world" has moved on during its execution.

### Core Class Hierarchy

To maximize performance and maintain consistent behavior, the engine uses a unified inheritance structure optimized for **V8 Hidden Class Monomorphism**:

- **`ReactiveNode<T>`**: The single, unified base class for all reactive primitives (**Atoms**, **Computeds**, **Effects**). Implements the **`Disposable`** interface for explicit resource management. By merging the roles of **Producer** (observable) and **Consumer** (observer) into a single "God Class", the engine ensures that every reactive object shares a consistent memory layout.
  - **Subscriber Management**: Provides `subscribe()` and `_notifySubscribers()` capabilities.
  - **Dependency Tracking**: Manages a `DepSlotBuffer` and provides optimized dirty checking logic (`_isDirty`). Critical tracking loops are manually unrolled for performance.
  - **Type Safety**: Uses generic type `T` to ensure type-safe notifications for subscribers.
- **`AtomImpl<T>`**: A pure producer node that holds mutable state. It extends `ReactiveNode<T>` but keeps its dependency list (`_deps`) null to save memory. Implements a **Breadth-First Notification Loop** to handle synchronous re-entrancy and a **Net-Zero Guard** to suppress redundant notifications.
- **`ComputedAtomImpl<T>`**: A hybrid node that both consumes dependencies and produces a derived value. It fully leverages both producer and consumer facets of `ReactiveNode<T>`.

- **`EffectImpl`**: A pure consumer node that performs side effects. It extends `ReactiveNode<void>` and keeps its subscriber list (`_slots`) null.

### The Fundamental Trade-off: Local vs. Global

To make autonomous judgment possible, a **Global Epoch** is accepted. While each node makes its own decision, it does so based on a shared "pulse" of time. Absolute decentralization is traded for the performance and consistency of a single global counter.

---

## 2. The Glitch-Free Guarantee: Epoch & Version

A "glitch" occurs when an inconsistent intermediate state is observed. The approach is to separate the **Moment of Change (Epoch)** from the **Result of Change (Version)**.

- **Global Epoch**: Incremented whenever a mutation starts. It acts as a "logical clock" to identify *when* something happened across the entire system.
- **Local Version**: Incremented only when a node's *value* actually changes.
  - **Sentinel Value**: Both Epoch and Version avoid `0` (wrapping to `1`). This ensures `0` can be used as a reliable "uninitialized" or "never seen" marker across the engine.

### Rationale

By comparing `version` instead of just reacting to `epoch`, unnecessary re-calculations are avoided. If a dependency's output is the same as before, nodes further down the chain can stay idle.

---

## 3. Efficiency through Deferral: Two-Phase Propagation

To reduce unnecessary work, a **Notify-and-Check** approach is used.

1. **Phase 1: Notification**: When an atom changes, it notifies its immediate subscribers. For **Computed** nodes, this sets the `DIRTY` flag. For **Effects**, this schedules an execution check via the scheduler.
2. **Phase 2: Evaluation (Sweep)**: The check differs by node type:
   - **Computed**: On `.value` access, it calls `_isDirty()` to determine if re-computation is needed. This uses a **Hot-path Check**: it first checks the last known dependency that caused a change. If that dependency is still updating, the node is known to be dirty in $O(1)$.
   - **Effect**: Before re-executing, `_isDirty()` is called. This performs a structural walk of dependency versions.

**Trade-off: Fast Path (O(1)) vs. Full Walk (O(N))**
The validation process uses layered heuristics to minimize expensive work. The **Hot-path Check (O(1))** provides instant dirty detection for recurring updates by caching the last dirty index. Only if that misses does the engine perform a structural walk of dependencies.

---

## 4. Integrity at the Async Boundary

Async computed nodes are treated as state machines, using **version snapshots** to guard against race conditions.

- **Async Drift Detection**: If dependency versions change between a Promise's start and resolution (detected via a version snapshot), the result is discarded and the node re-evaluates.
- **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

### Bitwise State Management

To keep state transitions fast and memory-efficient, `ReactiveNode` utilizes a single 31-bit integer field (V8 SMI optimized) to manage all internal status flags. This field is strictly partitioned to avoid bit collisions across different node types and lifecycles:

- **[0-7] Shared Core**: Common flags like `DISPOSED` and identity markers like `IS_COMPUTED`.
- **[8-15] Computed States**: Management of `DIRTY`, `RECOMPUTING`, and `HAS_ERROR` states.
- **[16-23] Async Lifecycle**: Tracking partitioned states for asynchronous operations (Idle, Pending, Resolved, Rejected).
- **[24-30] Primitive Specific**: Specialized flags for specific implementations, such as `ATOM_SYNC` or `EFFECT_EXECUTING`.

---

## 5. Resource Stewardship: Memory Management

Reactivity systems are prone to memory leaks if subscriptions are not cleaned up. Two mechanisms are used to manage memory efficiently: **Subscriber Management** and **Array Pooling**.

- **DepSlotBuffer (Dependency Tracking)**: A specialized high-speed buffer for dependency tracking cycles. It features:
  - **Size Duality**: Distinguishes between Physical Boundary and Logical Size to support fast iteration while maintaining hole-reuse capabilities.
  - **Mega-Node Optimization**: A hybrid O(1) `Map` fallback when dependencies exceed 32, ensuring performance even for extremely large graphs.
  - **Dense-head Structure**: Swaps existing links to the current track index to maintain cache locality.
  - **Manual Loop Unrolling**: Dependency collection and notifications prioritize inline slots (_s0.._s3) to bypass closure allocations and iterator dispatch.
  - **Safe Retrieval**: Implemented `claimExisting` to reuse existing dependency links during re-evaluation, minimizing churn.
- **Computed Optimizations**:
  - **Hot-path Check**: Caches the index of the last dirty dependency (`_hotIndex`) to provide $O(1)$ dirty detection for recurring state changes (e.g., animations, scrolls).

**Trade-off: Complexity vs. Zero-Allocation**
Managing inline slots and hybrid lookups adds internal complexity, but it significantly reduces Garbage Collection (GC) pressure and improves performance in high-frequency update scenarios.

---

## 6. Security & Boundaries

A **Symmetric Boundary** is enforced between production and consumption.

- **Atoms & Computeds (Pure)**: Intended to be free of side effects. They form the "logic" layer.
- **Effects (Impure)**: The designated place for side effects (DOM mutation, logging, API calls).

**Protection**: `RECOMPUTING` flags are used to detect circular dependencies. If a Computed node is accessed while it is already calculating, an error is raised to protect the integrity of the graph.

### The Synchronous Tracking Boundary

While `@but212/atom-effect` fully supports asynchronous `computed` and `effect` nodes, **dependency tracking is a strictly synchronous process**.

- **Why**: Tracking relies on a global, synchronous stack (`trackingContext`). When a function `await`s, it yields control to the event loop. By the time it resumes, the tracking context has already been popped or replaced.
- **Accessing Values After Await**: You can still read `.value` after an `await` boundary to get the current state, but these reads **will not be registered as dependencies**. The node will not re-evaluate when those specific dependencies change.

- **The Pattern**: Always read your reactive dependencies at the top of your function, before the first `await`.

```typescript
// ❌ WRONG: 'atom2' will not be tracked
computed(async () => {
  await someAsyncCall();
  return atom2.value;
});

// ✅ CORRECT: 'atom2' is tracked
computed(async () => {
  const val = atom2.value; // Captured synchronously
  await someAsyncCall();
  return val;
});
```

### Execution Engine (Scheduler)

The scheduler orchestrates state propagation and effect execution using a microtask-based loop.

#### Key Mechanics

- **Epoch-based Deduplication**: Every job is tagged with a version (epoch). If a job is scheduled multiple times within the same epoch, subsequent requests are ignored.
- **Double Buffering**: Ingests new jobs into a dormant buffer while processing the active one, ensuring stable iteration and preventing "queue jumping".
- **Flat Loop Drainage**: Drains both main and batch queues in a single non-recursive loop. This prevents call stack overflows even under heavy reactive churn or deeply nested `batch()` calls.
- **Memory Safety**: Explicitly clears internal array references (`undefined`) immediately after a job executes. This ensures closures are not retained longer than necessary, aiding Garbage Collection in long-running apps.

#### `aeNextTick` Synchronization

`aeNextTick` provides a public interface for synchronizing with the scheduler's internal state. Unlike a generic `Promise.resolve().then()`, `aeNextTick` schedules a job on the internal queue (`scheduler.schedule()`).

This ensures that:

1. It executes **after** all reactive effects that were already queued.
2. It correctly participates in `batch()` cycles, resolving only after the synchronous flush completes.
3. It respects the internal `epoch` system, preventing premature resolution during complex re-evaluation cycles.
4. **Promise Deduplication**: To minimize GC pressure and scheduler overhead, multiple calls to `aeNextTick()` without a callback share a single pending promise. Subsequent calls return the same promise instance until the scheduler flush completes and clears the shared reference.

### Infinite Loop Defense

Effects can inadvertently create feedback loops (e.g., an effect that writes to an atom it also reads). Layered hard limits are in place to prevent runaway execution:

| Limit | Threshold | Scope |
| :--- | :--- | :--- |
| `MAX_EXECUTIONS_PER_EFFECT` | 100 per flush | Per individual effect |
| `MAX_EXECUTIONS_PER_FLUSH` | 10,000 per flush | Global across all effects (Checked in `incrementFlushExecutionCount`) |
| `MAX_EXECUTIONS_PER_SECOND` | 1,000 / sec (dev only) | Frequency guard per effect |

When a threshold is crossed, an `EffectError` is thrown and the offending effect is disposed to avoid blocking the main thread indefinitely.

---

## 7. Lenses & Structural Sharing

The Core package provides fine-grained reactivity over monolithic state objects via **Lenses**. A lens is a "virtual atom" that points to a specific dot-path within a parent atom.

### Structural Sharing Logic

When a value is updated through a lens, the `setDeepValue` recursive helper creates a new object tree:

1. **Security Guard**: Blocks all access to `__proto__`, `constructor`, and `prototype` keys. Any path containing these segments is treated as `undefined` for reads and a no-op for writes, preventing prototype pollution attacks.
2. **Path Cloning**: Only clones the nodes along the specific path from the root to the leaf.
3. **Reference Preservation**: All other branches are preserved by reference. Unrelated effect nodes remain reference-equal (`===`), preventing "Re-render Storms".
4. **Monomorphic Equality**: Uses `Object.is` for zero-allocation identity checks before triggering parent atom updates.

### Type-Safe Paths

Lenses utilize recursive utility types (`Paths<T>`, `PathValue<T, P>`) to enforce safety:

- **Autocompletion**: Enumerates all possible dot-separated paths up to **8 levels deep** (V8 Smi-friendly recursion limit).
- **Method Filtering**: Automatically excludes prototype methods (e.g., `push`, `pop` on arrays) to keep autocompletion focused strictly on data paths.
- **Inference**: Precisely resolves the resulting type, eliminating `any` casts in user code.

### Subscription Lifecycle

Every lens maintains an internal set of parent atom subscriptions. Calling `lens.dispose()` (or using `[Symbol.dispose]()` via the `using` keyword) shuts down these bridges, ensuring zero memory usage for high-churn patterns (e.g., dynamic forms or list item lensing). Improved type safety in `PathValue` and `Paths` now correctly handles nullable and optional properties within the state tree.

---

## 8. Debugging Subsystem & DevTools Readiness

The engine includes a sophisticated debugging layer designed to provide deep observability while maintaining a pay-only-for-what-you-use" performance profile.

### Dual-Controller Strategy (Zero-Overhead)

To eliminate conditional branching (`if (dev)`) on critical hot paths, the engine employs a **Monomorphic Singleton Swap**:

- **`DevDebugController`**: Active in development. It manages update counters, maintains the node registry, and issues contextual arnings.
- **`ProdDebugController`**: An inert, no-op implementation. Modern JS engines can inline these empty calls, effectively removing ebugging overhead from the production execution path.

### WeakRef-based Node Registry

The `debug` controller maintains a global catalog of all active reactive nodes (Atoms, Computeds, Effects).

- **Registry Mechanism**: Every node is automatically registered upon creation.
- **Memory Safety**: The registry uses **`WeakRef`** to store references. This ensures the debugger itself never prevents a reactive ode from being garbage collected once it is no longer needed by the application.
- **Inspection**: The `debug.dumpGraph()` API allows external DevTools to snapshot the entire reactive state, including update requencies and node relationships, without manual instrumentation.

### Infinite Loop Detection & Naming

The engine automatically calls `debug.trackUpdate(id, name)` during every state mutation (Atom), invalidation (Computed), or execution (Effect).

- **Contextual Warnings**: When the `LOOP_THRESHOLD` (default: 100) is exceeded within a single execution scope, the engine issues a arning.
- **Name-based Traceability**: By capturing the user-provided `name` (or auto-generated alias), the warning clearly identifies the ffending node (e.g., `Infinite loop detected for userProfile_atom`), drastically reducing the time needed to debug complex reactive ycles.

### Production Runtime Toggle

To support troubleshooting in production environments, the `IS_DEV` check includes a fallback for `globalThis.__ATOM_DEBUG__` and `sessionStorage.getItem('__ATOM_DEBUG__')`. Because the implementation is evaluated at load time to preserve zero-overhead execution paths, you must set this flag **before** the library loads, or by setting it in session storage and refreshing the page:

```javascript
sessionStorage.setItem('__ATOM_DEBUG__', 'true');
// Reload the page
```

This bypasses the production no-op implementation, enabling full tracking and inspection capabilities on any distribution artifact without requiring a re-build.

---

## 9. Error Handling & Traceability

Reactivity creates invisible links between distant parts of an application. When an error occurs, knowing *what* failed is often less important than knowing *where it came from* and *how it traveled*.

### Chainable Context Tracking

The engine uses a **Context Accumulation** strategy. When an error propagates through the graph (e.g., from an Atom to a Computed, then to an Effect), each stage "wraps" the error with its own context using `wrapError`.

- **Traceability**: Unlike standard errors that only show a stack trace, `AtomError` preserves a "logical trace" of the reactive nodes.
- **Programmatic Inspection**: The `getChain()` method allows tools to walk this logical path without parsing stack strings.

### Dependency Isolation in Error Queries

Accessing error-related properties like `hasError` or `errors` is automatically wrapped in an `untracked` scope.

- **Graph Pollution Prevention**: This ensures that while a caller can react to the *presence* of an error in a computation, it does not accidentally subscribe to the entire deep dependency tree of that computation.
- **Predictable Re-execution**: The caller only re-executes if the computed node's own error state changes, preventing unnecessary re-runs when unrelated internal child nodes of the computation change in ways that don't affect the final error status.

### Policy-Driven Recovery

The `recoverable` flag acts as a signal to the execution engine:

- **Recoverable (`true`)**: The node is marked as having an error, but its subscribers are notified that they can try to re-evaluate if the environment changes.
- **Non-recoverable (`false`)**: The error is considered fatal for that specific branch of the graph, and the engine may stop further attempts to execute the node until manual intervention or disposal occurs.

### Data Integrity

Since JavaScript allows throwing any value, the engine treats the `cause` as `unknown`. This ensures that if a developer throws a complex metadata object, it remains fully intact and inspectable by the top-level error handler or global `onError` hook.
