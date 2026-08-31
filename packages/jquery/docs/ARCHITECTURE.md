# Architecture & Design

> [!NOTE]
> The normative design and lifecycle invariants live in [docs/spec/jquery.md](../../../docs/spec/jquery.md). This page is a pointer; it does not restate the design.

## Where the design lives

| Topic | Authoritative source |
| :--- | :--- |
| Binding pipeline & effect orchestration (race protection, `untracked` isolation) | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §1, §8 |
| `BindingRegistry`, auto-teardown, Shadow DOM traversal | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §3 |
| `atomList` 3-pass reconciliation & node identity | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §2 |
| Web Components, context engine, stylesheet caching | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §5 |
| Routing & navigation (tiered matcher, PJAX, coordinator) | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §6 |
| Security implementation | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §4 |

## Guidance & examples

- [**Onboarding**](./ONBOARDING.md) — mental model and binding walkthrough.
- [**Patterns**](./PATTERNS.md) — architectural usage patterns.
- [**API Reference**](./API.md) — pointer to the API contracts.
- [**Lifecycle**](./LIFECYCLE.md) — pointer to the lifecycle specification.
- [**Security**](./SECURITY.md) — pointer to the security specification.
- [**Benchmarks**](./BENCHMARKS.md) — measured performance characteristics.
