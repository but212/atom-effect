# jQuery Specification — `@but212/atom-effect-jquery`

Normative contracts for DOM bindings, lifecycle invariants, the security/sanitization policy, components, and routing. Guidance (onboarding, patterns) lives in `packages/jquery/docs/`.

## 0. Scope & base contract

- Builds on the core spec (`docs/spec/core.md`).
- All methods are available on jQuery collections (`$(selector).method()`).
- Requires **jQuery 4.0.0+** — the layer relies on modern browser security primitives and avoids legacy XSS vectors.
- Every DOM insertion vector in this package **must** sanitize untrusted content (see §4).
- Every effect/subscription **must** be disposed (see §3 lifecycle).

## 1. Binding contracts

### 1.1 Unified binding — `.atomBind(bindings)`

Central dispatcher for multiple declarative bindings in one call. Accepts `text`, `html`, `class`, `css`, `attr`, `prop`, `show`, `hide`, `value`, `checked`, `form`, `on`.

Implementation invariants:

- **Task-based loop**: bindings are pre-compiled into a task array before iterating the collection; no key enumeration inside the DOM loop.
- **Monomorphic strategy**: handlers resolve read/write strategy (e.g. `multipleSelect`) at construction, avoiding feature-detection branches in the reactive path.
- **Local caching**: handlers cache the last written DOM value to avoid layout thrashing.
- **Scoped radio synchronization**: radio peers are found with a scoped `querySelectorAll` on the form or root container; synchronization does not currently maintain a persistent O(1) `WeakMap` cache.
- `.atomUnbind()` disposes all bindings and effects on the elements and descendants.

### 1.2 Content & attributes

| Method | Contract |
| :--- | :--- |
| `.atomText(atom, formatter?)` | Updates `textContent`. Accepts `AsyncReactiveValue` (direct Promise or atom yielding Promise). Tuple form `[source, formatter]` valid inside `.atomBind()`. |
| `.atomHtml(atom)` | Updates `innerHTML`, always routed through `sanitizeHtml` (§4). |
| `.atomClass(name, atom)` / `.atomClass(classMap)` | Toggles classes by truthiness. A class remains applied if any associated condition is true. |
| `.atomCss(prop, atom, unit?)` / map | Updates inline CSS; optional unit suffix. |
| `.atomAttr(name, atom)` / map | Updates HTML/SVG attrs. Blocks `on*` and protocol payloads. Boolean attrs removed when `false`; WAI-ARIA booleans coerced to `"true"`/`"false"`. |
| `.atomProp(prop, atom)` / map | Sets DOM object properties. Blocks structural properties (`innerHTML`, `outerHTML`) and prototype vectors (`__proto__`, `constructor`, `prototype`). |

### 1.3 Control flow

- `.atomShow(atom)` / `.atomHide(atom)` — toggle visibility, capturing/restoring the original `display` (e.g. `flex`, `grid`).
- `.atomList(listAtom, options)` — reactive array → DOM reconciliation (see §2).

### 1.4 Form bindings

| Method | Contract |
| :--- | :--- |
| `.atomVal(atom, options?)` | Two-way sync for `<input>`, `<textarea>`, `<select>`; supports `<select multiple>` via `string[]`. IME-stable (composition states), cursor/focus preserved. Options: `debounce`, `format`, `parse`, `equal`. |
| `.atomChecked(atom)` | Two-way for checkbox/radio. Radio groups sync peers sharing a `name` via scoped root/form queries. |
| `.atomForm(atom \| atom[], options?)` | Two-way form sync mapping inputs by `name`. Multi-atom (merged via `mergeLenses`, later atoms win on overlap), nested dot-paths, dynamic inputs via `MutationObserver`, native Constraint Validation via `setCustomValidity`. |
| `.atomOn(event, handler)` | Lifecycle-aware delegation; handlers run inside `batch()`; auto-unbound on teardown. |

### 1.5 Components & lifecycle hooks

