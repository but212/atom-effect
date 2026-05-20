# Lifecycle Invariants

This document defines the lifecycle states, transition behaviors, and resource management strategies for elements managed by `@but212/atom-effect-jquery`.

---

## Core States

| State | Description | Primary Triggers |
| :--- | :--- | :--- |
| **ATTACHED** | The element is connected to the DOM and all reactive effects/bindings are active. | `setup()`, `$.fn.atomMount()`, static specs (Auto-Setup), or DOM insertion. |
| **DETACHED** | The element is disconnected from the DOM but retains its reactive state. | `$.fn.detach()` or synchronous relocation within the document. |
| **DESTROYED** | The element is permanently removed. All reactive resources are released. | `$.fn.remove()`, `$.fn.empty()`, or `teardown()`. |

---

## Scenario Matrix

| Scenario | State Transition | Cleanup Timing | Implementation Mechanism |
| :--- | :--- | :--- | :--- |
| **DOM Relocation** | `ATTACHED` → `DETACHED` → `ATTACHED` | **None** | `MutationObserver` checks `isConnected` status during its microtask cycle. Synchronous moves preserve bindings. |
| **`$.detach()`** | `ATTACHED` → `DETACHED` | **None** | The node is marked via `registry.keep()` to bypass automated cleanup cycles. |
| **Native Removal** | `ATTACHED` → `DESTROYED` | **Deferred** | `MutationObserver` detects removal and executes `cleanupTree()` in a microtask if the node remains disconnected. |
| **Auto-Setup** | `OFFLINE` → `ATTACHED` | **Immediate** | `ContextEngine` identifies elements with static specs upon insertion and executes `setup()` within the same microtask. |
| **`teardown()`** | `ATTACHED` → `DESTROYED` | **Deterministic** | Synchronous disposal of internal state via `ComponentState.dispose()`, followed by `ContextEngine.release()`. |

---

## Resource Management (Reference Counting)

The library utilizes a **Reference Counting** strategy within the `ContextEngine` to manage global resources, such as the `MutationObserver` safety net.

1. **Retain**: Triggered when a component with static specs is instantiated (but not yet connected) or when a context is requested via `injectAtom`.
2. **Initialization**: The first `retain` call initializes and connects the global `MutationObserver` to `document.documentElement`.
3. **Release**: Triggered upon component `teardown()` or when a context injection proxy is disposed.
4. **Teardown**: When the active reference count reaches zero, the observer is disconnected and internal caches are cleared to minimize system overhead.

---

## Invariant Rules

### 1. Idempotent Cleanup

Sequential or redundant calls to `cleanup()` or `teardown()` on the same node must be side-effect free. Once a node enters the `DESTROYED` state, subsequent operations should not re-initialize reactive resources.

- **Fast-Path Check**: The teardown process leverages `getElementsByClassName` to verify the presence of active reactive elements before attempting any tree traversal. If no bound descendants exist, the cleanup exits immediately to reduce CPU cycles during general DOM manipulation.

### 2. Context Consistency

Operations that mutate the DOM structure or release component state must trigger a version bump in the `ContextEngine`. This ensures that late-bound injection proxies re-evaluate their provider hierarchy, preventing "ghost" context references.

### 3. Shadow DOM Transparency

Resource discovery and lifecycle management must account for Shadow DOM boundaries. The registry tracks both open and closed `ShadowRoot` instances to ensure that recursive cleanup (`cleanupTree`) penetrates encapsulated subtrees.
