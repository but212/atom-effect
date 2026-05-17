# Architecture & Design

This document details the internal architecture of `@but212/atom-effect-jquery`. It is intended for core contributors and developers who need to understand the structural design, lifecycle management, and performance optimizations of the integration layer.

---

## 1. System Overview

The jQuery package provides a declarative, reactive DOM manipulation layer built upon the `@but212/atom-effect` core engine. It bridges reactive primitives (atoms, computeds) to the DOM via jQuery collections.

### 1.1 ES2022 Architecture

The package relies on an **ES2022-based class architecture**. Core engines and controllers (e.g., `FormBinder`, `InputBinding`, `ComponentState`, `BindingRegistry`, `RouterImpl`, `NavigationCoordinator`) are implemented as encapsulated classes utilizing **native private class fields (`#`)**.

This design choice provides:

1. **Runtime Isolation**: Prevents external mutation of internal state matrices.
2. **Monomorphic Consistency**: Standardized field initialization ensures V8 generates stable Hidden Classes, optimizing JIT property access during high-frequency reactive loops.

```text
                 ┌───────────────────────────────────┐
                 │       @but212/atom-effect         │
                 │  atom / computed / effect / batch │
                 └──────────────┬────────────────────┘
                                │
                 ┌──────────────▼─────────────────────┐
                 │    @but212/atom-effect-jquery      │
                 │                                    │
                 │  unified.ts   ← Binding handlers   │
                 │  effect-factory.ts ← Effect reg.   │
                 │  registry.ts  ← Lifecycle mgmt     │
                 │  jquery-patch.ts ← Native patches  │
                 │  bindings/list/ ← DOM Diffing      │
                 │  route/       ← SPA Router         │
                 │  nav.ts       ← PJAX Coordinator   │
                 │  web-component/ ← Custom Elements  │
                 └────────────────────────────────────┘
```

---

## 2. Binding Pipeline

Reactive bindings (`atomText`, `atomCss`, `atomBind`) follow a standardized execution pipeline designed for batching and safety.

### 2.1 Effect Orchestration (`effect-factory.ts`)

The `registerReactiveEffect` and `registerMapEffect` factories use an internal `createAsyncRunner` to handle both synchronous and asynchronous reactive sources.

- **Race Condition Protection**: Utilizes a monotonic `latestId` to ensure that only the resolution of the most recent Promise is applied to the DOM.
- **Disposal Tracking**: Links pending asynchronous resolutions to the `BindingRegistry`. If the target element is disconnected from the DOM before the Promise resolves, the update is safely discarded.
- **Execution Isolation**: Updaters are executed within an `untracked` block to prevent the accidental capture of secondary dependencies during the DOM writing phase.

### 2.2 Unified Binding Dispatch (`atomBind`)

The `atomBind` method acts as a centralized dispatcher for multiple declarative bindings.

- **Task-Based Loop**: Pre-compiles requested bindings into a task array before iterating over the jQuery collection. This prevents redundant object key enumeration inside the DOM iteration loop.
- **Monomorphic Strategy**: Handlers (e.g., `InputBinding`) resolve their read/write strategies (like `multipleSelect` handling) at construction time, avoiding feature-detection branches in the reactive execution path.
- **Local Caching**: Specific handlers cache the last written DOM value to bypass redundant layout thrashing during overlapping update cycles.

---

## 3. Lifecycle & Memory Management

### 3.1 `BindingRegistry`

The `BindingRegistry` is responsible for tracking and releasing reactive resources associated with DOM nodes.

- **WeakMap Storage**: Utilizes a central `WeakMap` (`nodeStateMap`) to associate DOM elements with their active `EffectObject` instances, allowing the garbage collector to reclaim resources if an element is removed externally.
- **Static Node Snapshotting**: Bound elements are tagged with the `_aes-bound` class. The registry uses `querySelectorAll` to gather a static snapshot of elements requiring cleanup, avoiding the performance penalties of live `NodeList` collections during teardown.

### 3.2 Automated Teardown (`MutationObserver`)

To prevent memory leaks in Single Page Applications, the engine deploys a global `MutationObserver` on the configured `root` element (default: `document.body`).

- **Deferred Cleanup (Move Robustness)**: When nodes are removed, the registry marks them and queues a cleanup task in a microtask. If the node is re-inserted into the document before the microtask executes (e.g., during sorting), the cleanup is aborted, preserving the reactive state.

### 3.3 Shadow DOM Traversal

Standard `MutationObserver` instances do not penetrate Shadow boundaries. The registry manages this via:

