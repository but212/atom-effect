# Core Specification — `@but212/atom-effect`

Normative contracts, lifecycle invariants, and error-handling policy for the reactive core engine. Guidance (onboarding, patterns, benchmarks) lives in `packages/core/docs/`.

## 1. Reactive Semantics

The engine is a deterministic push-pull graph of three node roles:

| Role | Factory | Input | Output | Characteristic |
| :--- | :--- | :--- | :--- | :--- |
| Source | `atom()` | Manual | State | Leaf, non-tracking |
| Transform | `computed()` | Reactive | State | Hybrid, lazy, cached |
| Sink | `effect()` | Reactive | Void | Terminal, side-effects |

**Propagation lifecycle (push → schedule → pull):**

1. **Push**: An `atom` write increments its version and synchronously invalidates direct computed subscribers. Computeds become `DIRTY`; effects are scheduled without executing their side effects in default mode.
2. **Schedule**: Atom subscriber notifications and default effect executions are coalesced into a single microtask flush. Multiple writes coalesce into one downstream pass.
3. **Pull**: On access or effect execution, a node validates its dependencies. Re-computation only occurs if an upstream version incremented. If a dependency re-evaluates to an identical result (version unchanged), the pull short-circuits.

## 2. Node invariants

| Property | Contract |
| :--- | :--- |
| **Epoch** | Process-local 31-bit counter used for job deduplication and session validation; it increases monotonically until modulo rollover. |
| **Version** | Per-node counter, increments only when the output value actually changes (per the equality check). |
| **Drift** | Subscriber cached version differs from dependency's current version. |
| **Glitch** | A node must never observe intermediate or stale state during a propagation cycle. |
| **Tracking** | Dependency tracking is strictly synchronous and implicit: reading `.value` inside a `computed`/`effect` registers a dependency. |
| **Dynamic graph** | Only branches executed in the current pass are tracked. `show ? a : b` with `show` true tracks `a` only. |
| **Untracked reads** | `.peek()` or `untracked(fn)` read without establishing a dependency. |
| **Purity** | `computed` formulas must be idempotent and side-effect free. |
| **Monomorphism** | Public graph-traversal fields use hidden-class-stable layout; behavioral state uses native `#private` fields. |

## 3. Async boundary

Async computeds are treated as state machines with sessions.

- **Session locking**: Only the result of the *most recent* asynchronous trigger resolves the node; results from older, stale sessions are discarded.
- **Synchronous tracking boundary**: Only dependencies accessed **before the first `await`** are tracked. Dependencies after an `await` return their current value but do not trigger re-evaluation. This keeps tracking deterministic and avoids long-lived tracking contexts.
- **AsyncState**: `'idle'`, `'pending'`, `'resolved'`, `'rejected'`.
- **Pending read**: Accessing `.value` while a promise is pending throws `ComputedError` unless a `defaultValue` is configured; with `defaultValue`, that value is returned during pending.
- **Effect cleanup sessions**: When an effect execution begins, all earlier asynchronous cleanup sessions become stale. A cleanup resolved by an older session cannot be installed as the current cleanup after a newer execution.

## 4. Scheduling & batching

- **Default**: Computed invalidation is synchronous, while atom subscriber notifications and default effect executions defer to a microtask flush; multiple synchronous writes still coalesce into one downstream pass.
- **`batch(fn)`**: Groups updates into one notification cycle. Supports nesting (outermost batch flushes last) and commits state even if `fn` throws.
- **`sync: true`**: Option on `atom` and `effect` to deliver synchronously, bypassing the microtask batching.
- **Execution budget**: Each effect enforces `maxExecutionsPerFlush` (default 100) independently; exceeding that per-effect limit disposes the effect. The scheduler separately enforces its aggregate per-flush limit; aggregate overflow is reported via `scheduler.onOverflow(droppedCount, droppedJobs)` and dropped jobs are re-queued exactly once. These limits and failure paths are distinct.

## 5. Lifecycle

- **Identity**: Each node receives a process-local numeric `DependencyId`. IDs are monotonic within the 31-bit SMI range; masking and rollover mean lifetime uniqueness and monotonicity are not guaranteed after rollover.
- **Disposal**: All nodes implement `.dispose()` severing graph references (subscriber slot buffers, dep maps) for immediate collection. Atoms release their stored value; computeds release executable computation, equality, default-value, and error-handler state while retaining only the last cached value required by `.peek()` compatibility.
- **Effect cleanup**: The previous cleanup handle runs before each effect re-run and on disposal. A cleanup returned by a stale asynchronous execution is discarded and cannot overwrite a newer session.
- **Post-disposal atom reads**: `value`/`peek()` return `undefined`; writes are no-ops. Check `isDisposed` before relying on reads.
- **Post-disposal computed reads**: `.value` remains an invalid operation, while `.peek()` preserves the last cached value for compatibility without retaining executable computation state.

## 6. Error handling (Result propagation)

The engine uses a hybrid model to keep the core pure and avoid `try-catch` overhead in hot paths.

1. **Internal monadic propagation**: Internal checks (argument validation, loop budgets, disposed access, circularity) return a `Result<T, Error>`; they do not throw directly.
2. **Synchronous boundary unwrapping**: Public boundaries (`.value` getters, factories, public scheduler wrappers) call `Result.unwrap`, throwing a standard `Error` (`ComputedError`, `EffectError`, `SchedulerError`) for compatibility with throwing consumer code.
3. **Asynchronous scheduler isolation**: During flush, a failed job `Result` is wrapped in a `SchedulerError` and logged — never an unhandled rejection.
4. **`defaultValue` swallowing**: With `defaultValue`, ordinary computation failures and circular-reference failures are caught internally, the `defaultValue` is returned instead of throwing, and the error is recorded on `errors`/`hasError`. `RangeError`, `ReferenceError`, and `SyntaxError` escape unchanged.

