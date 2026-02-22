# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect`. It bridges the gap between the core principles and the technical trade-offs required to realize them in a high-performance environment.

---

## 0. Atomic Principles: Autonomous Nodes

The core design focuses on **decentralized responsibility**. Truth is not managed by an external orchestrator; instead, each node is intended to remain the source of truth for its own state.

### Key Mechanisms

1. **Local Versioning**: Nodes track their own `version`. Staleness is determined by comparing a node's current state with what was previously observed by its subscribers.
2. **Implicit Subscriptions**: Relationships are formed through usage. Reading a `.value` registers the caller as a dependency automatically via `trackingContext`.
3. **Lifecycle Snapshots**: For asynchronous tasks, nodes capture a hash of their dependencies' versions (`_asyncStartAggregateVersion`). This allows a node to detect if the "world" has moved on during its execution.

### The Fundamental Trade-off: Local vs. Global

To make autonomous judgment possible, a **Global Epoch** is accepted. While each node makes its own decision, it does so based on a shared "pulse" of time. Absolute decentralization is traded for the performance and consistency of a single global counter.

---

## 1. The Glitch-Free Guarantee: Epoch & Version

A "glitch" occurs when an inconsistent intermediate state is observed. The approach is to separate the **Moment of Change (Epoch)** from the **Result of Change (Version)**.

- **Global Epoch**: Incremented whenever a mutation starts. It acts as a "logical clock" to identify *when* something happened across the entire system.
- **Local Version**: Incremented only when a node's *value* actually changes.

### Rationale

By comparing `version` instead of just reacting to `epoch`, unnecessary re-calculations are avoided. If a dependency's output is the same as before, nodes further down the chain can stay idle.

---

## 2. Efficiency through Deferral: Two-Phase Propagation

To reduce unnecessary work, a **Notify-and-Check** approach is used.

1. **Phase 1: Notification**: When an atom changes, it notifies its immediate subscribers. For **Computed** nodes, this sets the `DIRTY` flag. For **Effects**, this schedules an execution check via the scheduler.
2. **Phase 2: Evaluation (Sweep)**: The check differs by node type:
   - **Computed**: On `.value` access, evaluates lazily only if the `DIRTY` flag is set.
   - **Effect**: Before re-executing, `_isDirty()` is called, which accesses each computed dependency's `.value` to force re-evaluation, then compares `dep.version` against the stored `link.version`. The effect only re-runs if any version has changed.

**Trade-off: Runtime Overhead vs. Eager Memory**
This "pull-based" evaluation requires a version check walk, which has a small runtime cost. The benefit is that it avoids "ghost updates" where values are calculated but never consumed.

---

## 3. Integrity at the Async Boundary

Async computed nodes are treated as state machines, using **version snapshots** to guard against race conditions.

- **Async Drift Detection**: If dependency versions change between a Promise's start and resolution, the result is discarded and the node re-evaluates.
- **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

**Implementation Detail**: Bitwise flags (e.g., `PENDING`, `RESOLVED`, `RECOMPUTING`) are used to keep state transitions fast and memory-efficient.

---

## 4. Resource Stewardship: Memory Management

Reactivity systems are prone to memory leaks if subscriptions are not cleaned up. Two mechanisms are used to manage memory efficiently: **Subscriber Management** and **Array Pooling**.

- **Subscriber Management**: A linked relationship between dependencies and subscribers is maintained. To minimize memory overhead from managing complex pointers (like double-linked lists), subscriptions are stored in arrays. Cleanup uses a fast $O(1)$ pop-and-swap technique, trading a minor $O(n)$ linear search (acceptable for typically small subscriber lists) for a reduced memory footprint.
- **Dependency Array Pooling**: Instead of allocating new arrays for every evaluation cycle, dependency tracking arrays (`DependencyLink[]`) are acquired from and released back to a pre-allocated global `ArrayPool`. Single link objects can also be reused during effect evaluation to save allocations.

**Trade-off: Complexity vs. GC Pauses**
Managing array lifecycles manually via pooling adds complexity to the internal code, but it is necessary to reduce Garbage Collection (GC) pauses in data-intensive, high-frequency update scenarios.

---

## 5. Security & Boundaries

A **Symmetric Boundary** is enforced between production and consumption.

- **Atoms & Computeds (Pure)**: Intended to be free of side effects. They form the "logic" layer.
- **Effects (Impure)**: The designated place for side effects (DOM mutation, logging, API calls).

**Protection**: `RECOMPUTING` flags are used to detect circular dependencies. If a Computed node is accessed while it is already calculating, an error is raised to protect the integrity of the graph.

### Infinite Loop Defense

Effects can inadvertently create feedback loops (e.g., an effect that writes to an atom it also reads). Layered hard limits are in place to prevent runaway execution:

| Limit | Threshold | Scope |
| :--- | :--- | :--- |
| `MAX_EXECUTIONS_PER_EFFECT` | 100 per flush | Per individual effect |
| `MAX_EXECUTIONS_PER_FLUSH` | 10,000 per flush | Global across all effects |
| `MAX_EXECUTIONS_PER_SECOND` | 1,000 / sec (dev only) | Frequency guard per effect |

When a threshold is crossed, an `EffectError` is thrown and the offending effect is disposed to avoid blocking the main thread indefinitely.
