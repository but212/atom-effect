# Utils Specification — `@but212/atom-effect-utils`

Normative contracts for the functional primitives and internal data structures. Benchmarks stay in `packages/utils/docs/BENCHMARKS.md`; this document covers behavior only.

## 1. `Result<T, E>`

A discriminated union `Ok<T> | Err<E>` for functional error handling without throwing.

- `Ok<T>`: `{ ok: true; value: T; error: undefined }`
- `Err<E>`: `{ ok: false; value: undefined; error: E }`
- Default error type `E = Error` when unspecified.
- Consumers must check `result.ok` before accessing `value`/`error` (compile-time enforced).

### Factory & helper contracts

| Member | Contract |
| :--- | :--- |
| `ok(v)` | Ok wrapping `v`. `undefined` reuses a pre-allocated frozen `voidSuccessResult` singleton (no allocation). |
| `err(e)` | Err wrapping `e`. |
| `isErr(r)` | Type guard. |
| `unwrap(r)` | Returns value if Ok; **throws the wrapped error** if Err. |
| `tryCatch(fn)` | Runs sync fn; on throw wraps via `ensureError` into `Err`. |

### Error normalization

- `ensureError(value)`: passthrough if already `Error`; otherwise wraps any thrown value (strings, `null`, objects) into a standard `Error` with the original as `cause`.

## 2. `SlotBuffer<T>`

High-performance ordered collection for V8 hidden-class stability, used by the reactive dependency tracker.

- **Fast lane**: `#fastSlot0`–`#fastSlot3` inline slots (indices 0–3) avoid array allocation.
- **Overflow**: array for indices ≥ 4.
- **`length`** — physical capacity (including null gaps); **`size`** — logical non-null count; **`isLocked`** — true during iteration.

| Member | Contract |
| :--- | :--- |
| `at(index)` | Item or `null` if empty/out of bounds. |
| `has(item)` | Reference membership; false for `null`/`undefined`. |
| `forEach(cb)` | Iterates non-null items in order; locks the buffer and defers `compact()`. It is not a snapshot. |
| `some(pred)` | Early-exit predicate scan; locks during iteration and is not a snapshot. |
| `push` / `compact` / `lock` / `unlock` | Structural ops; unlocked `remove()` compacts immediately (`length === size`), while locked removals mask slots as `null` and defer compaction until the lock count returns to zero. |

**Iteration safety invariant**: callbacks run while the buffer is locked, so compaction is deferred. Structural mutation is not prohibited and traversal is not snapshot-isolated; callback code must not rely on newly added or removed items being visited in the current pass.

## 3. Type guards

### `isPromise<T>(value): value is PromiseLike<T>`

Tiered detection: native `instanceof Promise` first (fast path), then duck-typed thenable detection (`typeof value.then === 'function'`) for Promises/A+ compatibility. Handles objects and functions.

## 4. Value equality

### `shallowEqual(a, b)`

Shallow object equality:

- `Object.is(a, b)` short-circuits (correct `NaN` and `+0`/`-0` handling).
- Returns false if either side is non-object/`null`.
- Compares key count first (early exit); each key must exist on `b` (`Object.hasOwn`) and be `Object.is`-equal.

## 5. Type-level utilities

| Type | Contract |
| :--- | :--- |
| `Equal<X, Y>` | Strict type equality — distinguishes `any`/`unknown`, and `readonly` modifiers that `extends` cannot isolate. `Equal<any, unknown>` = false; `Equal<{readonly a:1}, {a:1}>` = false. |
| `Merge<U>` | Flattens a union of object types into a single merged object type (`Prettify<UnionToIntersection<U>>`). |
| `Prettify<T>` | Identity mapping that forces TS to resolve intersections into readable flat object types for IDE tooltips. |
| `UnionToIntersection<U>` | Converts a union to an intersection via the contravariant-position trick. |