- `.atomMount(component, props?)` — runs component inside `batch()` and `untracked()`; may return a cleanup function; `.atomUnmount()` recursively disposes (delegates to `registry.cleanupTree()`).
- **Best practice**: call `.atomUnmount()` before programmatically removing/replacing a mounted container.

## 2. `atomList` reconciliation

3-pass pipeline minimizing DOM churn:

1. **Head/tail fast-forwarding**: skip diffing for stable bounds.
2. **Middle-range diffing**: compare the dirty middle using a persistent key map → insertion/deletion/move instructions.
3. **Greedy placement**: reverse-order `insertBefore` for predictable cross-browser behavior.
4. **Cold start**: initial render concatenates sanitized HTML, parses it with `$.parseHTML()`, and inserts the resulting fragment with `replaceChildren`, bypassing jQuery instantiation.

**Optional callbacks/options:** `key` (required), `render`, `bind`, `update`, `onAdd`, `onRemove`, `empty`, `isEqual`, `events`.

**Async removal & node identity invariants:**

- Pending `onRemove` transitions are tracked by **node identity, not key**. On entering removal the `data-atom-key` is stripped; if re-bound live before async removal resolves, `commitRemoval` sees the re-bound key and aborts teardown.
- A re-bind backstop guarantees a pending node carrying `data-atom-key` is never physically removed.
- **Node-identity tracking applies to `Element`/`jQuery`/`DocumentFragment` renders** (nodes persist across cycles). With **string `render`**, the container is rebuilt via `replaceChildren` each cycle, so identity cannot span a pending removal.
- **Duplicate keys**: logged as a warning; both items render as fresh DOM nodes without silently dropping data; superseded nodes tear down via normal `onRemove`.

## 3. DOM lifecycle & memory invariants

### 3.1 States

| State | Description | Triggers |
| :--- | :--- | :--- |
| ATTACHED | Connected; reactive effects/bindings active. | `setup()`, `.atomMount()`, auto-setup, insertion |
| DETACHED | Disconnected but retains reactive state. | `.detach()`, synchronous relocation |
| DESTROYED | Permanently removed; all resources released. | `.remove()`, `.empty()`, `teardown()` |

### 3.2 Scenario matrix

| Scenario | Transition | Cleanup | Mechanism |
| :--- | :--- | :--- | :--- |
| DOM relocation | ATTACHED → DETACHED → ATTACHED | None | `MutationObserver` checks `isConnected` during microtask; synchronous moves preserve bindings. |
| `.detach()` | ATTACHED → DETACHED | None | `registry.keep()` bypasses auto-cleanup. |
| Native removal | ATTACHED → DESTROYED | Deferred | Observer runs `cleanupTree()` in a microtask if still disconnected. |
| Auto-setup | OFFLINE → ATTACHED | Immediate | The component controller runs `setup()` in the same microtask. |
| `teardown()` | ATTACHED → DESTROYED | Deterministic | Synchronous `ComponentState.dispose()` and provider cleanup, followed by registry cleanup. |

### 3.3 `BindingRegistry`

- **WeakMap storage** (`nodeStateMap`): DOM elements → active `EffectObject`s; GC reclaims if an element is removed externally.
- **Static snapshotting & early exit**: bound elements tagged `_aes-bound` / `_aes-has-shadow`; teardown checks classes via `getElementsByClassName` (O(1) index) to skip `querySelectorAll` on clean trees.

### 3.4 Auto-teardown (`MutationObserver`)

- Global observer on configured `root` (default `document.body`).
- **Deferred cleanup (move robustness)**: removed nodes are marked and cleanup queued in a microtask; if re-inserted before the microtask runs (e.g. sorting), cleanup is aborted, preserving state.

### 3.5 Shadow DOM traversal

- Hosts with open/closed Shadow DOMs are registered with `_aes-has-shadow`.
- `cleanupTree` checks marked hosts and traverses their `ShadowRoot` objects to penetrate boundaries.

### 3.6 Invariant rules

