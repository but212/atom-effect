# jQuery Integration API

> [!NOTE]
> The authoritative contracts for every jQuery binding live in [docs/spec/jquery.md](../../../docs/spec/jquery.md). This page is a pointer; it does not restate the rules.

## Where the rules live

| Topic | Authoritative source |
| :--- | :--- |
| Unified binding (`.atomBind`) & content/attribute methods | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §1 |
| Control flow & form bindings (`atomList`, `atomVal`, `atomForm`, …) | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §1–2 |
| DOM lifecycle & memory invariants | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §3 |
| Security & sanitization policy | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §4 |
| Web Components & Dependency Injection | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §5 |
| Routing, PJAX navigation, `atomFetch` | [docs/spec/jquery.md](../../../docs/spec/jquery.md) §6–7 |

## Guidance & examples

- [**Onboarding**](./ONBOARDING.md) — mental model, binding walkthrough, and configuration (`$.initAEJ`, CDN, debug mode).
- [**Patterns**](./PATTERNS.md) — async UI, routing, forms, reactive lists, and Web Components.
- [**Architecture**](./ARCHITECTURE.md) — internal design of the adapter layer.
- [**Lifecycle**](./LIFECYCLE.md) — pointer to the lifecycle specification.
- [**Security**](./SECURITY.md) — pointer to the security specification.
- [**Benchmarks**](./BENCHMARKS.md) — measured performance characteristics.
