# Architecture & Design

This document explains the internal mechanics of `@but212/atom-effect`. It is intended for developers who want to understand "how it works under the hood" or contribute to the core.

## 1. The Glitch-Free Guarantee

A "glitch" occurs when a computed value is observed in an inconsistent intermediate state during an update. We solve this using **Epoch-based State Versioning**.

### The Concept

Every time a mutation starts (e.g., `atom.value = ...`), we increment a global **Epoch** counter.
Every signal (atom, computed) tracks:

1. `version`: When it last changed.
2. `lastSeenEpoch`: When it was last verified.

When you read a `computed` value, it checks:
> "Are any of my dependencies changed since I last ran?"

It does this recursively (topological sort via recursion), ensuring you *always* see the most up-to-date value, even in "Diamond Dependency" graphs.

## 2. Two-Phase Propagation

To optimize performance, we don't immediately re-calculate everything.

1. **Mark / Dirty Phase**: When an atom changes, we notify subscribers "I am dirty".
2. **Sweep / Evaluation Phase**: When a value is *read*, we re-evaluate only if needed.

If an Effect observes a computed value, it subscribers to it. The computed value in turn subscribes to its dependencies. This creates a **Dynamic Dependency Graph** that updates automatically.

## 3. Async as a First-Class Citizen

Most reactivity libraries treat Promises as "just values". We treat them as **State Machines**.

When a `computed` returns a Promise:

1. It immediately enters a `PENDING` state.
2. It returns the `defaultValue` (if provided) to consumers initially.
3. It attaches handlers to the Promise.
4. If a dependency changes *while* the Promise is pending, the old Promise is **cancelled** (ignored) and a new one starts. This prevents "race conditions" where an old request overwrites a newer one.

### State Flags

We use bitwise flags (integers) for high-performance state tracking:

- `DIRTY`: Needs re-evaluation.
- `COMPUTING`: Currently running (detects circular deps).
- `RESOLVED` / `REJECTED`: Async states.

## 4. Memory Management

We use **Subscriber Links** and **Object Pooling** to minimize Garbage Collection pressure.

- `DependencyLink` objects are pooled.
- Arrays used for tracking are recycled.

This allows the library to handle high-frequency updates (like mouse movements or animations) without causing GC stutter.