**Circularity**: The `RECOMPUTING` flag identifies a node accessed during its own derivation, throwing `ComputedError`.

**Error types:**

- `AtomError` — base: `message`, `cause`, `code` (e.g. `ERR_CIRCULAR_DEP`), `recoverable`.
- `ComputedError`, `EffectError`, `SchedulerError` — specializations.
- `getErrorChain(error)` — reconstructs the `.cause` chain.
- `serializeError(error)` — JSON-serializable form, handling circular references.

## 7. Node API contracts

### `atom<T>(initialValue, options?)`

| Member | Contract |
| :--- | :--- |
| `value` | Getter registers a dependency (in context); setter updates and schedules notification iff the new value fails the equality check (`Object.is` default). |
| `peek()` | Read without registering a dependency. |
| `subscribe(listener \| Subscriber)` | Returns an unsubscription function. Callback params may be `undefined` during certain transitions. |
| `subscriberCount()` | Active subscriber count for diagnostics. |
| `dispose()` | Permanently disables; clears subscribers and releases value. |
| `isDisposed` | Read-only disposal flag (runtime only, not on public TS interfaces). |

Options: `name`, `sync` (default `false`), `equal`.

### `computed(callback, options?)`

| Member | Contract |
| :--- | :--- |
| `value` | Returns cached value, re-computing when stale. |
| `state` | `AsyncState` of the node. |
| `hasError` / `isValid` | Error flag per dependency sub-graph; `isValid` is `!hasError`. |
| `errors` / `lastError` | Collected sub-graph errors / this node's last error. |
| `isPending` / `isResolved` / `isRejected` | Async lifecycle flags. |
| `peek()` | Cached value without tracking or re-computation. |
| `invalidate()` | Forces dirty, ensuring re-computation on next access. |
| `subscribe` / `dispose` | Same shape as atom. |

Options: `name`, `equal`, `defaultValue`, `lazy` (default `true`), `onError`. A `Promise` return types the node as `ComputedAtom<T>`, not `ComputedAtom<Promise<T>>`.

### `effect(callback, options?)`

Callback may return `void`, a cleanup `() => void`, a `Promise<void>`, or a `Promise<cleanup>`.

| Member | Contract |
| :--- | :--- |
| `run()` | Manual trigger. |
| `dispose()` | Stops effect, runs any cleanup. |
| `isDisposed` / `isExecuting` / `executionCount` | State flags. |

Options: `name`, `sync`, `onError`, `maxExecutionsPerFlush` (default 100), `maxExecutionsPerSecond` (dev only).

### Other primitives

- `batch(fn): T` — see §4.
- `aeNextTick(cb?): Promise<void>` — resolves after next flush; for tests.
- `globalScheduler` — low-level flush/batching/execution control. Concrete `ReactiveScheduler`/`SchedulerState` are not exported.
- `untracked(fn): T` — run without dependency registration.

## 8. Lenses & structural sharing

`atomLens(atom, path)` creates a writable virtual atom for a dot-path.

- **Structural sharing**: only objects along the modified path are cloned; unrelated branches keep reference identity, suppressing redundant recomputes.
- **Paths**: dot-notation, array indices (`users.0.name`), and `Map` keys. `Set` is a terminal value (no nested traversal).
- **Prototype preservation**: updates to class instances preserve the original prototype and methods (`instanceof` intact).
- `lensFor(atom)` — factory for multiple lenses bound to one source.
- `composeLens(lens, path)` — sub-lens from an existing lens.

## 9. State composition

- `mergeAtoms(...atoms)` — read-only computed over object-based nodes with a flattened type.
- `mergeLenses(...lenses)` — writable unified atom.
- **Object nodes only**: merging primitive-valued nodes causes a type/runtime mismatch (static type `string`, runtime index-keyed object). If applied, this discrepancy is a type-only divergence, not a runtime safety guarantee.
- **Write propagation**: `merged.value = v` writes the value **in its entirety** to every underlying lens within a single `batch`; it is not partitioned by path. Each underlying lens must accept the whole merged object.

## 10. Type guards & utilities

Guards: `isAtom`, `isComputed`, `isEffect`, `isWritable`, `isPromise` (value is `Promise` or thenable).
Low-level: `getPathValue(source, parts)`, `setDeepValue(obj, keys, index, value)` (immutable, structural-sharing update).
Debug: `dumpGraph()` (active node metadata), `trackUpdate(id, name)`; automatic names `atom_1`, `calc_5`, `effect_3`.
Internal: `SlotBuffer` and dependency buffers with lazy `Map`-based indexing past a capacity threshold and swap-based link reconciliation.

## 11. Design invariants (non-negotiable)

1. **Sync tracking before await** — all reactive sources must be read before the first `await`.
2. **No tracking after await** — dependencies after yield are intentionally not captured.
3. **Class-based internals** — for V8 monomorphism; requires disciplined state management.
4. **SMI-safe counters** — epoch/version/id remain 31-bit for SMI representation and use modulo rollover when the range is exhausted; they are not lifetime-unique tokens.
5. **SlotBuffer (SVO)** — `#fastSlot0`–`#fastSlot3` inline slots avoid allocation for ≤4 connections; iteration is locked but is not a mutation-proof snapshot.
