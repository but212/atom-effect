# Agent Guide: atom-effect

This document provides technical context, operational constraints, and architectural standards for AI systems and developers working on the `atom-effect` monorepo.

## Project Context & Mission

`atom-effect` is a high-performance reactive state management library. The primary design goals are V8 optimization, memory efficiency, and glitch-free asynchronous propagation.

## Primary Workflows & Commands

Operational tasks should be executed from the root directory unless package-specific context is required.

- **Environment Setup**: `pnpm install`
- **Build System**: `pnpm build` (Uses Turbo)
- **Validation**: `pnpm test` (Vitest)
- **Static Analysis**: `pnpm typecheck` & `pnpm lint` (Biome)
- **Performance Auditing**: `cd packages/core && pnpm bench`

## Key Symbol Map (AI Discovery)

For deep understanding of the reactive engine, prioritize these files:

- **Base Node**: `packages/core/src/core/base.ts` (`ReactiveNode`)
- **State Source**: `packages/core/src/core/atom.ts` (`AtomImpl`)
- **Derived Logic**: `packages/core/src/core/computed.ts` (`ComputedAtomImpl`)
- **Side Effects**: `packages/core/src/core/effect.ts` (`EffectImpl`)
- **Lifecycle Management**: `packages/jquery/src/core/registry.ts` (`BindingRegistry`)

## Architectural Constraints

### 1. Reactive Integrity

- **Synchronous Dependency Capture**: Dependencies must be accessed before any `await` point.
- **Glitch Prevention**: Use the global epoch and local versioning system to ensure consistent state across the graph.

### 2. Security Standards (jQuery Integration)

- **Mandatory Sanitization**: All DOM injections (HTML, Attr, CSS) must pass through `packages/jquery/src/utils/sanitize.ts`.
- **Clobbering Protection**: Interact with the DOM via `Element.prototype` to avoid shadowed property vectors.

## Coding Patterns & Idioms

- **Purity**: Formulas in `computed()` must be idempotent and free of side effects.
- **Explicit Disposal**: Manage resources via `.dispose()` or the automated `MutationObserver` registry in the jQuery package.
- **Type Safety**: Avoid `any` or type assertions; rely on structural typing and internal type guards (`packages/utils/src/type-guard.ts`).

## Modification Guidelines (Operational Mandates)

- **Surgical Precision**: Apply changes only to the files and logic directly related to the task. Avoid broad refactoring or unrelated "cleanup" to minimize the risk of regressions.
- **Verification Cycle**: Every modification must be validated via the project's testing suite (`pnpm test`). Bug fixes must include a reproduction test case to prevent future regressions.
- **Documentation Sync**: If an internal invariant or public API is altered, corresponding documentation in `docs/` or package directories must be updated concurrently.
