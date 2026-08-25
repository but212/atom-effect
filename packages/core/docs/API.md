# API Reference

> [!NOTE]
> The authoritative contracts for every core primitive live in [docs/spec/core.md](../../../docs/spec/core.md) (sections 7–10). This page is a pointer; it does not restate the rules.

## Where the rules live

| Topic | Authoritative source |
| :--- | :--- |
| `atom`, `computed`, `effect` contracts | [docs/spec/core.md](../../../docs/spec/core.md) §7 |
| `batch`, `aeNextTick`, `globalScheduler`, `untracked` | [docs/spec/core.md](../../../docs/spec/core.md) §4, §7 |
| Lenses, `mergeAtoms`, `mergeLenses` | [docs/spec/core.md](../../../docs/spec/core.md) §8–9 |
| Type guards, low-level utilities, debug | [docs/spec/core.md](../../../docs/spec/core.md) §10 |
| Error types & Result propagation | [docs/spec/core.md](../../../docs/spec/core.md) §6 |

## Guidance & examples

- [**Onboarding**](./ONBOARDING.md) — mental model and worked examples of `atom`, `computed`, `effect`, tracking, batching, and async.
- [**Patterns**](./PATTERNS.md) — structural sharing with lenses, async fetching, state composition, and untracked reads.
- [**Architecture**](./ARCHITECTURE.md) — internal design and V8 optimization notes.
- [**Lifecycle**](./LIFECYCLE.md) — pointer to the lifecycle specification.
- [**Benchmarks**](./BENCHMARKS.md) — measured performance characteristics.