1. **Idempotent cleanup**: redundant `cleanup()`/`teardown()` calls are side-effect free; once DESTROYED, no re-initialization.
2. **Context consistency**: Provider registration, replacement, teardown, or relevant DOM structure mutation increments the shared context revision, so late-bound injection proxies re-evaluate providers without ghost references.
3. **Provider ownership**: Each provider key has one record containing its value and optional CSS synchronization effect. Replacing or tearing down a provider disposes the previous effect before releasing the record.
4. **Shadow DOM transparency**: Resource discovery and lifecycle manage open and closed shadow roots.

### 3.7 Context subscription lifecycle

`provideAtom` and `injectAtom` use synchronous direct-walk discovery through parent pointers, crossing a shadow boundary via `ShadowRoot.host`.

- A subscribed injection proxy evaluates once before subscribing, so an already-present atom provider is observed immediately.
- Provider atoms notify through the proxy's temporary computed subscription; static providers notify when the shared context revision changes.
- Provider registration, replacement, component teardown, and child-list mutations increment the shared revision.
- Atom-backed CSS synchronization effects, including effects created by direct `provideAtom()` calls, are registered with the `BindingRegistry` for automatic teardown.
- Each active proxy subscription registers structure callbacks on the relevant document/root `RootObserver` instances. Unsubscribing or disposing the proxy removes those callbacks and the temporary computed.
- `subscriberCount()` reports active proxy subscriptions; `dispose()` releases all subscriptions and is idempotent.

## 4. Security & sanitization policy

**Layered defense** isolating untrusted data via native browser primitives.

### 4.1 Prototype-bound bridge (clobbering protection)

- Sanitizer parser, serializer, traversal, node replacement, text/child access, and attribute operations use captured native prototype methods/accessors for `Document`, `Element`, `Node`, `HTMLTemplateElement`, and `TreeWalker`.
- Guarantees native behavior for these operations even if host-document or created-instance properties are shadowed. Prototype tampering before module initialization is outside this guarantee.

### 4.2 Inert template parsing (`sanitizeHtml`)

- All parsing uses detached `HTMLTemplateElement` contexts — content is strictly inert (no script execution, no external resource requests during sanitization).
- Fresh parser/serializer per call for recursive isolation (e.g. sanitizing `srcdoc`).

### 4.3 Sanitization policy

| Vector | Defense |
| :--- | :--- |
| Executable tags (`script`, `iframe`, `object`, `embed`, `applet`) | Neutralized to `<span>` wrappers (attributes scrubbed). |
| Structural/state tags (`base`, `meta`, `link`, `style`, `title`, `noscript`, `form`, `isindex`) | Neutralized. |
| Global fragment `body` | Neutralized. |
| Event handlers (`on*`) | Stripped; logged to `data-unsafe-attr`. |
| URI protocols (`javascript:`, `vbscript:`) | In `atomHtml`: value replaced with `data-unsafe-protocol:`. In `atomAttr`/`atomProp`: update aborted (target unchanged) + warning. |
| DOM clobbering (`id`/`name` matching `attributes`, `tagName`, `parentNode`, …) | Blocked. |
| CSS injection | Filtered by `isDangerousCss` (strips comments, blocks `expression()`, `-moz-binding`, dangerous `url()`). |
| SVG/SMIL (`attributeName`, `from`, `to`, `values`) | Scrubbed if they contain handlers or dangerous URIs. |
| Encoded bypasses | Recursive double entity decoding; null bytes, control chars (`\x00-\x1f`), and `\ufffd` stripped. |

**Sink contracts:**

- `.atomHtml` — always routes through `sanitizeHtml` (primary XSS defense).
- `.atomAttr(name, atom)` — validates name and value; blocks `on*`; URI values protocol-checked (abort + warning on danger).
- `.atomProp(name, atom)` — strict sink blacklist (`innerHTML`, `outerHTML`, `srcdoc` blocked; abort + warning on danger).
- `.atomCss(prop, atom)` — filters declarations; strips comments; blocks `expression()`, `-moz-binding`, dangerous `url()`.

