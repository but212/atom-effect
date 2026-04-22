# Lifecycle Invariants

This document defines the behavior and cleanup timing for elements managed by `atom-effect-jquery`.

## Core States

| State | Description | Trigger |
| :--- | :--- | :--- |
| **ATTACHED** | Element is in the DOM and reactive effects are active. | `setup()`, `$.fn.atomMount()`, or DOM insertion. |
| **DETACHED** | Element is temporarily disconnected from the DOM. Effects are preserved. | `$.fn.detach()` or relocation within the same document. |
| **DESTROYED** | Element is permanently removed. Effects and bindings are disposed. | `$.fn.remove()`, `$.fn.empty()`, or `teardown()`. |

## Scenario Matrix

| Scenario | State Transition | Cleanup Timing | Implementation Path |
| :--- | :--- | :--- | :--- |
| **DOM Move** | `ATTACHED` → `DETACHED` → `ATTACHED` | **None** | Microtask buffer prevents cleanup during synchronous moves. |
| **$.detach()** | `ATTACHED` → `DETACHED` | **None** | Node is marked via `registry.keep()` to preserve state. |
| **$.remove()** | `ATTACHED` → `DESTROYED` | **Immediate** | Patched method calls `registry.cleanupTree()` synchronously. |
| **$.empty()** | `ATTACHED` → `DESTROYED` (descendants) | **Immediate** | Patched method calls `registry.cleanupDescendants()` synchronously. |
| **Native Removal** | `ATTACHED` → `DESTROYED` | **Deferred** | `MutationObserver` detects removal and queues cleanup as a microtask. |
| **teardown()** | `ATTACHED` → `DESTROYED` | **Hybrid** | Immediate observer disconnection; deferred tree cleanup via microtask. |
| **Closed Shadow** | `ATTACHED` → `DESTROYED` | **Same as Host** | Registered via `registry.registerShadow()`; cleaned via host markers. |

## Cleanup Logic

1. **Patched Execution (Synchronous)**: jQuery methods (`.remove()`, `.empty()`) are patched to trigger immediate cleanup of effects and bindings. These patches can be configured via `$.initAEJ({ patch: ... })`.
2. **MutationObserver Execution (Asynchronous)**: A global `MutationObserver` acts as a fallback for removals performed via native DOM APIs. It triggers cleanup via microtasks, allowing for relocation stability.
3. **Controller Teardown**: `teardown()` disconnects the component's internal root observer immediately while delegating element-level cleanup to the registry to ensure consistency during moves.

## Global Configuration (`$.initAEJ`)

The library's lifecycle behavior is controlled by global settings:

- **`patch`**: Determines if jQuery's prototype methods are overridden to provide synchronous lifecycle hooks.
- **`autoCleanup`**: Enables or disables the asynchronous `MutationObserver` fallback. If disabled, manual calls to `registry.cleanupTree()` are required for permanent removals.

## Invariant Rules

1. **Idempotent Cleanup**: Sequential calls to cleanup a single node must result in no side effects and maintain a stable state.
2. **Shadow Traversal**: Cleanup must traverse Shadow DOM subtrees unless the host element is explicitly marked as `ignored`.
3. **Resource Disposal**: All `WeakMap` records and `MutationObserver` instances must be released when a component or element is destroyed.
4. **Context Locality**: Structural DOM changes must trigger a context version bump to invalidate cached reactive injections, ensuring they reflect the element's new position.
