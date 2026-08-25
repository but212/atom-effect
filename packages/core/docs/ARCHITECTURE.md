# Architecture & Design

> [!NOTE]
> The normative architecture invariants live in [docs/spec/core.md](../../../docs/spec/core.md) (sections 1–6, 11). This page is a pointer; it does not restate the design.

## Where the design lives

| Topic | Authoritative source |
| :--- | :--- |
| Push-pull propagation lifecycle | [docs/spec/core.md](../../../docs/spec/core.md) §1 |
| Node roles & invariants (Epoch, Version, Drift, Glitch) | [docs/spec/core.md](../../../docs/spec/core.md) §1–2 |
| Async boundary & session locking | [docs/spec/core.md](../../../docs/spec/core.md) §3 |
| Scheduling, batching, execution budgets | [docs/spec/core.md](../../../docs/spec/core.md) §4 |
| Error handling (Result propagation) | [docs/spec/core.md](../../../docs/spec/core.md) §6 |
| Design invariants (SMI, SlotBuffer, class-based internals) | [docs/spec/core.md](../../../docs/spec/core.md) §11 |

## Guidance & examples

- [**Onboarding**](./ONBOARDING.md) — mental model and worked examples.
- [**Patterns**](./PATTERNS.md) — architectural usage patterns.
- [**API Reference**](./API.md) — pointer to the API contracts.
- [**Lifecycle**](./LIFECYCLE.md) — pointer to the lifecycle specification.
- [**Benchmarks**](./BENCHMARKS.md) — measured performance characteristics.
