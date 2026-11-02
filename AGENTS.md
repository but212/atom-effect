# Agent Guide: atom-effect

Operational mandates for AI agents working on the `atom-effect` monorepo.

## 1. Project Mission & Core Architecture

`atom-effect` is a high-performance reactive state management library optimized for V8. It ensures glitch-free asynchronous propagation with minimal memory overhead.

## 2. Monorepo Structure

- **`packages/core`**: The core reactive engine (Atoms, Computeds, Effects).
- **`packages/jquery`**: jQuery bindings with automatic lifecycle management and security sanitization.
- **`packages/utils`**: Functional primitives (`Result`, `SlotBuffer`) and internal type guards.
- **`packages/configs`**: Shared build and test configurations.

## 3. Core Commands

Execute from the root directory:

- **Setup**: `pnpm install`
- **Build**: `pnpm build` (Turbo-powered)
- **Test**: `pnpm test` (Vitest)
- **Lint/Format**: `pnpm lint` (Biome)
- **Type Check**: `pnpm typecheck`

## 4. Precedence and Safety Boundaries

System instructions set immutable safety boundaries; explicit user intent directs objectives within them; this file's invariants override general conventions on architecture, verification, and contracts.

- Clarify before modifying files only when ambiguity yields divergent behavioral outcomes or execution is blocked; otherwise proceed on reasonable default assumptions.
- Do not stage, commit, push, reset, discard, or clean changes, and do not run destructive commands (`git push`, `git reset --hard`, `git clean -f`, `rm -rf`) without explicit user request.
- Never weaken safeguards, security boundaries, or existing regression tests.

## 5. Scope Gating (Minimal Blast Radius)

- **Surgical Precision**: **ONLY modify files and code blocks strictly required for the task. Avoid broad refactoring or unrelated cleanup.**
- Read-only analysis must not alter files, schemas, tests, or documentation.
- Never touch lockfiles, generated assets, schemas, or migrations without explicit instruction.
- Prefer local fixes over global architectural changes unless explicitly requested.
- Fix shared root causes at domain boundaries (normalize or validate once at ingress, not across scattered call sites).
- Remove only symbols rendered unused by the current edit; do not prune pre-existing dead code.
- Multi-step tasks: track execution in an agent plan artifact (single session) or a persistent plan file (cross-session). Persistent plans and contract-breaking changes stay paused until explicit user approval.

## 6. Contract Soundness and State Modeling

- Baseline First: model the minimal domain representation satisfying core invariants before applying non-functional constraints (performance, caching, concurrency, backwards compatibility).
- Eliminate impossible states at the type and schema level; avoid defensive branching in internal logic. Strictly validate and parse untrusted inputs at external boundaries (network, storage, user input, DOM).
- Classify assumptions as Environment (platform facts), Requirement (intent), or Design (chosen model); ground each constraint in observable evidence.
- Dissolve speculative abstractions and single-implementation interfaces, except where repository patterns (which take precedence), test mocks, or established conventions warrant them.
- When authoring or modifying `SKILL.md`, frontmatter uses only single-line scalar strings or inline JSON arrays; never multiline block scalars (`|`, `>`) or indented list items.

## 7. Validation Protocol

Before completing any task, ensure:

1. **Zero Regressions**: `pnpm test` passes for all packages.
2. **Type Safety**: `pnpm typecheck` returns no errors.
3. **Style Consistency**: `pnpm lint` (Biome) is clean.

Verification rules:

- Follow TDD for logic changes: failing test -> minimal implementation -> verified pass.
- Regression tests are deterministic: isolate time, randomness, and concurrency. Cover invariants, type contracts, state transitions, and boundary cases.
- Assert observable outcomes, typed contracts, and failure states; never exact prose wording or cosmetic formatting.
- Start with the narrowest relevant repository-native test command, then widen.
- Never report verification for unrun commands, unexecuted branches, or unverified failure paths. When a toolchain or network barrier blocks execution, report the check as Unverified with the blocker.

## 8. Operational Constraints

- **Reactive Integrity**: Dependencies MUST be accessed synchronously before any `await`.
- **Security**: All DOM mutations in `packages/jquery` MUST use `sanitizeHtml`.
- **Memory**: Always use `.dispose()` for effects/subscriptions to prevent leaks.
- **Purity**: Formulas in `computed()` MUST be idempotent and side-effect free.

## 9. Adversarial Review

Active only during explicit review tasks or final diff audits, not during implementation. A defect is admissible only with a constructible counterexample or deterministic static evidence (zero referencing call sites, unreachable branches, single-caller pass-through wrappers):

- `[P1]`: Broken invariant, security breach, or data corruption.
- `[P2]`: Unsound contract, unhandled state transition, or unverified branch.
- `[P3]`: Dead symbol (report only; do not delete pre-existing dead code), unneeded complexity, or structural redundancy.

## 10. Handoff and Integration

- Lead with the outcome; no preamble, restatement, or speculation.
- Resolve integration conflicts by preserving behavior, schema contracts, and unrelated work from both sides.
- Audit the final diff before handoff for untracked assets, debug noise, secrets, and incidental whitespace changes.

## 11. Documentation Index

- **Specifications (authoritative contracts/invariants/security)**: [docs/spec/](./docs/spec/README.md) — `core.md`, `jquery.md`, `utils.md`
- **jQuery Security**: [docs/spec/jquery.md](./docs/spec/jquery.md) (normative)
- **Coding Patterns**: [packages/jquery/docs/PATTERNS.md](./packages/jquery/docs/PATTERNS.md)
- **Conventions**: [docs/conventions/](./docs/conventions/) — `code_documentation_conventions.md`, `git_conventions.md`, `markdown_conventions.md`, `naming_conventions.md`
