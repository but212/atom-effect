# Utils Specification — `@but212/atom-effect-utils`

Normative contracts for the functional primitives and internal data structures. Benchmarks stay in `packages/utils/docs/BENCHMARKS*.md`; this document covers behavior only.

## 1. `Result<T, E>`

A discriminated union `Ok<T> | Err<E>` for functional error handling without throwing.

- `Ok<T>`: `{ ok: true; value: T; error: undefined }`
- `Err<E>`: `{ ok: false; value: undefined; error: E }`
- Default error type `E = Error` when unspecified.
- Consumers must check `result.ok` before accessing `value`/`error` (compile-time enforced). `isResult(value)` verifies the Result protocol at runtime.

### Factory & helper contracts

| Member | Contract |
| :--- | :--- |
| `ok(v)` | Ok wrapping `v`. `undefined` reuses a pre-allocated frozen `voidSuccessResult` singleton (no allocation). |
| `err(e)` | Err wrapping `e`. |
| `isOk(r)` / `isErr(r)` | Type guards. |
| `match(r, { ok, err })` | Exhaustive both-branch handling. |
| `unwrap(r)` | Returns value if Ok; **throws the wrapped error** if Err. |
| `expect(r, msg)` | Returns value if Ok; throws `Error(msg, { cause: err })` if Err. |
| `unwrapOr(r, fallback)` | Value if Ok, else fallback. |
| `unwrapOrElse(r, fn)` | Value if Ok, else `fn(error)`. |
| `map(r, fn)` | Value if Ok. **Identity optimization**: if `fn` returns the identical value (`Object.is`) and the value is a primitive/`null`/frozen object, returns the original Result instance; otherwise a new Ok. |
| `mapErr(r, fn)` | Error if Err, else original Ok. |
| `andThen(r, fn)` | Chains an Ok-return function; asserts the callback returns a valid Result. |
| `tryCatch(fn)` | Runs sync fn; on throw wraps via `ensureError` into `Err`. |
| `tryAsync(fn)` | Runs async fn; captures rejections/throws into `Err`. |
| `equals(a, b)` | Structural/value equality via `Object.is`; false if either is not a valid Result. |
| `all(results)` | Fail-fast: first `Err` or `Ok(values[])`. |
| `fromPredicate(value, pred, errFactory?)` | Ok(value) if pred true, else `Err(errFactory?.() ?? Error('Predicate failed'))`. |
| `fromThrowable(fn)` | Alias for `tryCatch`. |

### Error normalization

- `ensureError(value)`: passthrough if already `Error`; otherwise wraps any thrown value (strings, `null`, objects) into a standard `Error` with the original as `cause`.

### Identity optimization guard

`map` reuses the original Result only when `Object.is(mapped, value)` **and** the mapped value is `null`, a non-object primitive, or a frozen object. Mutable object results always allocate a new Ok — this avoids aliasing bugs where a later mutation would corrupt a shared cached instance.

## 2. `SlotBuffer<T>`

High-performance ordered collection for V8 hidden-class stability, used by the reactive dependency tracker.

- **Fast lane**: `#fastSlot0`–`#fastSlot3` inline slots (indices 0–3) avoid array allocation.
- **Overflow**: array for indices ≥ 4.
- **Free list**: LIFO reuse of vacated indices.
- **`length`** — physical capacity (including null gaps); **`size`** — logical non-null count; **`isLocked`** — true during iteration.

| Member | Contract |
| :--- | :--- |
| `at(index)` | Item or `null` if empty/out of bounds. |
| `has(item)` | Reference membership; false for `null`/`undefined`. |
| `forEach(cb)` | Iterates non-null items in order; locks the buffer (defers `compact()`). |
| `some(pred)` | Early-exit predicate scan; locks during iteration. |
| `push` / `compact` / `lock` / `unlock` | Structural ops; `compact()` deferred while locked. |

**Iteration safety invariant**: structural changes are forbidden during `forEach`/`some`; `compact()` is deferred until the lock count returns to zero.

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
