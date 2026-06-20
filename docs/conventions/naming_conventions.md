# Naming Conventions

This document outlines the conventions for naming variables, functions, classes, and properties within the `atom-effect` project. These rules ensure that identifiers clearly convey their role, type, state, and domain context, maintaining a highly readable and self-documenting codebase.

---

## Core Naming Principles

1. **Intention Clarification**:
   - **Variables/Properties**: Must use nouns or noun phrases representing what the data is and why it exists.
   - **Functions/Methods**: Must use verbs or verb phrases representing the action or operation being performed.
2. **Appropriate Length**:
   - Avoid unclear abbreviations (e.g., `usr`, `cfg`, `msg`, `arr`, `fn`).
   - Remove redundant terms that can be inferred from the surrounding context (e.g., `user.name` instead of `user.userDataName`).
3. **Reflect Types & Roles**:
   - Use plural names for collections and singular names for single values.
   - Append structural suffixes (e.g., `Buffer`, `Set`, `Map`, `Count`, `Index`, `Limit`) when the underlying collection type or numeric role is critical to correctness.
4. **Scope & Language Standards**:
   - **JavaScript/TypeScript**: Private class fields and methods must use `#name` syntax in Camel Case.

---

## Naming by Data Types & Patterns

### 1. Booleans

Always prefix boolean variables, class properties, and functions returning booleans with a state-revealing verb (`is`, `has`, `can`, `should`) so they read as true/false statements.

| Pattern | Context | Examples |
| :--- | :--- | :--- |
| `is[State]` | Indicates a current status or condition. | `isSessionActive`, `isFlushStarted`, `isDisposed` |
| `has[Property]` | Indicates ownership of a value or resource. | `hasError`, `hasActiveListeners` |
| `can[Action]` | Indicates permission or capability. | `canSchedule`, `canRetry` |
| `should[Action]` | Indicates a requirement or conditional execution. | `shouldFlushSync`, `shouldDispose` |

### 2. Numbers & Metrics

Specify units and domain boundaries directly in the variable name when the numeric value represents a unit of measurement.

| Domain / Unit | Suffix | Example |
| :--- | :--- | :--- |
| Time | `_ms`, `_seconds` | `timeoutMs`, `delaySeconds` |
| Size / Capacity | `Count`, `Limit`, `Size` | `activeJobsCount`, `iterationsLimit`, `queueSize` |
| Monotonic Progress | `Epoch`, `Depth` | `currentEpoch`, `batchDepth` |

### 3. Collections & Buffers

Clearly differentiate between a single item, a list of items, and a structured buffer memory space.

- **Single Item**: `job`, `listener`, `subscriber`
- **Array / Iterable**: `activeJobs`, `listeners`, `subscribers`
- **Buffer / Queue Structure**: `activeJobBuffer`, `standbyJobBuffer`

### 4. Data Processing & Conversions

When data passes through stages of mapping, filtration, or normalization, include the processing state in the variable name.

- **Raw Input**: `rawOptions`, `rawCallback`
- **Processed / Sanitized**: `sanitizedHtml`, `normalizedPath`
- **Computed / Derived**: `filteredItems`, `sortedJobs`

---

## Prohibited Patterns

Avoid the following patterns unless there is an exceptional and well-justified reason:

| Category | Prohibited Pattern | Bad Example | Good Example |
| :--- | :--- | :--- | :--- |
| **Meaningless Names** | Generics with no context | `data`, `value`, `item`, `obj`, `temp`, `tmp`, `result` | `schedulerJob`, `executionResult` |
| **Ambiguous Actions** | Generic verbs | `doThing()`, `handleStuff()`, `processData()` | `drainQueue()`, `processQueue()` |
| **Abstract Roles** | Vague class/utility names | `flag`, `check`, `manager`, `util` | `isSyncFlushing`, `trackingContext` |
| **Unclear Abbreviations** | Non-standard abbreviations | `usr`, `cfg`, `msg`, `arr`, `fn` | `user`, `config`, `message`, `array`, `callback` |

---

## Quick Reference Comparison

Here is a summary of the improvements applied to the reactive scheduler to serve as a guide:

| Category | Bad / Legacy Name | Improved Name | Naming Principle Applied |
| :--- | :--- | :--- | :--- |
| **Private Field** | `#sessionActive` | `#isSessionActive` | Boolean prefixing (`is`) |
| **Private Buffer** | `#active`, `#standby` | `#activeJobBuffer`, `#standbyJobBuffer` | Reflecting role and data structure (`Buffer`) |
| **Callback** | `#onOverflow` | `#onOverflowCallback` | Clarifying execution role |
| **Helper Params** | `v: number` | `iterations: number`, `iterationsLimit` | Intention clarification |
| **Local Count** | `iterations` | `flushIterationCount` | Context and type specificity |
| **Generic Items** | `jobs` | `activeJobs` | Specific context addition |
| **Abbreviations** | `fn`, `res`, `err`, `e` | `callback`/`functionKind`, `result`, `error` | Eliminating generic/unclear abbreviations |

---

## Quality Checklists

### For Authors (Before PR)

- [ ] Are all boolean variables prefixed with `is`, `has`, `can`, or `should`?
- [ ] Have I avoided arbitrary single-letter variables (e.g. `v`, `e`, `t`) except for standard loop indices (e.g. `i`, `j`)?
- [ ] Are numeric units explicitly documented in the variable name (e.g. `timeoutMs`)?
- [ ] Do private class fields use the `#` prefix with camelCase naming?
- [ ] Are list variables named using plural nouns?

### For Reviewers (During PR)

- [ ] Does the name of every variable or function clearly explain *what* it is or *what* it does without reading its implementation?
- [ ] Are there any prohibited generic words like `data`, `value`, `tmp` in use?
- [ ] If a variable holds processed data, is the transition stage (e.g., `normalized`, `sanitized`) reflected?
