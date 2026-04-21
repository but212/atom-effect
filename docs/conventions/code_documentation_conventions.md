# Code Documentation Conventions

This document outlines the conventions for TSDoc and inline comments within the `atom-effect` project. These rules prioritize maintainability, clarity of intent, and a high-quality experience for both external users and internal contributors.

## Core Philosophy

1. **Audience Segmentation**:
    * **User (API Consumer)**: Targets for Public TSDoc. Focus on usage, examples, and safety.
    * **Contributor (Developer)**: Targets for Inline Comments. Focus on design intent, "why" decisions, and maintenance constraints.
2. **Document the "Why" and "When"**: Code shows *what* it does. Comments must explain *why* a particular approach was taken and *when* the code should (or should not) be used.
3. **The 3-Second Rule**: A reader should grasp the core intent or constraint within 3 seconds. Use structured tags and concise language.
4. **Maintainability**: Avoid documenting implementation details that change frequently. Focus on invariant logic, constraints, and boundaries.

---

## TSDoc Patterns (For Users)

### 1. Public API (Functions/Classes/Interfaces)

All public-facing APIs **MUST** include TSDoc.

```typescript
/**
 * [One-line summary of role]
 * 
 * When to use:
 * - [Required Scenario 1]
 * 
 * @param [name] [Required if type alone doesn't convey intent or valid range]
 * 
 * @returns [Required if non-obvious] Description of return value and its meaning.
 * 
 * @throws {ErrorType} [Required if applicable] Description of when this is thrown.
 * 
 * @example [Required - Standalone & Runnable]
 * const source = atom([1, 2, 3]);
 * atomList(source, { key: (item) => item.id });
 */
```

### 2. @example Requirements

* **Mandatory**: Every public API must have at least one example.
* **Standalone**: Examples must be runnable in isolation. Do not assume internal setup is already present.
* **Copy-Pasteable**: A user should be able to copy the example into their project and see it work.

### 3. @deprecated Policy

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

Use specialized prefixes to categorize maintenance information:

* **`Reason:`**: Explains non-obvious design choices or why a simpler approach was discarded.
* **`Constraint:`**: Documents hard requirements (e.g., "Must be called before removal").
* **`Caution:`**: Highlights fragile code prone to regressions.
* **`Optimization:`**: Explains performance-related complexity.
* **`Logic:`**: Explains the *intent* behind complex state transitions or non-linear branching.
  Use only when the branching logic itself is non-obvious.
  **Do not use** for simple loops or straightforward conditionals.

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
* **No-Audience comments**: Notes that won't make sense to anyone (including your future self) in 3 months.

---

## Quality Checklists

### For Authors (Before PR)

* [ ] Are all Public APIs documented with an `@example`?

* [ ] Is the `@example` standalone and runnable?
* [ ] Did I document `@param` if the type/name doesn't fully convey intent or range?
* [ ] Did I document `@throws` if the code can throw under specific conditions?
* [ ] Does `@deprecated` include the 'since' version and a migration path?
* [ ] If I change the internal logic later, will this comment still be valid? (Avoid "blow-by-blow" logic).

### For Reviewers (During PR)

* [ ] Is the information placed in the correct layer (User TSDoc vs Contributor Inline)?

* [ ] Does every TODO/FIXME have an issue reference or owner and a clear resolution condition?
* [ ] Is the TSDoc consistent with the current implementation's signature and behavior?
* [ ] Are the `@example` snippets accurate and standalone?
* [ ] Are `Logic:` comments used strictly for intent and non-obvious complexity?
