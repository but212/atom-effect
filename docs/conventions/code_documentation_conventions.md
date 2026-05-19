# Code Documentation Conventions

This document outlines the conventions for TSDoc and inline comments within the `atom-effect` project. These rules prioritize maintainability, clarity of intent, and a high-quality experience for both external users and internal contributors.

## Core Philosophy

1. **Audience Segmentation**:
    * **User (API Consumer)**: Targets for Public TSDoc. Focus on usage, examples, and safety.
    * **Contributor (Developer)**: Targets for Inline Comments. Focus on design intent, "why" decisions, and maintenance constraints.
2. **Document the "Why" and "When"**: Code shows *what* it does. Comments must explain *why* a particular approach was taken and *when* the code should (or should not) be used.
3. **The 3-Second Rule**: A reader should grasp the core intent or constraint within 3 seconds. Use structured tags and concise language.
4. **Neutrality & Technical Precision**: Avoid promotional, subjective, or anthropomorphic language. Use passive voice and objective technical terms (e.g., "Orchestrates synchronization" instead of "Magically handles updates").

---

## Tone & Diction

To maintain a professional and consistent standard, follow these diction rules:

| Avoid (Subjective/Informal) | Use (Neutral/Technical) |
| :--- | :--- |
| Easy, Simple, Magic | Deterministic, Automatic, Logic-driven |
| Fast, Speedy | Optimized, High-performance, Low-overhead |
| Remembers, Thinks | Persists, Caches, Tracks |
| Makes sure, Ensures | Enforces, Validates, Synchronizes |
| Great way to... | Recommended for..., When to use:... |

---

## Module-Level Documentation

Every file (module) **MUST** begin with a `@module` header. This provides context for the entire file and helps with automated documentation generation.

```typescript
/**
 * @module [Module_Name]
 *
 * Responsibility:
 * [One or two sentences describing the module's core purpose and scope.]
 *
 * Design Intent:
 * [Optional: High-level architectural reasoning or design philosophy for the module.]
 */
```

---

## TSDoc Patterns (For Users)

### 1. Public API (Functions/Classes/Interfaces)

All public-facing APIs **MUST** include TSDoc.

```typescript
/**
 * [One-line summary of role]
 * 
 * When to use:
 * - [Required Scenario 1: Guide the user on when this tool is appropriate]
 * 
 * @param [name] [Required if type alone doesn't convey intent or valid range]
 * 
 * @returns [Required if non-obvious] Description of return value and its meaning.
 * 
 * @throws {ErrorType} [Required if applicable] Description of when this is thrown.
 * 
 * @example [Required - Standalone & Runnable]
 * const source = atom(0);
 * $.effect(() => console.log(source.value));
 */
```

### 2. Polymorphic & Reactive Inputs

When a parameter accepts multiple forms (e.g., literal, atom, or getter), explicitly document the polymorphic behavior.

```typescript
/**
 * Logic: Polymorphic Input
 * Supports raw values for static initialization, reactive atoms for 
 * state-driven updates, or functional getters for deferred execution.
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);
```

### 3. @internal vs @public

* **`@public`**: Available to end-users. Requires full TSDoc and `@example`.
* **`@internal`**: Used for cross-module members that are NOT part of the public API. Should still have TSDoc explaining its role to other contributors, but does not require `@example`.
  * **Constraint (Types):** Do NOT use `@internal` for types (interfaces, type aliases) that are referenced by any `@public` members. This causes bundling failures (leaked internal types) and broken declaration files (`.d.ts`). Such types must be `@public` to ensure the integrity of the distributed package.

### 4. @deprecated Policy

Deprecation is a critical communication tool for users. Always include:

* **since**: The version where it was first deprecated.
* **Removal Version**: State when it will be removed (usually the next Major version).
* **Migration Path**: Provide the name of the replacement API or a link to a migration guide.

```typescript
/**
 * @deprecated since v2.3.0 — use `atomMap` instead.
 * Will be removed in v3.0.0.
 * Migration Guide: https://github.com/but212/atom-effect/wiki/Migration-v3
 */
```

---

## Inline Comment Conventions (For Contributors)

Use specialized prefixes to categorize maintenance information. These can be used in JSDoc blocks for internal members or as single-line comments.

* **`Why:`**: Explains the rationale behind a specific value, constant, or design choice (e.g., "Why 31 bits?").
* **`Logic:`**: Explains the *intent* or implementation mechanics behind complex transitions, bitmasking, or non-linear branching.
* **`Optimization:`**: Explains performance-related complexity, monomorphic access patterns, batching strategies, or diffing algorithms.
* **`Reason:`**: Explains why a particular (perhaps non-obvious) approach was taken or why a simpler approach was discarded.
* **`Constraint:`**: Documents hard requirements or limits (e.g., "Must be called before removal", "Max depth is 8").
* **`Caution:`**: Highlights fragile code prone to regressions, tricky side effects, or potential "glitches".
* **`Security:`**: **(Required)** Documents mechanisms for XSS mitigation, DOM Clobbering prevention, or sensitive data handling.
* **`Role:`**: Defines the purpose of an interface or class in the broader system architecture.
* **`Impact:`**: Describes the consequences or side effects of a configuration flag or constant.

---

## Lifecycle & Concurrency Standards

For operations involving asynchronous logic or DOM lifecycles, you must document:

1. **Cleanup Mechanism**: How resources (timers, observers, listeners) are released.
2. **Concurrency Control**: How "out-of-order" responses or race conditions are handled (e.g., `AbortController`, version tracking).
3. **Teardown Order**: If the sequence of destruction matters.

```typescript
/**
 * Logic: Concurrency Control
 * Uses AbortController to ensure that only the result of the most recent 
 * request is reflected in the state, discarding stale responses.
 */
```

---

## TODO & FIXME Standards

* **Issue Tracking**: Every TODO or FIXME must reference an issue number or a specific owner.
* **Resolution Condition**: State *what* must happen for the tag to be removed, rather than just a date.

```typescript
// TODO(#123): Remove this fallback once Node 18 support is dropped.
// FIXME(@username): This race condition occurs only during high-frequency updates.
```

---

## What NOT to Document

* **Redundant summaries**: Translating a descriptive function name into a comment.
* **Implementation blow-by-blow**: "Step 1: Loop, Step 2: Push". Let the code speak.
* **No-Audience comments**: Notes that won't make sense to anyone in 3 months.

---

## Quality Checklists

### For Authors (Before PR)

* [ ] Are all Public APIs documented with an `@example`?
* [ ] Is the tone neutral and technical? (No "magic", "easy", etc.)
* [ ] Did I use `Security:` tags for any XSS-related logic?
* [ ] Is the concurrency/cleanup logic explained for async operations?
* [ ] Did I document polymorphic inputs (Logic: Polymorphic Input)?
* [ ] Does `@deprecated` include the 'since' version and a migration path?

### For Reviewers (During PR)

* [ ] Is the information placed in the correct layer (User TSDoc vs Contributor Inline)?
* [ ] Does every TODO/FIXME have an issue reference or owner?
* [ ] Is the TSDoc consistent with the current implementation's behavior?
* [ ] Are `Security:` and `Optimization:` tags used where appropriate?
* [ ] Is the `@example` snippet accurate and standalone?
