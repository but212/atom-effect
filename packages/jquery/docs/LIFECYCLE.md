# AEJ Lifecycle Invariants

This document defines the expected behavior and cleanup timing for elements managed by `atom-effect-jquery`. Use this as a reference for debugging and maintenance.

## Core States

| State | Description | Trigger |
| :--- | :--- | :--- |
| **ATTACHED** | Element is in DOM and reactive effects are active. | `setup()`, `$.mount()`, or DOM insertion. |
| **DETACHED** | Element is temporarily out of DOM. Effects are preserved. | `$.detach()` or move within the same document. |
| **DESTROYED** | Element is permanently removed. All effects are stopped. | `$.remove()`, `$.empty()`, or `teardown()`. |

## Scenario Matrix

| Scenario | State Transition | Cleanup Timing | Path |
| :--- | :--- | :--- | :--- |
| **DOM Move** | `ATTACHED` → `DETACHED` → `ATTACHED` | **None** | Microtask buffer protects from cleanup. |
| **$.detach()** | `ATTACHED` → `DETACHED` | **None** | Explicitly marked as `preserved`. |
| **$.remove()** | `ATTACHED` → `DESTROYED` | **Immediate** | **Patch Path**: Direct call to `cleanupTree()`. |
| **$.empty()** | `ATTACHED` → `DESTROYED` (descendants) | **Immediate** | **Patch Path**: Direct call to `cleanupDescendants()`. |
| **Native Removal** | `ATTACHED` → `DESTROYED` | **Deferred** | **Observer Path**: Caught by MutationObserver (Microtask). |
| **teardown()** | `ATTACHED` → `DESTROYED` | **Hybrid** | **Observer Disconnect** (Immediate) + **Cleanup** (Deferred). |
| **Closed Shadow** | `ATTACHED` → `DESTROYED` | **Same as Host** | Registered via `setup(sr)`; cleaned via host marker. |

## Cleanup Chain Logic

1. **Explicit Patch (Fast-path)**: jQuery methods (`.remove()`, `.empty()`) trigger **synchronous** cleanup. Patches can be toggled via `$.initAEJ({ patch: ... })`.
2. **Safety Net (Fallback)**: A global `MutationObserver` catches removals by native APIs. The root of this observer can be customized via `$.initAEJ({ autoCleanup: { root: myRoot } })`.
3. **Hybrid Teardown**: `teardown()` stops observing the component's internal root immediately to release resources, while delegating the actual tree cleanup to the deferred registry to maintain move-safety.

## Global Configuration (`$.initAEJ`)

The library's lifecycle behavior is governed by a global configuration. Calling `initAEJ` resets the state:

- **`patch`**: Controls whether jQuery's prototype is modified.
- **`autoCleanup`**: Controls the 'safety-net' MutationObserver. Disabling this requires manual calls to `registry.cleanupTree()`.

## Invariant Rules

1. **Double Cleanup Safety**: Calling cleanup multiple times on the same node must be idempotent and never throw.
2. **Shadow Transparency**: Shadow DOM subtrees must be traversed during cleanup unless the host is marked as `ignored`.
3. **Memory Leak Prevention**: All `WeakMap` entries and `MutationObserver` listeners must be released when a component calls `teardown()`.
