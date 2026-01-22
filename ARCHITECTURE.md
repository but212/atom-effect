# Architecture & Design Decisions

This document outlines the architectural decisions and internal design of `@but212/atom-effect`. It is intended for contributors who wish to understand the "why" behind the code structure.

## Core Design Philosophy

The primary goal of this library is **performance** and **memory efficiency**, specifically optimized for the V8 JavaScript engine. Readability is secondary to these goals.

### V8 Optimizations

The internal class hierarchy is carefully structured to maximize V8's hidden class optimizations and memory layout.

1.  **Smi (Small Integer) Field Packing**:
    *   We prioritize using Small Integers (Smis) for flags and state management.
    *   Fields are ordered to ensure V8 can pack them efficiently.
    *   State flags are bitmasked to reduce the number of properties on object instances.

2.  **Hidden Class Stability**:
    *   The library uses a strict class hierarchy (`ReactiveNode`, `ReactiveDependency`) to ensure objects have stable shapes (Hidden Classes).
    *   Dynamic property addition is strictly avoided. All properties are defined in the constructor or via class fields.

3.  **Abstract Accessors for Memory Layout**:
    *   We use abstract accessors in base classes (like `ReactiveDependency`) to force subclasses to define storage fields (like subscribers) *after* the hot Smi fields.
    *   This ensures that the most frequently accessed data (state flags, versions) is located at the beginning of the object in memory, improving cache locality and access speed.

## Dependency Tracking System

Dependency tracking is the heart of the reactivity system. It uses a centralized logic to manage the graph of Atoms, Computeds, and Effects.

### The Dual-Link Graph

The system maintains a bidirectional graph:
*   **Sources**: Dependencies that a node depends on (e.g., an Effect depends on an Atom).
*   **Observers**: Nodes that depend on this node (e.g., an Atom has an Effect as an observer).

### Logic Centralization

To avoid code duplication and ensure consistent behavior, the core tracking logic is centralized in `packages/core/src/core/dep-tracking.ts`. This module handles:
*   `syncDependencies`: The algorithm to update the dependency graph during re-execution.
*   Link management: efficiently adding/removing links between nodes.

## Reactivity Primitives

The library is built on three main primitives, all sharing the underlying `ReactiveNode` architecture:

1.  **Atom**: The source of truth. It holds a value and notifies observers when changed.
2.  **Computed**: A derived value. It is both a dependency (for others) and an observer (of its inputs). It uses lazy evaluation and caching.
3.  **Effect**: The sink. It observes dependencies and performs side effects. It does not hold a value that others can depend on.

## Batching and Scheduling

Updates can be batched to avoid unnecessary re-computations.
*   **Microtask Batching**: By default, updates are often flushed via microtasks to coalesce multiple synchronous changes.
*   **Synchronous Flushing**: `batch()` can be used to force synchronous execution of effects after a set of mutations.

## Testing Considerations

*   **Max Executions**: To prevent infinite loops, the scheduler has a limit on executions per flush (default 50).
*   **Testing High Load**: Tests that intentionally trigger many updates must explicitly increase `maxExecutionsPerFlush` in their configuration.
