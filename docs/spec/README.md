# atom-effect Specification

This directory holds the **normative specifications** for the `atom-effect` monorepo: the stable contracts, invariants, and security policies that consumer code may rely on.

## Relationship to package docs

Package `docs/` distinguish specification from guidance:

- **Specification** (moved here): normative contracts, lifecycle invariants, security policy, and architectural constraints that must not change without a breaking-change review.
- **Guidance** (stays in package `docs/`): onboarding, usage patterns, API walkthroughs, and benchmark measurements.

The spec docs here consolidate, and supersede, the normative content previously scattered across each package's `API.md`, `ARCHITECTURE.md`, `LIFECYCLE.md`, and `SECURITY.md`. Those files are now **pointers**: they reference these specs and link to the package guidance (`ONBOARDING.md`, `PATTERNS.md`) instead of restating the rules. See the [Source map](#source-map) below.

## Index

| Document | Scope | Covers |
| :--- | :--- | :--- |
| [core.md](./core.md) | `@but212/atom-effect` | Reactive semantics, node lifecycle, scheduling, async boundary, error handling, composition |
| [jquery.md](./jquery.md) | `@but212/atom-effect-jquery` | Binding contracts, DOM lifecycle invariants, security/sanitization policy, components, routing |
| [utils.md](./utils.md) | `@but212/atom-effect-utils` | `Result`, `SlotBuffer`, type guards, type-level utilities |

## Source map

Normative content was extracted from the following source documents:

| Spec document | Extracted from |
| :--- | :--- |
| `core.md` | `packages/core/docs/API.md`, `packages/core/docs/ARCHITECTURE.md`, `packages/core/docs/LIFECYCLE.md` |
| `jquery.md` | `packages/jquery/docs/API.md`, `packages/jquery/docs/ARCHITECTURE.md`, `packages/jquery/docs/LIFECYCLE.md`, `packages/jquery/docs/SECURITY.md` |
| `utils.md` | `packages/utils/src/*.ts` and `packages/utils/docs/BENCHMARKS.md` |

## Change policy

Any change to a contract, invariant, or security guarantee in these files is a **breaking change** and requires:

1. Explicit approval covering compatibility, migration, and rollback.
2. Synchronized updates to the corresponding package `docs/` pointers and guidance.
3. A regression test asserting the affected invariant.
