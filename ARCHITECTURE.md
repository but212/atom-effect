# Architecture & Design Decisions

This document outlines the architectural decisions and internal design of `@but212/atom-effect`. It is intended for contributors who wish to understand the rationale behind the code structure.

## Dependency Tracking System

Dependency tracking is central to the reactivity system. It uses centralized logic to manage the graph of Atoms, Computeds, and Effects.

### Subscription-Based Tracking

The dependency tracking uses a subscription pattern:

- **Dependencies** (`_dependencies`): What a node reads from. Computed and Effect maintain an array of dependencies they observed during execution.
- **Subscribers** (`_fnSubs`, `_objSubs`): Who is listening. Atoms and Computed maintain arrays of subscribers that should be notified on change.

### Logic Centralization

To avoid code duplication and ensure consistent behavior, the core tracking logic is centralized in `packages/core/src/core/dep-tracking.ts`. This module handles:

- `syncDependencies`: The algorithm to update the dependency graph during re-execution.
- Link management: Adding/removing links between nodes.

## Reactivity Primitives

The library is built on three main primitives, all sharing the underlying `ReactiveNode` architecture:

1. **Atom**: The source of truth. Holds a value and notifies observers when changed.
2. **Computed**: A derived value. Both a dependency (for others) and an observer (of its inputs). Uses lazy evaluation and caching.
3. **Effect**: The sink. Observes dependencies and performs side effects. Does not expose a value for others to depend on.

## Batching and Scheduling

Updates can be batched to reduce intermediate state notifications.

- **Microtask Batching**: By default, updates are coalesced via microtasks.
- **Synchronous Flushing**: `batch()` can be used to force synchronous execution of effects after a set of mutations.

## Testing Considerations

- **Max Executions**: To prevent infinite loops, the scheduler limits executions per flush (default 100 per effect).
- **Testing High Load**: Tests that intentionally trigger many updates should configure `maxExecutionsPerFlush` appropriately.
