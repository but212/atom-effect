# Onboarding & Contributing

Welcome! We're glad you're interested in contributing to `@but212/atom-effect`.
This guide will get you from "Clone" to "PR" as quickly as possible.

## 1. Setup

We use **pnpm** for package management and **TurboRepo** for build orchestration.

```bash
# Clone the repo
git clone https://github.com/but212/atom-effect.git
cd atom-effect

# Install dependencies (from root)
pnpm install
```

## 2. Directory Structure

- `packages/core`: The main reactivity library (you are likely here).
  - `src/core`: `atom`, `computed`, `effect` implementations.
  - `src/internal`: Scheduler, epoch management, object pooling.
  - `src/tracking`: Dependency tracking context.
- `apps/benchmarks`: Performance comparison projects.

## 3. Common Tasks

### Running Tests

We use **Vitest**.

```bash
cd packages/core
pnpm test
```

### Running Benchmarks

Performance is critical. If you make a change, please verify regressions.

```bash
cd packages/core
pnpm bench
```

## 4. Your First PR

1. **Pick an issue** or discuss your idea in a new issue.
2. **Create a branch**: `feature/my-cool-feature` or `fix/that-annoying-bug`.
3. **Format & Lint**: Ensure `pnpm lint` passes.
4. **Submit**: Open a PR against `main`.

> **Tip**: If you're adding a feature, please include a test case demonstrating why it's needed!
