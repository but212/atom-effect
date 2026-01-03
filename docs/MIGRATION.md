# Migration Guide: 0.2.0 Update

This release includes significant internal optimizations to improve performance and reduce memory usage. While the **public API remains 100% backward compatible**, there are some internal behavior changes and strictness improvements you should be aware of.

## Performance Improvements

- **30%+ Faster Initial Render**: Computed properties and Effects are initialized significantly faster.
- **20% Less GC Pressure**: Rapidly creating/destroying atoms now generates far less garbage due to Object Pooling.
- **Faster Re-computation**: Updates propagate ~12% faster.

## Behavioral Refinements

### 1. Scheduler Phases are Strict

The Scheduler now enforces strict phases: `IDLE` -> `BATCHING` -> `FLUSHING`.

- **Impact**: In very rare "re-entrant" edge cases (e.g., trying to schedule a new batch *synchronously* inside a flush callback), you might observe stricter ordering.
- **Benefit**: Prevents "infinite loop" classes of bugs and ensures predictable update ordering.

### 2. Error Recovery

- **Improvement**: If a `Computed` or `Effect` throws an error during execution, it now **retains** the dependencies collected *up to the point of failure*.
- **Change**: Previously, an error might have left the node with stale or empty dependencies. Now it attempts to stay reactive to the dependencies it successfully read, allowing for self-recovery if those dependencies change.

## Internal API Changes

If you were using private/internal APIs (starting with `_`), note that:

- **`DependencyManager` is removed**: We now manage dependencies using low-level pooled arrays for speed.
- **`ComputedAtomImpl` / `EffectImpl` internals**: Fields like `_depManager` no longer exist.

## Action Required

For 99% of users: **No action required.** Just upgrade and enjoy the speed.

If you maintain a library that deep-links into `atom-effect` internals, please verify your usage against the new `SchedulerPhase` enum in `src/scheduler`.