- **Host Marking**: Hosts with open or closed Shadow DOMs are registered with an `_aes-has-shadow` class.
- **Boundary Penetration**: The `cleanupTree` method explicitly checks marked hosts and transverses their associated `ShadowRoot` objects.

---

## 4. DOM Reconciliation (`atomList`)

The `atomList` feature renders reactive arrays using a high-performance, 3-pass reconciliation pipeline that minimizes DOM churn.

1. **Head/Tail Fast-forwarding**: Scans both ends of the old and new arrays to identify contiguous stable elements. This skips diffing for unmodified bounds.
2. **Middle-range Diffing**: Compares the remaining "dirty" section using a persistent key map, generating a series of insertion, deletion, and move instructions.
3. **Greedy Placement**: Synchronizes the physical DOM. Optimizes operations by utilizing reverse-order insertion (`insertBefore`), which performs predictably across major browser engines.
4. **Cold Start Optimization**: During initial renders, the engine bypasses jQuery instantiation overhead by concatenating sanitized HTML strings and injecting them via `innerHTML`.

---

## 5. Web Components (`useAtomComponent`)

The Web Component integration provides a declarative reactive lifecycle for standard Custom Elements.

### 5.1 `ComponentState` Encapsulation

The `ComponentState` class centralizes all reactive resources (Attribute Lenses, Slot Listeners, Effects) for a single component instance.

- **Deterministic Disposal**: Consolidating lifecycle state guarantees that `teardown()` releases all associated observers synchronously, mitigating the risk of fragmented memory leaks.

### 5.2 Context Engine & Reference Counting

Dependency Injection (Provide/Inject) relies on the `ContextEngine` to track elements moving through the DOM.

- **Just-in-Time Observation**: The global `MutationObserver` used for tracking context shifts is activated using a **Reference Counting** (`retain`/`release`) pattern. The observer is connected only when there are active injections or offline components pending setup.
- **Event-Based Discovery**: `discover` relies on synchronous DOM event bubbling (`aej:context-request`) to locate providers across Shadow DOM boundaries.
- **Late-Bound Proxies**: `injectAtom` returns a Proxy that tracks `ContextEngine.version`. If the DOM structure mutates, the Proxy invalidates its cache and re-discovers its provider on the next access.

### 5.3 Stylesheet Caching

To optimize memory across numerous component instances, the engine maintains a global cache of `CSSStyleSheet` objects. Identical style strings are parsed once and shared via `adoptedStyleSheets`. The cache employs a **FIFO eviction strategy** (max 100 entries) to cap memory footprint in long-running applications.

---

## 6. Routing & Navigation

### 6.1 Modular SPA Router (`$.route`)

The routing subsystem is decoupled into strategy-based modules.

- **`UrlAdapter` Strategy**: Abstracts browser navigation APIs (History `pushState` vs Hash routing), allowing the core matching engine to remain agnostic.
- **Tiered Matcher**: Evaluates routes using a performance hierarchy:
  1. Static `Map` lookup (O(1)).
  2. Native `URLPattern` API (for dynamic segments).
  3. Anchored Regex matching (Fallback for older engines).

### 6.2 PJAX Navigation (`$.atomNav`)

The `atomNav` module provides fragment-based navigation.

- **Concurrency Control**: Implements a "last navigation wins" policy. The `AtomFetch` pipeline uses an `AbortController` to cancel pending requests if a new navigation is triggered.
- **Header Coordination**: Sends `X-PJAX-Container` to allow the server to selectively render fragments, and processes `X-PJAX-Title` and `X-PJAX-URL` headers to synchronize client state.

### 6.3 Navigation Interoperability (`navCoordinator`)

The `navCoordinator` manages collision detection and lifecycle synchronization when multiple navigation systems (`atomNav` and `$.route`) operate simultaneously.

- **Hierarchical Guarding**: Resolves `onLeave` guards across all registered routers within the transition scope before committing a navigation.
- **Lifecycle Integration**: Nested routers skip initial scroll and focus management, delegating top-level page transitions to the parent `atomNav` container.

---

## 7. Security Implementation

The jQuery package implements proactive security measures for all DOM insertion vectors:

1. **Rule-Based Sanitization (`atomHtml`)**: The `sanitizeHtml` engine parses content within an inert `<template>`. It executes multi-pass decoding, neutralizes dangerous structural tags (`<script>`, `<object>`), and enforces protocol safe-listing on URI attributes.
2. **DOM Clobbering Defense**: Element manipulation bypasses direct property access in favor of prototype-bound methods (`Object.getOwnPropertyDescriptor(Element.prototype)`), neutralizing vectors where attackers shadow native DOM methods.
3. **Attribute Protection**: Automatically strips inline event handlers (`on*`) from reactive attribute injections.
