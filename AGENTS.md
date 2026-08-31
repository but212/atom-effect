# Agent Guide: atom-effect

This document provides essential context and operational mandates for AI agents working on the `atom-effect` monorepo.

## 1. Project Mission & Core Architecture

`atom-effect` is a high-performance reactive state management library optimized for V8. It ensures glitch-free asynchronous propagation with minimal memory overhead.

## 2. Monorepo Structure

- **`packages/core`**: The core reactive engine (Atoms, Computeds, Effects).
- **`packages/jquery`**: jQuery bindings with automatic lifecycle management and security sanitization.
- **`packages/utils`**: Functional primitives (Option, Result) and internal type guards.
- **`packages/configs`**: Shared build and test configurations.

## 3. Core Commands

Execute from the root directory:

- **Setup**: `pnpm install`
- **Build**: `pnpm build` (Turbo-powered)
- **Test**: `pnpm test` (Vitest)
- **Lint/Format**: `pnpm lint` (Biome)
- **Type Check**: `pnpm typecheck`

## 4. Validation Protocol

Before completing any task, ensure:

1. **Zero Regressions**: `pnpm test` passes for all packages.
2. **Type Safety**: `pnpm typecheck` returns no errors.
3. **Style Consistency**: `pnpm lint` (Biome) is clean.
4. **Surgical Precision**: **ONLY modify files and code blocks strictly required for the task. Avoid broad refactoring or unrelated cleanup.**

## 5. Operational Constraints

- **Local Context**: Prefer local fixes over global architectural changes unless explicitly requested.
- **Reactive Integrity**: Dependencies MUST be accessed synchronously before any `await`.
- **Security**: All DOM mutations in `packages/jquery` MUST use `sanitizeHtml`.
- **Memory**: Always use `.dispose()` for effects/subscriptions to prevent leaks.
- **Purity**: Formulas in `computed()` MUST be idempotent and side-effect free.

## 6. Documentation Index

- **Specifications (authoritative contracts/invariants/security)**: [docs/spec/](./docs/spec/README.md) — `core.md`, `jquery.md`, `utils.md`
- **Core Architecture**: [packages/core/docs/ARCHITECTURE.md](./packages/core/docs/ARCHITECTURE.md)
- **jQuery Security**: [docs/spec/jquery.md](./docs/spec/jquery.md) (normative) · [packages/jquery/docs/ARCHITECTURE.md](./packages/jquery/docs/ARCHITECTURE.md)
- **Coding Patterns**: [packages/jquery/docs/PATTERNS.md](./packages/jquery/docs/PATTERNS.md)
- **API Reference**: [packages/core/docs/API.md](./packages/core/docs/API.md) | [packages/jquery/docs/API.md](./packages/jquery/docs/API.md)
- **Lifecycle**: [docs/spec/core.md](./docs/spec/core.md) · [docs/spec/jquery.md](./docs/spec/jquery.md)
