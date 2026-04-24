# Lifecycle Invariants

This document defines the behavior and cleanup timing for elements managed by `atom-effect-jquery`.

## Core States

| State | Description | Trigger |
| :--- | :--- | :--- |
| **ATTACHED** | Element is in the DOM and reactive effects are active. | `setup()`, `$.fn.atomMount()`, Static Specs (Auto-Setup), or DOM insertion. |
| **DETACHED** | Element is temporarily disconnected from the DOM. Effects are preserved. | `$.fn.detach()` or relocation within the same document. |
| **DESTROYED** | Element is permanently removed. Effects and bindings are disposed. | `$.fn.remove()`, `$.fn.empty()`, or `teardown()`. |

## Scenario Matrix

| Scenario | State Transition | Cleanup Timing | Implementation Logic |
| :--- | :--- | :--- | :--- |
| **DOM Move** | `ATTACHED` → `DETACHED` → `ATTACHED` | **None** | Microtask buffer prevents cleanup during synchronous moves, preserving reactive subscriptions. |
| **$.detach()** | `ATTACHED` → `DETACHED` | **None** | Node is marked via `registry.keep()` to bypass the next cleanup cycle. |
| **Native Removal** | `ATTACHED` → `DESTROYED` | **Deferred** | `MutationObserver` detects removal and queues cleanup as a microtask to allow for potential relocation. |
| **Auto-Setup** | `OFFLINE` → `ATTACHED` | **Immediate** | `ContextEngine` detects insertion of components with static specs and triggers `setup()` within the same microtask. |
| **teardown()** | `ATTACHED` → `DESTROYED` | **Deterministic** | Immediate disposal of internal state via `ComponentState.dispose()`. Triggers `ContextEngine.release()`. |

## Resource Management (Reference Counting)

The library employs a **Reference Counting** strategy via `ContextEngine` to manage heavy resources like the global `MutationObserver`.

1. **Retain**: When a component is created with static specs but not yet connected, or when a reactive context is injected (`injectAtom`), `ContextEngine.retain()` is called.
2. **Activation**: The first retain call initializes and connects the global `MutationObserver`.
3. **Release**: Upon component `teardown()` or context disposal, `ContextEngine.release()` is called.
4. **Deactivation**: When the count reaches zero, the observer is disconnected and nullified to free up system resources.

## Invariant Rules

1. **Idempotent Cleanup**: Sequential cleanup calls on a single node must be side-effect free and result in a stable `DESTROYED` state.
2. **Context Continuity**: Component `teardown()` or structural DOM changes must trigger a `ContextEngine.version` bump. This invalidates cached injection proxies, ensuring they re-resolve to the nearest valid provider.
3. **Shadow DOM Transparency**: Resource discovery (DI) and cleanup must traverse Shadow DOM boundaries unless an element is explicitly marked for isolation.
