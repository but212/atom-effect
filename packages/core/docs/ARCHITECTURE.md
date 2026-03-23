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
   - **Effect**: Before re-executing, `_isDirty()` is called. This first performs a **Fast Dirty Check** (O(1) version hash comparison). If the hash is stable, it skips re-evaluation. If not, it accesses each computed dependency's `.value` to force re-evaluation and compares `dep.version`.

**Trade-off: Hash Collisions vs. Full Walk**
The version hash acts as a fast heuristic. While theoretically prone to collisions, the additive combination of version and node ID makes it extremely reliable for skipping unnecessary full dependency walks.

---

## 3. Integrity at the Async Boundary

Async computed nodes are treated as state machines, using **version snapshots** to guard against race conditions.

- **Async Drift Detection**: If dependency versions change between a Promise's start and resolution (detected via a DJB2-based version snapshot), the result is discarded and the node re-evaluates.
- **Cancellation**: Only the latest "Promise ID" is allowed to resolve. This prevents slow, stale responses from overwriting newer results.

**Implementation Detail**: Bitwise flags (e.g., `PENDING`, `RESOLVED`, `RECOMPUTING`) are used to keep state transitions fast and memory-efficient.

---

## 4. Resource Stewardship: Memory Management

Reactivity systems are prone to memory leaks if subscriptions are not cleaned up. Two mechanisms are used to manage memory efficiently: **Subscriber Management** and **Array Pooling**.

- **SlotBuffer (Inline Slots)**: A zero-allocation (for up to 4 items) container for subscribers/dependencies. It uses inline object properties (`_s0`...`_s3`) to ensure cache locality and stable V8 hidden classes, only spilling to a lazy overflow array when the inline slots are exhausted.
- **DepSlotBuffer (Dependency Tracking)**: A specialized `SlotBuffer` for dependency links. It features:
  - **Mega-Node Optimization**: A hybrid O(1) `Map` fallback when dependencies exceed 32, ensuring performance even for extremely large graphs.
  - **Fast Dirty Checking**: An O(1) version hash check (`isDirtyFast`) using an additive hash of all dependency versions and IDs to quickly determine if a node *might* be dirty before performing a full structural walk.
  - **Safe Retrieval**: Implements `claimExisting` to reuse existing dependency links during re-evaluation, minimizing churn.

**Trade-off: Complexity vs. Zero-Allocation**
Managing inline slots and hybrid lookups adds internal complexity, but it significantly reduces Garbage Collection (GC) pressure and improves performance in high-frequency update scenarios.

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