**CSP compliance:** no `eval()`, `new Function()`, or inline event registration.

## 5. Web Components (`$.useAtomComponent`)

`useAtomComponent(element)` returns an `AtomComponentController` for lifecycle/state sync on Custom Elements.

**Controller API:** `host`, `root`, `attrs(name)` (attribute lens, respects `static observedAttributes`), `slots(name)` (`ReadonlyAtom<Node[]>`; `'default'`/`''` for default slot), `internals`, `$(selector)` (scoped), `provideAtom(key, value)`, `injectAtom(key)`, `teardown()` (deterministic sync disposal), `setup(options?)`.

**Static config:** `aejStyles`, `aejBind`, `aejAria`, `aejParts`, `aejDispatch`, `aejValue`, `aejValidation`.

> **State isolation invariant**: static properties are shared across **all** instances. Mutable reactive state (`atom`/`computed`) must be instance properties registered in the constructor or `connectedCallback` via `this.aej.setup(...)`, not static specs.

### Controller internals

- **`ComponentState`**: centralizes attribute lenses, slot listeners, effects for one instance; `teardown()` releases all synchronously.
- **Context engine** (`provideAtom`/`injectAtom`): direct-walk discovery traverses parent pointers (crossing shadow via `host`) for O(depth) resolution. A shared context revision invalidates subscribed late-bound proxies when providers or DOM topology change; proxy subscriptions own their temporary computed and `RootObserver` callbacks.
- **Stylesheet caching**: identical style strings parsed once, shared via `adoptedStyleSheets`; FIFO eviction, max 100 entries.

## 6. Routing & navigation

### 6.1 `$.route(config)`

SPA router supporting HTML5 History and Hash modes.

- **Tiered matcher**: (1) static `Map` lookup O(1) for exact paths; (2) RegExp-compiled matching for dynamic paths with parameter extraction.
- **Route lifecycle**: `onEnter` / `onLeave` navigation-guard hooks.
- **Instance interface** (reactive): `currentRoute`, `queryParams`, `params`, `location` (`{ path, query, params }`) as `ReadonlyAtom`; `navigate(to)`, `destroy()`.
- **Best practice**: always call `destroy()` on teardown to prevent listener leaks.

### 6.2 `$.atomNav(options)` (PJAX)

- **Concurrency**: "last navigation wins" — `AbortController` cancels a pending fetch on a newer navigation.
- **Header coordination**: sends `X-PJAX-Container`; processes `X-PJAX-Title` / `X-PJAX-URL` to sync title/meta.
- **DOM reconciliation**: cleans up existing DOM nodes before injecting new content. The navigation sanitization policy includes the default blacklist, so fetched `<form>` elements are neutralized to `<span>` wrappers rather than preserved as live forms.
- **Scroll management**: `#hash` targeting vs reset-to-top by transition type.
- **Instance interface** (reactive): `currentUrl`, `isPending`, `hasError` as `ReadonlyAtom`; `navigate(url, { replace? })`, `destroy()`.

### 6.3 Navigation interop (`navCoordinator`)

- Manages collisions when `atomNav` and `$.route` run together.
- **Hierarchical guarding**: resolves `onLeave` guards across all registered routers before committing.
- Nested routers skip initial scroll/focus, deferring to the parent `atomNav` container.

## 7. Data fetching — `$.atomFetch(urlOrFn, options)`

- **Concurrency**: auto-aborts the underlying jQuery `jqXHR` when reactive dependencies update.
- **Normalization**: converts `jqXHR` into native `Error` classes.
- Returns a computed atom exposing `.abort()` for manual cancellation of the active request.

## 8. Effect orchestration invariants (all bindings)

- **Race protection**: a monotonic `latestId` ensures only the most recent Promise resolution applies to the DOM.
- **Disposal tracking**: pending async resolutions are linked to the `BindingRegistry`; if the element disconnects before resolution, the update is discarded.
- **Execution isolation**: updaters run within `untracked` to avoid capturing secondary dependencies during the DOM write phase.
