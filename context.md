# atom-effect Context

Architectural and domain context for the `atom-effect` monorepo (mental model, package boundaries, runtime behavior). See each package's `src/` and `docs/` for exact API signatures, walkthroughs, patterns, and benchmarks.

## 1. System Overview & Package Map

Three layered runtime packages: `@but212/atom-effect-utils` (functional/V8 data structures), `@but212/atom-effect` (core reactive graph engine), and `@but212/atom-effect-jquery` (DOM bindings and lifecycle). Package-level guides and benchmarks live in each package's `docs/`.

| Package | Section | Covers |
| :--- | :--- | :--- |
| `@but212/atom-effect` | [Core Engine](#2-core-engine--but212atom-effect) | Reactive semantics, node lifecycle, scheduling, async boundary, error handling, composition |
| `@but212/atom-effect-jquery` | [jQuery Bindings](#3-jquery-bindings--but212atom-effect-jquery) | Binding model, DOM lifecycle, security/sanitization architecture, components |
| `@but212/atom-effect-utils` | [Utilities](#4-utilities--but212atom-effect-utils) | `Result`, `SlotBuffer`, type guards, value equality, type-level utilities |

## 2. Core Engine — `@but212/atom-effect`

Onboarding and pattern guides: `packages/core/docs/`.

### 2.1 Mental Model & Propagation Lifecycle

Deterministic push-pull graph of three node roles:

| Role | Factory | Input | Output | Characteristic |
| :--- | :--- | :--- | :--- | :--- |
| Source | `atom()` | Manual | State | Leaf, non-tracking |
| Transform | `computed()` | Reactive | State | Hybrid, lazy, cached |
| Sink | `effect()` | Reactive | Void | Terminal, side-effects |

**Propagation lifecycle (push → schedule → pull):**

1. **Push**: `atom` write increments its version and synchronously marks direct `computed` subscribers `DIRTY`; effects are scheduled without running side effects in default mode.
2. **Schedule**: Atom subscriber notifications and default effect executions coalesce into one microtask flush.
3. **Pull**: On access or effect execution, nodes validate dependencies and recompute only if an upstream version incremented; unchanged re-evaluations (same version) short-circuit.

### 2.2 Domain Vocabulary & Runtime Mechanics

| Concept | Meaning & Behavior |
| :--- | :--- |
| **Epoch** | Process-local 31-bit counter for job deduplication and session validation; increases monotonically until modulo rollover. |
| **Version** | Per-node counter incrementing only when output changes (per equality check). |
| **Drift** | Subscriber's cached version differs from its dependency's current version. |
| **Glitch** | Inconsistent intermediate or stale state during propagation; prevented by the push-pull engine. |
| **Tracking** | Synchronous and implicit: reading `.value` inside `computed` or `effect` registers a dependency. |
| **Dynamic graph** | Only branches executed in the current pass are tracked (e.g. `show ? a : b` with `show` true tracks `a` only). |
| **Untracked reads** | `.peek()` or `untracked(fn)` read without registering a dependency. |
| **Purity** | `computed` formulas are expected to be idempotent and side-effect free. |
| **Monomorphism** | Public graph-traversal fields use hidden-class-stable layout; behavioral state uses `#private` fields. |

### 2.3 Async Computations & Effect Sessions

Async computeds operate as session-scoped state machines:

- **Session locking**: Only the _most recent_ async trigger resolves the node; stale session results are discarded.
- **Synchronous tracking boundary**: Only dependencies accessed **before the first `await`** are tracked. Post-`await` reads return current values without subscribing, keeping tracking deterministic.
- **AsyncState**: `'idle'`, `'pending'`, `'resolved'`, `'rejected'`.
- **Pending read**: `.value` throws `ComputedError` while pending unless `defaultValue` is set (which is returned instead).
- **Effect cleanup sessions**: Starting an effect execution invalidates earlier async cleanup sessions. A cleanup resolved by an older or disposed session cannot overwrite the current cleanup; it runs immediately and is discarded. Async rejections after disposal are ignored.

### 2.4 Scheduling & Batching

- **Default**: Computed invalidation is synchronous; atom subscriber notifications and default effect executions defer to a microtask flush, coalescing multiple synchronous writes into one downstream pass.
- **`batch(fn)`**: Groups updates into one notification cycle; supports nesting (outermost flushes last) and commits state even if `fn` throws.
- **`sync: true`**: Option on `atom` and `effect` for synchronous delivery, bypassing microtask batching.
- **Execution budget**: Effects enforce `maxExecutionsPerFlush` (default 100) independently and dispose on overflow. The scheduler separately enforces its aggregate per-flush limit: overflow calls `scheduler.onOverflow(droppedCount, droppedJobs)` without disposing effects, giving dropped jobs one retry. If the retry also overflows, recovery stays disabled until a clean drain, and unretried dropped jobs invoke optional `_onDrop()` (atoms clear queued-notification state) so later writes schedule normally.
- **Flush-session isolation**: Flush-session identity is tracked independently from the queue's deduplication epoch, so entering a synchronous effect scope cannot invalidate same-cycle scheduling.
- **Synchronous notification budget**: Self-writing `{ sync: true }` atom cascades cap at `SCHEDULER_CONFIG.MAX_FLUSH_ITERATIONS` rounds (default 1000); overflow drops the pending notification and reports `SchedulerError`.

### 2.5 Node Lifecycle & Disposal

- **Identity**: Each node gets a process-local 31-bit SMI `DependencyId`. Masking and rollover mean lifetime uniqueness and monotonicity are not guaranteed after rollover.
- **Disposal**: `.dispose()` severs graph references (subscriber slot buffers, dep maps) for immediate GC. Atoms release their stored value; computeds release executable computation, equality, default-value, and error-handler state while retaining the last cached value for `.peek()`. A computed disposed mid-execution ignores dependencies read later in that execution.
- **Effect cleanup**: Previous cleanup runs before each re-run and on disposal. A synchronous cleanup returned after self-disposal runs immediately; post-disposal reads do not subscribe. Stale async cleanups run immediately without overwriting newer sessions. Disposal releases effect and error-handler callbacks after any active execution finishes.
- **Post-disposal atom reads**: `value` and `peek()` return `undefined`; writes are no-ops. Check `isDisposed` before relying on reads.
- **Post-disposal computed reads**: `.value` remains invalid; `.peek()` returns the last cached value without retaining computation state.

### 2.6 Error Handling Model

Hybrid model avoiding `try-catch` overhead in hot paths:

1. **Internal monadic propagation**: Internal checks (argument validation, loop budgets, disposed access, circularity) return `Result<T, Error>`. Exception: `.subscribe()` with an invalid listener throws `AtomError` immediately.
2. **Synchronous boundary unwrapping**: Public boundaries (`.value` getters, factories, public scheduler wrappers) call `Result.unwrap`, throwing `ComputedError`, `EffectError`, or `SchedulerError`.
3. **Asynchronous scheduler isolation**: Failed flush jobs are wrapped in `SchedulerError` and logged — never unhandled rejections.
4. **`defaultValue` fallback**: Ordinary computation and circular-reference failures are caught internally, returning `defaultValue` and recording the error on `errors`/`hasError` until a later successful recomputation. `RangeError`, `ReferenceError`, and `SyntaxError` escape unchanged.

**Circularity**: `RECOMPUTING` flag detects self-referential derivation and throws `ComputedError`.

**Error types & helpers:**

- `AtomError` — base error (`message`, `cause`, `code` e.g. `ERR_CIRCULAR_DEP`, `recoverable`).
- `ComputedError`, `EffectError`, `SchedulerError` — specializations.
- `getErrorChain(error)` — reconstructs the `.cause` chain.
- `serializeError(error)` — serializes `Error` values and recursively copies object/array causes, replacing repeated object references with a circular-reference marker. Top-level non-`Error` inputs return unchanged; primitive causes are preserved.

### 2.7 Public API Overview

#### `atom<T>(initialValue, options?)`

| Member | Behavior |
| :--- | :--- |
| `value` | Getter registers a dependency (in context); setter updates and schedules notification only when equality check fails (`Object.is` default). |
| `peek()` | Read without registering a dependency. |
| `subscribe(listener \| Subscriber)` | Returns unsubscribe function. Callback params may be `undefined` during certain transitions. |
| `subscriberCount()` | Active subscriber count for diagnostics. |
| `dispose()` | Permanently disables; clears subscribers and releases value. |
| `isDisposed` / `isRejected` | Read-only lifecycle flags. |

Options: `name`, `sync` (default `false`), `equal`.

#### `computed(callback, options?)`

| Member | Behavior |
| :--- | :--- |
| `value` | Returns cached value, recomputing when stale. |
| `state` | `AsyncState` of the node. |
| `hasError` / `isValid` | Error flag per dependency sub-graph; `isValid` is `!hasError`. |
| `errors` / `lastError` | Collected sub-graph errors / this node's last error. |
| `isPending` / `isResolved` / `isRejected` | Async lifecycle flags. |
| `peek()` | Cached value without tracking or recomputation. |
| `invalidate()` | Forces dirty, ensuring recomputation on next access. |
| `subscribe` / `dispose` | Same shape as atom. |

Options: `name`, `equal`, `defaultValue`, `lazy` (default `true`), `onError`. Returning a `Promise` types the node as `ComputedAtom<T>`, not `ComputedAtom<Promise<T>>`.

#### `effect(callback, options?)`

Callback may return `void`, `() => void` cleanup, `Promise<void>`, or `Promise<cleanup>`.

| Member | Behavior |
| :--- | :--- |
| `run()` | Manual trigger. |
| `dispose()` | Stops effect and runs any cleanup. |
| `isDisposed` / `isExecuting` / `executionCount` | State flags. |

Options: `name`, `sync`, `onError`, `maxExecutionsPerFlush` (default 100), `maxExecutionsPerSecond` (dev only).

#### Other Primitives

- `batch(fn): T` — see [Scheduling & Batching](#24-scheduling--batching).
- `aeNextTick(cb?): Promise<void>` — resolves after next flush (useful for tests).
- `globalScheduler` — low-level flush/batching/execution control (concrete `ReactiveScheduler` is unexported).
- `untracked(fn): T` — run without dependency registration.

### 2.8 Lenses & Structural Sharing

`atomLens(atom, path)` creates a writable virtual atom for a dot-path:

- **Structural sharing**: Clones only objects along the modified path; unrelated branches retain reference identity, suppressing redundant recomputes.
- **Paths**: Dot-notation, array indices (`users.0.name`), and `Map` keys. `Set` is terminal (no nested traversal).
- **Prototype preservation**: Class instance updates preserve prototype and methods (`instanceof` intact). The `LENS_CLONE` symbol protocol lets classes with private fields/internal slots provide a fresh clone; returning a non-fresh object or mismatched prototype throws `TypeError`. Without `LENS_CLONE`, fallback uses `Object.create`/`Object.assign` (cannot preserve private state/internal slots).
- `lensFor(atom)` — factory for multiple lenses bound to one source.
- `composeLens(lens, path)` — sub-lens from an existing lens.
- **Notification granularity**: `.subscribe()` notifies only when the sub-path value changes. Reading `lens.value` in a tracked scope registers the **root atom**, so any root write re-runs the scope even if this path is unchanged.
- **Lens disposal**: Post-`dispose()`, lens and merged-lens writes are no-ops; reads retain existing behavior. One shared upstream subscription serves all distinct downstream listeners; duplicate listeners do not allocate extra upstream links.

### 2.9 State Composition

- `mergeAtoms(...atoms)` — read-only computed over object-based nodes with a flattened type.
- `mergeLenses(...lenses)` — writable unified atom.
- **Object nodes only**: Merging primitive-valued nodes causes a type/runtime mismatch (static type `string`, runtime index-keyed object) — a type-only divergence, not a runtime safety guarantee.
- **Write propagation**: `merged.value = v` writes `v` **in its entirety** to every underlying lens in one `batch` (not partitioned by path); each lens must accept the whole merged object.
- **Sub-path writes over a merged root are rejected**: A lens rooted at a merged lens reads normally, but assigning to it throws because a merged root cannot partition a sub-path write; write to the underlying sources instead.

### 2.10 Type Guards, Diagnostics & Internals

- **Guards**: `isAtom`, `isComputed`, `isEffect`, `isWritable`, `isPromise` (`Promise` or thenable).
- **Low-level**: `getPathValue(source, parts)`, `setDeepValue(obj, keys, index, value)` (immutable, structural-sharing update).
- **Debug**: `dumpGraph()` (active node metadata), `trackUpdate(id, name)`; auto-names `atom_1`, `calc_5`, `effect_3`.
- **Internal**: `SlotBuffer` and `ReactiveTracker` dependency tracking with swap-based link reconciliation.

### 2.11 Architectural Rationale & Constraints

1. **Sync tracking before await**: Reading sources before the first `await` keeps tracking deterministic.
2. **Class-based internals**: Enables V8 monomorphism, requiring disciplined state management.
3. **SMI-safe counters**: 31-bit epoch, version, and ID use modulo rollover on exhaustion (not lifetime-unique tokens).
4. **SlotBuffer (SVO)**: `#fastSlot0`–`#fastSlot3` inline slots avoid array allocation for ≤4 connections; iteration locks rather than snapshot-copies.

## 3. jQuery Bindings — `@but212/atom-effect-jquery`

Onboarding and usage patterns: `packages/jquery/docs/`.

### 3.1 Scope & Runtime Requirements

- Built on [Core Engine](#2-core-engine--but212atom-effect); all methods live on jQuery collections (`$(selector).method()`).
- Requires **jQuery 4.0.0+** (modern browser security primitives, avoids legacy XSS vectors).
- All DOM insertion vectors route untrusted content through sanitization ([Security & Sanitization Architecture](#35-security--sanitization-architecture)).
- All effects and subscriptions are tracked for disposal ([DOM Lifecycle & Memory Management](#34-dom-lifecycle--memory-management)).

### 3.2 Declarative & Form Bindings

#### Unified Binding — `.atomBind(bindings)`

Central dispatcher accepting `text`, `html`, `class`, `css`, `attr`, `prop`, `show`, `hide`, `value`, `checked`, `form`, `on`:

- **Task-based loop**: Pre-compiles bindings into a task array before iterating the collection, avoiding key enumeration inside the DOM loop.
- **Monomorphic strategy**: Resolves read/write strategy (e.g. `multipleSelect`) at construction, avoiding feature-detection branches on the reactive path.
- **Local caching**: Caches the last written DOM value to avoid layout thrashing.
- **Scoped radio synchronization**: Finds radio peers via scoped `querySelectorAll` on the form or root container (no persistent O(1) `WeakMap` cache).
- `.atomUnbind()` disposes all bindings and effects on elements and descendants.

#### Content & Attributes

| Method | Behavior |
| :--- | :--- |
| `.atomText(atom, formatter?)` | Updates `textContent`. Accepts `AsyncReactiveValue` (Promise or atom yielding Promise). `[source, formatter]` tuple valid in `.atomBind()`. |
| `.atomHtml(atom)` | Updates `innerHTML`, always via `sanitizeHtml` ([Security](#35-security--sanitization-architecture)). |
| `.atomClass(name, atom)` / `.atomClass(classMap)` | Toggles classes by truthiness; stays applied while any associated condition is true. |
| `.atomCss(prop, atom, unit?)` / map | Updates inline CSS with optional unit suffix. |
| `.atomAttr(name, atom)` / map | Updates HTML/SVG attrs; blocks `on*`, `srcdoc`, and protocol payloads. Removes boolean attrs when `false`; coerces WAI-ARIA booleans to `"true"`/`"false"`. |
| `.atomProp(prop, atom)` / map | Sets DOM properties; blocks structural properties (`innerHTML`, `outerHTML`) and prototype vectors (`__proto__`, `constructor`, `prototype`). |

#### Control Flow

- `.atomShow(atom)` / `.atomHide(atom)` — toggles visibility, capturing and restoring original `display` (e.g. `flex`, `grid`).
- `.atomList(listAtom, options)` — reactive array → DOM reconciliation ([List Reconciliation](#33-atomlist-reconciliation)).

#### Form Bindings

| Method | Behavior |
| :--- | :--- |
| `.atomVal(atom, options?)` | Two-way sync for `<input>`, `<textarea>`, `<select>` (`<select multiple>` via `string[]`). IME-stable, preserves cursor/focus. Options: `debounce`, `format`, `parse`, `equal`. |
| `.atomChecked(atom)` | Two-way sync for checkbox/radio; radio groups sync peers sharing `name` via scoped root/form queries. |
| `.atomForm(atom \| atom[], options?)` | Two-way form sync by `name`. Multi-atom: reads merged view across all sources; writes mutate only the current owner (last source defining the path, else first source). Supports nested dot-paths, dynamic inputs (`MutationObserver`), native Constraint Validation (`setCustomValidity`), `debounce`, `event`, `parse`, `format`, `equal`, `transform`, `onChange`, `validation`. Empty source array throws. |
| `.atomOn(event, handler)` | Lifecycle-aware delegation; handlers run in `batch()` and auto-unbind on teardown. |

- **Multi-atom trade-off**: Binding snapshots the source list (not values). Because field reads observe every source, any source write re-runs the field effect; DOM writes still skip when the value is unchanged.
- **Field ownership**: Input requires the current form and field name at both dispatch and debounced commit; stale results after ownership changes are discarded. Observed native removals outside the auto-cleanup root that detach an external control from its bound form release only the form binding. Patched `.detach()` preserves bindings across refreshes whether removing the control, its form, or a form container; while ownerless in that state, model-to-control updates continue but input does not update the model. Controls explicitly unbound via `.atomUnbind()` stay unbound until form owner or field name changes, or the caller reconciles/rebinds the form.
- **Cross-root form moves**: Call `refreshFormBinding(form)` after inserting a detached form into an unobserved shadow root, or when a shadow host containing a bound form connects inside an unobserved shadow root (external controls may gain a form owner without mutating the form's own root). Preserves active bindings, reconciles current controls, observes future changes; no-op if unbound.
- **Validation teardown**: Unbinding stops reactive validation immediately. Non-validatable controls (`fieldset`, `output`, `object`) never receive reactive validators. Eligible controls clear matching binding-owned custom errors synchronously (re-entrant custom setters apply pending work after the outer setter returns using the current binding). Disabled/readonly/barred controls defer cleanup until a `MutationObserver` delivery where they become eligible; teardown never alters eligibility, so synchronous `checkValidity()` right after enabling may still see the old error. A new validation binding or a successful external call through the binding's wrapped `setCustomValidity` cancels deferred cleanup. If the wrapper is replaced, ownership tracking resumes on the next reactive write; if unwrappable or bypassed via a saved setter, cleanup preserves differing messages but cannot distinguish identical ones.

#### Components & Lifecycle Hooks

- `.atomMount(component, props?)` — runs in `batch()` + `untracked()`, may return cleanup; `.atomUnmount()` recursively disposes via `registry.cleanupTree()`.
- Call `.atomUnmount()` before programmatically removing or replacing a mounted container.

### 3.3 `atomList` Reconciliation

3-pass pipeline minimizing DOM churn:

1. **Head/tail fast-forwarding**: Skip diffing for stable bounds.
2. **Middle-range diffing**: Diff dirty middle via persistent key map → insert/delete/move instructions.
3. **Greedy placement**: Reverse-order `insertBefore` for cross-browser predictability.
4. **Cold start**: Concatenates sanitized HTML, parses with `$.parseHTML()`, and inserts via `replaceChildren`, bypassing jQuery instantiation.

**Options & callbacks:** `key` (required), `render`, `bind`, `update`, `onAdd`, `onRemove`, `empty`, `isEqual`, `events`.

**Async removal & node identity:**

- Pending `onRemove` transitions track **node identity, not key**. Entering removal strips `data-atom-key`; if re-bound live before async removal resolves, `commitRemoval` sees the re-bound key and aborts teardown.
- A re-bind backstop guarantees a pending node carrying `data-atom-key` is never physically removed.
- **Node-identity tracking applies to `Element`/`jQuery`/`DocumentFragment` renders** (persistent nodes). String `render` rebuilds via `replaceChildren` each cycle, so identity cannot span pending removal.
- **Duplicate keys**: Logs warning; renders both items as fresh DOM nodes without dropping data; superseded nodes tear down via `onRemove`.
- **Context disposal**: Disposing or replacing a list binding synchronously cleans snapshot and pending-removal nodes (including registry bindings) before clearing list state.

### 3.4 DOM Lifecycle & Memory Management

#### States

| State | Description | Triggers |
| :--- | :--- | :--- |
| `ATTACHED` | Connected; reactive effects/bindings active. | `.atomMount()`, insertion |
| `DETACHED` | Disconnected; retains reactive state. | `.detach()`, synchronous relocation |
| `DESTROYED` | Permanently removed; all resources released. | `.remove()`, `.empty()`, `.atomUnmount()` |

#### Scenario Matrix

| Scenario | Transition | Cleanup | Mechanism |
| :--- | :--- | :--- | :--- |
| DOM relocation | `ATTACHED` → `DETACHED` → `ATTACHED` | None | Synchronous moves preserve bindings if connected or inside an observed root at delivery. |
| `.detach()` | `ATTACHED` → `DETACHED` | None | Lifecycle patch preserves bindings without suppressing subsequent native removals. |
| Native removal | `ATTACHED` → `DESTROYED` | Deferred | Observer runs `cleanupTree()` in a microtask for nodes outside document and observed roots. |

#### `BindingRegistry`

- **WeakMap storage** (`nodeStateMap`): Maps DOM elements to active `EffectObject`s; GC reclaims externally removed elements.
- **Static snapshotting & early exit**: Bound elements carry `_aes-bound` / `_aes-has-shadow`; teardown checks via `getElementsByClassName` (O(1) index) to skip `querySelectorAll` on clean trees.
- **Owned cleanup cancellation**: Owners can idempotently unregister their cleanup task before teardown without removing a newer manager for the same target.

#### Auto-Teardown (`MutationObserver`)

- Global observer on configured `root` (default `document.body`).
- **Deferred cleanup (move robustness)**: Marks removed nodes and queues cleanup in a microtask; re-insertion before the microtask runs (e.g. sorting) aborts cleanup.

#### Shadow DOM Traversal

- Hosts with open/closed Shadow DOMs are tagged `_aes-has-shadow`; `cleanupTree` traverses their `ShadowRoot` objects.

#### Lifecycle Guarantees

1. **Idempotent cleanup**: Redundant `cleanup()` calls are no-ops; once `DESTROYED`, no re-initialization occurs.
2. **Shadow DOM transparency**: Manages both open and closed shadow roots.

### 3.5 Security & Sanitization Architecture

**Layered defense** isolating untrusted data via native browser primitives.

#### Prototype-Bound Bridge (Clobbering Protection)

- Sanitizer parser, serializer, traversal, node replacement, text/child access, and attribute operations use captured native prototype methods/accessors for `Document`, `Element`, `Node`, `HTMLTemplateElement`, and `TreeWalker`.
- Guarantees native behavior even if host-document or created-instance properties are shadowed (pre-module prototype tampering is out of scope).

#### Inert Template Parsing (`sanitizeHtml`)

- Parses inside detached `HTMLTemplateElement` contexts — strictly inert (no script execution or external resource requests).
- Fresh parser/serializer per call for recursive isolation (e.g. `srcdoc`).

#### Sanitization Rules

| Vector | Defense |
| :--- | :--- |
| Executable tags (`script`, `iframe`, `object`, `embed`, `applet`) | Neutralized to `<span>` wrappers (attributes scrubbed). |
| Structural/state tags (`base`, `meta`, `link`, `style`, `title`, `noscript`, `form`, `isindex`) | Neutralized. |
| Global fragment `body` | Neutralized. |
| Event handlers (`on*`) | Stripped; logged to `data-unsafe-attr`. |
| URI protocols (`javascript:`, `vbscript:`) | `atomHtml`: replaced with `data-unsafe-protocol:`. `atomAttr`/`atomProp`: update aborted (target unchanged) + warning. |
| DOM clobbering (`id`/`name` matching `attributes`, `tagName`, `parentNode`, …) | Blocked. |
| CSS injection | Filtered by `isDangerousCss` (strips comments; blocks `expression()`, `-moz-binding`, dangerous `url()`). |
| SVG/SMIL (`attributeName`, `from`, `to`, `values`) | Scrubbed if containing handlers or dangerous URIs. |
| Encoded bypasses | Recursive double entity decoding; strips null bytes, control chars (`\x00-\x1f`), and `\ufffd`. |

**Sink behavior:**

- `.atomHtml` — routes through `sanitizeHtml` (primary XSS defense).
- `.atomAttr(name, atom)` — validates name/value; blocks `on*` and `srcdoc` (case-insensitive); protocol-checks URIs (abort + warning).
- `.atomProp(name, atom)` — blocks `innerHTML`, `outerHTML`, `srcdoc` (abort + warning).
- `.atomCss(prop, atom)` — filters declarations, strips comments, blocks `expression()`, `-moz-binding`, dangerous `url()`.

**CSP compliance:** No `eval()`, `new Function()`, or inline event registration.

### 3.6 Effect Orchestration

- **Race protection**: Monotonic `latestId` applies only the most recent Promise resolution.
- **Disposal tracking**: Pending async resolutions link to `BindingRegistry` and discard after disposal; patched `.detach()` preserves pending updates with the binding.
- **Execution isolation**: Updaters run in `untracked` to avoid capturing secondary dependencies during DOM writes.
- **Binding isolation**: Bindings in `atomBind` share one effect, but each source reads and applies independently; a throwing source logs via `debug.error` without blocking sibling bindings.

## 4. Utilities — `@but212/atom-effect-utils`

Benchmarks: `packages/utils/docs/BENCHMARKS.md`.

### 4.1 `Result<T, E>`

Discriminated union `Ok<T> | Err<E>` for non-throwing error handling (default `E = Error`):

- `Ok<T>`: `{ ok: true; value: T; error: undefined }`
- `Err<E>`: `{ ok: false; value: undefined; error: E }`
- Consumers check `result.ok` before accessing `value`/`error` (compile-time enforced).

#### Factory & Helper Functions

| Member | Behavior |
| :--- | :--- |
| `ok(v)` | Ok wrapping `v`; `undefined` reuses frozen `voidSuccessResult` singleton (zero allocation). |
| `err(e)` | Err wrapping `e`. |
| `isErr(r)` | Type guard. |
| `unwrap(r)` | Returns `value` if Ok; **throws wrapped error** if Err. |
| `tryCatch(fn)` | Runs sync `fn`; wraps throws via `ensureError` into `Err`. |

#### Error Normalization

- `ensureError(value)`: Passthrough for `Error`; wraps other thrown values (strings, `null`, objects) into `Error` with original as `cause`.

### 4.2 `SlotBuffer<T>`

Ordered collection with V8 hidden-class stability for reactive dependency tracking:

- **Fast lane**: `#fastSlot0`–`#fastSlot3` inline slots (indices 0–3) avoid array allocation.
- **Overflow**: Array for indices ≥ 4.
- **`length`** — physical capacity (including null gaps); **`size`** — logical non-null count; **`isLocked`** — true during iteration.

| Member | Behavior |
| :--- | :--- |
| `at(index)` | Item or `null` if empty/out of bounds. |
| `has(item)` | Reference membership; false for `null`/`undefined`. |
| `forEach(cb)` | Iterates non-null items in order; locks buffer and defers `compact()` (not a snapshot). |
| `some(pred)` | Early-exit predicate scan; locks during iteration (not a snapshot). |
| `push` / `compact` / `lock` / `unlock` | Unlocked `remove()` compacts immediately (`length === size`); locked removals mask slots as `null` and defer compaction until lock count reaches zero. |

**Iteration safety**: Callbacks run locked (compaction deferred). Structural mutation is allowed and traversal is not snapshot-isolated; callbacks should not rely on added/removed items being visited in the current pass.

### 4.3 Type Guards

#### `isPromise<T>(value): value is PromiseLike<T>`

Tiered detection: `instanceof Promise` fast path, then duck-typed `typeof value.then === 'function'` for Promises/A+ compatibility (handles objects and functions).

### 4.4 Value Equality

#### `shallowEqual(a, b)`

- `Object.is(a, b)` short-circuits (`NaN`, `+0`/`-0`).
- Returns `false` if either side is non-object/`null`.
- Checks key count first (early exit), then `Object.hasOwn` and `Object.is` per key.

### 4.5 Type-Level Utilities

| Type | Behavior |
| :--- | :--- |
| `Equal<X, Y>` | Strict type equality distinguishing `any`/`unknown` and `readonly` modifiers (`Equal<any, unknown>` = false; `Equal<{readonly a:1}, {a:1}>` = false). |
| `Merge<U>` | Flattens a union of object types (`Prettify<UnionToIntersection<U>>`). |
| `Prettify<T>` | Forces TS to resolve intersections into flat object types for IDE tooltips. |
| `UnionToIntersection<U>` | Converts a union to an intersection via contravariant position. |

## 5. Related Documentation

- **Agent Operations**: [AGENTS.md](./AGENTS.md) — Monorepo commands, safety boundaries, verification workflow.
- **LLM Quick Reference**: [llms.txt](./llms.txt) — Concise summary and quick-start examples.
- **Core Onboarding**: [packages/core/docs/ONBOARDING.md](./packages/core/docs/ONBOARDING.md)
- **jQuery Onboarding & Patterns**: [packages/jquery/docs/ONBOARDING.md](./packages/jquery/docs/ONBOARDING.md), [packages/jquery/docs/PATTERNS.md](./packages/jquery/docs/PATTERNS.md)
- **Conventions**: [docs/conventions/](./docs/conventions/) — Code documentation, Git, Markdown, and naming conventions.
