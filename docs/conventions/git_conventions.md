# Git Commit and Branch Naming Conventions

This document outlines the conventions for Git commit messages, branch names, Pull Requests, and local validation within the `atom-effect` project. Adhering to these standards ensures a readable repository history and streamlines code reviews.

---

## 1. Commit Message Conventions

We follow the **Conventional Commits** specification. Every commit message must have a structured header consisting of a **type**, an optional **scope**, and a **subject**.

### Format

```text
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

> [!IMPORTANT]
> Keep the subject line under 72 characters. The header must not end with a period.

---

### Commit Types

The `type` must be one of the following:

| Type | Description | Example |
| :--- | :--- | :--- |
| **`feat`** | A new feature | `feat(core): add support for atom map primitives` |
| **`fix`** | A bug fix | `fix(jquery): resolve memory leak in element cleanup` |
| **`refactor`** | A code change that neither fixes a bug nor adds a feature | `refactor(core): optimize dependency tracking loop` |
| **`test`** | Adding missing tests or correcting existing tests | `test(core): restructure core tests to mirror src` |
| **`docs`** | Documentation only changes | `docs(conventions): add git conventions guide` |
| **`ci`** | Changes to CI configuration files and scripts | `ci: refactor setup flow to use composite actions` |
| **`chore`** | Other changes that don't modify src or test files | `chore: upgrade vitest version to 1.2.0` |
| **`style`** | Changes that do not affect the meaning of the code | `style: run biome formatter across core package` |

---

### Scopes

The `scope` identifies the specific area of the monorepo affected by the change. It is usually one of the packages, but can be omitted or set to `root` for project-wide configuration.

- **`core`**: Changes related to `packages/core` (reactive engine: Atoms, Computeds, Effects).
- **`jquery`**: Changes related to `packages/jquery` (jQuery bindings).
- **`utils`**: Changes related to `packages/utils` (Option, Result primitives).
- **`configs`**: Changes related to `packages/configs` (shared build and test setups).
- **`root`** (or omitted): Global project configurations (e.g., workspaces, root-level package scripts).

---

### Subject Line Rules

1. **Use the Imperative Mood**: Write the subject as if you are commanding someone.
   - **Correct**: `fix(core): prevent duplicate dependency registration`
   - **Incorrect**: `fixed duplicate dependency registration` or `fixing duplicate dependency registration`
2. **First Letter Lowercase**: Start the subject with a lowercase letter.
3. **No Period**: Do not place a period at the end of the subject.

---

### Body and Footers (Optional)

- **Body**: Use the body to explain the *what* and *why* of the change, not the *how*.
- **Breaking Changes**: Must be declared in the footer or by appending a `!` after the type/scope.

  ```text
  refactor(core)!: drop support for Node 16

  BREAKING CHANGE: The core package now requires Node 18 or higher.
  ```

---

## 2. Branch Naming Conventions

Branches must follow a structured naming pattern that aligns with our commit types.

### Format

```text
<type>/<kebab-case-summary>
```

- **`<type>`**: Must match one of the valid commit types (e.g., `feat`, `fix`, `refactor`, `test`, `docs`, `ci`, `chore`).
- **`<kebab-case-summary>`**: A short, descriptive summary of the branch's purpose, written in kebab-case (all lowercase, words separated by hyphens).

### Examples

- `feat/atom-map-implementation`
- `fix/jquery-xss-sanitize`
- `refactor/core-scheduler`
- `test/configs-vitest-setup`
- `docs/git-naming-conventions`

> [!TIP]
> Avoid generic branch names like `patch-1`, `dev`, or `my-feature`. A well-named branch allows team members to instantly understand the scope and intent of the branch.

---

## 3. Pull Request (PR) and Merge Strategy

To maintain a clean and linear history on the main branch, we enforce specific PR and merge guidelines.

### Merge Strategy

- We use **Squash and Merge** as the primary merge strategy.
- All commits in a PR will be squashed into a single, cohesive commit when merging.
- **PR Title**: The PR title itself must follow the **Commit Message Conventions** (e.g., `feat(core): implement batched effects`), as it will become the final squash commit header on the `main` branch.

### Pull Request Description Template

When opening a PR, please structure the description as follows:

```markdown
## Why (Background)
Describe the problem you are solving, or the context behind this change.

## What (Implementation Details)
Summarize the code changes. Highlight key design decisions or refactorings.

## Impact & Verification
- What packages are affected?
- How did you test your changes? (e.g., ran Vitest unit tests, verified bundle output, etc.)

## Self-Checklist
- [ ] My code conforms to the project lint rules (`pnpm lint` passes).
- [ ] All unit tests pass locally (`pnpm test` passes).
- [ ] TypeScript compiles without errors (`pnpm typecheck` passes).
```

---

## 4. Local Validation Guidelines

Before committing or pushing your changes to the remote repository, you **MUST** verify your code locally. This minimizes CI failures and ensures high code quality.

Run the following commands in the root directory:

1. **Lint/Format Check**:

   ```bash
   pnpm lint
   ```

   *Make sure Biome reports zero errors.*
2. **Type Check**:

   ```bash
   pnpm typecheck
   ```

   *Ensure the TypeScript compiler completes with no diagnostics errors.*
3. **Run Unit Tests**:

   ```bash
   pnpm test
   ```

   *All tests across packages must pass.*
