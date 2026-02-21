# Contributing Guide

Contributions to `@but212/atom-effect` are welcome. This guide will help you get started.

## Prerequisites

- **Node.js**: v20.x or higher.
- **pnpm**: This project uses `pnpm` for package management. Do not use `npm` or `yarn`.

## Getting Started

1. **Clone the repository**:

   ```bash
   git clone https://github.com/but212/atom-effect.git
   cd atom-effect
   ```

2. **Install dependencies**:

   ```bash
   pnpm install
   ```

   > **Important**: Do not delete `pnpm-lock.yaml`. It ensures dependency consistency across environments.

3. **Build the project**:

   ```bash
   pnpm build
   ```

## Development Workflow

### Project Structure

This is a monorepo containing:

- `packages/core`: The main reactivity library.
  - `src/core`: `atom`, `computed`, `effect` implementations.
  - `src/internal`: Scheduler, epoch management, object pooling.
  - `src/tracking`: Dependency tracking context.
- `packages/jquery`: jQuery adapters.

Most contributions will likely be in `packages/core`.

### Running Tests

**Vitest** is used for testing.

- Run all tests:

  ```bash
  pnpm test
  ```

- Run tests in watch mode:

  ```bash
  pnpm test:watch
  ```

### Type Checking

TypeScript is used for static analysis.

- Run type check:

  ```bash
  pnpm typecheck
  ```

### Linting and Formatting

**Biome** is used for linting and formatting.

- Check for issues:

  ```bash
  pnpm lint
  ```

- Fix issues:

  ```bash
  pnpm lint:fix
  ```

### Benchmarks

Performance is critical. If you make a change, please verify there are no regressions.

- Run benchmarks:

  ```bash
  cd packages/core
  pnpm bench
  ```

## Coding Standards

- **Performance Awareness**: V8 characteristics (hidden classes, Smi packing) are considered carefully in core logic. Please read [ARCHITECTURE.md](./packages/core/docs/ARCHITECTURE.md) before making structural changes.
- **Tests Required**: Every feature or bug fix should include a regression test.
- **API Stability**: If you change the public API, please discuss it in an issue first.

## Release Process

Releases are automated via GitHub Actions when a version tag (`v*`) is pushed. See `.github/workflows/publish.yml`.
