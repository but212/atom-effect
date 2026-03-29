# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect`. It bridges the gap between the core principles and the technical trade-offs required to realize them in a high-performance environment.

---

## 0. The Conceptual Bridge: From Usage to Internals

Before diving into the bitwise flags and version hashing, it is helpful to understand how the high-level API maps to the internal engine.

- **Unified Surface**: While you use `atom`, `computed`, and `effect`, they are all specialized instances of a single internal class: **`ReactiveNode`**. This ensures consistent memory layout (Monomorphism) for V8 optimization.
- **Push-Pull Hybrid**:
  - **Push (Notification Phase)**: When an atom changes, it "pushes" a dirty signal to its immediate subscribers. No calculation happens yet.
  - **Pull (Evaluation Phase)**: When you read a `.value` or when an effect runs, the node "pulls" the latest versions from its dependencies to see if it actually needs to re-compute.
- **The Scheduler's Role**: Effects don't run immediately. They are queued in a **Scheduler**. This allows the library to "coalesce" multiple atom updates into a single effect execution, ensuring efficiency.

---

## 1. Atomic Principles: Autonomous Nodes

The core design focuses on **decentralized responsibility**. Truth is not managed by an external orchestrator; instead, each node is intended to remain the source of truth for its own state.

### Key Mechanisms

1. **Local Versioning**: Nodes track their own `version`. Staleness is determined by comparing a node's current state with what was previously observed by its subscribers.
2. **Implicit Subscriptions**: Relationships are formed through usage. Reading a `.value` registers the caller as a dependency automatically via `trackingContext`.
3. **Lifecycle Snapshots**: For asynchronous tasks, nodes capture a hash of their dependencies' versions (`_asyncStartAggregateVersion`). This allows a node to detect if the "world" has moved on during its execution.

### Core Class Hierarchy

To maximize performance and maintain consistent behavior, the engine uses a unified inheritance structure optimized for **V8 Hidden Class Monomorphism**:

- **`ReactiveNode<T>`**: The single, unified base class for all reactive primitives (**Atoms**, **Computeds**, **Effects**). By merging the roles of **Producer** (observable) and **Consumer** (observer) into a single "God Class", the engine ensures that every reactive object shares a consistent memory layout.
  - **Subscriber Management**: Provides `subscribe()` and `_notifySubscribers()` capabilities.
  - **Dependency Tracking**: Manages a `DepSlotBuffer` and provides optimized dirty checking logic (`_isDirty`).
  - **Type Safety**: Uses generic type `T` to ensure type-safe notifications for subscribers.
- **`AtomImpl<T>`**: A pure producer node that holds mutable state. It extends `ReactiveNode<T>` but keeps its dependency list (`_deps`) null to save memory.
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
   - **Effect**: Before re-executing, `_isDirty()` is called. This performs a **Fast Dirty Check** (efficient O(N) version hash calculation). If the hash is stable, it skips re-evaluation. If not, it performs a full structural walk.

**Trade-off: Fast Path (O(1)/O(N)) vs. Full Walk**
The validation process uses layered heuristics to minimize expensive work. The **Hot-path Check (O(1))** provides instant dirty detection for recurring updates. If that misses, the **Version Hash (O(N))** provides a fast heuristic to avoid a full structural walk. Only if the hash differs does the engine perform a recursive pull of dependencies.

---

## 4. Integrity at the Async Boundary

Async computed nodes are treated as state machines, using **version snapshots** to guard against race conditions.

- **Async Drift Detection**: If dependency versions change between a Promise's start and resolution (detected via a DJB2-based version snapshot), the result is discarded and the node re-evaluates.
- **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

**Implementation Detail**: Bitwise flags (e.g., `PENDING`, `RESOLVED`, `RECOMPUTING`) are used to keep state transitions fast and memory-efficient.

---

## 5. Resource Stewardship: Memory Management

Reactivity systems are prone to memory leaks if subscriptions are not cleaned up. Two mechanisms are used to manage memory efficiently: **Subscriber Management** and **Array Pooling**.

- **DepSlotBuffer (Dependency Tracking)**: A specialized `SlotBuffer` for dependency links. It features:
  - **Mega-Node Optimization**: A hybrid O(1) `Map` fallback when dependencies exceed 32, ensuring performance even for extremely large graphs.
  - **O(1) Free-Index Slot Reuse**: Uses a stack-based index reuse strategy to reclaim nulled slots in $O(1)$ time, eliminating linear scans during subscriber/dependency churn.
  - **Fast Dirty Checking**: An efficient version hash check (`isDirtyFast`) using an unrolled additive hash of all dependency versions. The logic is optimized for monochromatic V8 hidden classes and avoids branching overhead.
  - **Safe Retrieval**: Implements `claimExisting` to reuse existing dependency links during re-evaluation, minimizing churn.
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

### Infinite Loop Defense

Effects can inadvertently create feedback loops (e.g., an effect that writes to an atom it also reads). Layered hard limits are in place to prevent runaway execution:

| Limit | Threshold | Scope |
| :--- | :--- | :--- |
| `MAX_EXECUTIONS_PER_EFFECT` | 100 per flush | Per individual effect |
| `MAX_EXECUTIONS_PER_FLUSH` | 10,000 per flush | Global across all effects (Checked in `incrementFlushExecutionCount`) |
| `MAX_EXECUTIONS_PER_SECOND` | 1,000 / sec (dev only) | Frequency guard per effect |

When a threshold is crossed, an `EffectError` is thrown and the offending effect is disposed to avoid blocking the main thread indefinitely.
