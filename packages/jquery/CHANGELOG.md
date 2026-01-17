# Changelog

## [0.6.1]

### Fixed

- **atomBind val Feature Parity**: `atomBind({ val })` now has full feature parity with standalone `$.fn.atomVal`.
  - Added focus tracking to prevent DOM updates from interrupting user input (fixes decimal input issue like `1.`)
  - Added support for `parse`, `format`, `debounce`, and `event` options via tuple syntax: `val: [atom, options]`
  - Added blur formatting to ensure clean display when input loses focus

## [0.6.0]

### Fixed - 0.6.0

- **DOM Reparenting Cleanup Issue**: Added `isConnected` check in `MutationObserver` to prevent cleanup of nodes that have been reparented (moved) via jQuery's `.appendTo()`, `.prependTo()`, etc. This is critical for drag-and-drop (Sortable) libraries.
- **Async Removal Ghost Item Bug**: Added `removingKeys` Set in `atomList` to track keys being removed asynchronously. Prevents duplicate item creation when the same key is re-added during async removal animation (e.g., fade-out).
- **Decimal Input Issue**: Added focus-aware formatting in `atomVal` to allow intermediate input like `1.` or `00` during typing. Formatting is enforced on blur.

### Changed - 0.6.0

- **Input Binding State Management**
  - Replaced scattered boolean flags in `atomVal` with unified `InputBindingState` interface
  - Explicit phase transitions: `idle` → `composing` → `syncing-to-atom` → `syncing-to-dom`

- **atomBind Modularization**
  - Split monolithic 230-line function into focused handlers
  - New handlers: `bindText`, `bindHtml`, `bindClass`, `bindCss`, `bindAttr`, `bindProp`, `bindShow`, `bindHide`, `bindVal`, `bindChecked`, `bindEvents`
  - Introduced `BindingContext` type for shared state

- **Code Cleanup**
  - Unified duplicate `getSelector` functions (utils.ts + debug.ts)
  - Added `CssValue`, `CssBindings` named types
  - Reduced non-null assertions in `list.ts` with proper type guards

## [0.5.0]

### Changed - 0.5.0

- **Version Bump**: Bumped version to 0.5.0

## [0.4.0]

### Added - 0.4.0

- **Async Computed Type Support**: Added TypeScript overload for `$.computed()` to properly infer types when using async functions with `defaultValue`.

  ```typescript
  // Now correctly infers ComputedAtom<User> instead of ComputedAtom<Promise<User>>
  const userData = $.computed(
    async () => await fetchUser(userId.value),
    { defaultValue: { id: 0, name: '' } }
  );
  ```

- **Async Computed Tests**: Comprehensive test suite for async computed patterns including:
  - `isPending`, `hasError`, `isResolved` state tracking
  - Dependency change re-computation
  - Debounced search pattern
  - Error handling with `lastError`
- **Async Data Fetching Example**: New standalone HTML example demonstrating React Query-like data fetching patterns.

- **Async Computed Example**: New standalone HTML example demonstrating async computed patterns.

### Changed - 0.4.0

- **`ListOptions.render` Return Type**: Now accepts `string | Element`, enabling type-safe SVG element creation via `createElementNS()`.
- **Keyed Diffing Test Optimization**: Replaced O(n²) `find()` lookup with O(1) `Map` lookup.

## [0.3.0] - 2026-01-15

### Added - 0.3.0

- **Smart Reconciliation (Keyed Diffing)**:
  - Implemented Keyed Diffing for `.atomList()` using the LIS (Longest Increasing Subsequence) algorithm.
  - Minimizes DOM movements and re-insertions, preserving element state (like focus) and improving performance.
  - Elements are now properly reused when moving in the list, rather than destroyed and recreated.

## [0.2.1] - 2026-01-15

### Fixed - 0.2.1

- **Initialization Loophole**: Moved `enablejQueryOverrides()` to execute immediately upon import instead of waiting for DOM ready. This ensures jQuery methods are safe to use even in early scripts.

## [0.2.0] - 2026-01-15

### Added - 0.2.0

- **Transparent Lifecycle Management**:
  - Overrode jQuery's `.remove()`, `.empty()`, and `.detach()` to handle atom bindings automatically.
  - `.remove()` / `.empty()`: Instantly cleans up bindings to prevent memory leaks.
  - `.detach()`: Preserves bindings (prevents auto-cleanup), so elements remain reactive when re-attached.
- **Registry & Safety**:
  - Added `preservedNodes` logic to the binding registry to support temporary detachment.
  - `enablejQueryOverrides()` is now enabled by default on import.

## [0.1.1] - 2026-01-15

### Added - 0.1.1

- **Example**: Add basic example page.

### Changed - 0.1.1

- **Debug Utility**: Resolved race conditions and style pollution in `highlightElement`.
  - Implemented timer cleanup to prevent overlapping highlight effects.
  - Enhanced original style preservation using data attributes to ensure styles aren't overwritten by highlight colors.
  - Added smooth CSS transitions for recovery and automated cleanup of temporary metadata.

## [0.1.0] - 2026-01-15

### Added - 0.1.0

- **Core Integration**: Initial release of `atom-effect-jquery`, providing reactive bindings for jQuery using `@but212/atom-effect`.
- **Static Methods**: Extends jQuery with core reactive primitives:
  - `$.atom(initialValue)`: Create writable atoms.
  - `$.computed(fn)`: Create derived computed atoms.
  - `$.effect(fn)`: Create side effects.
  - `$.batch(fn)`: Batch multiple updates.
  - `$.nextTick()`: Promise that resolves after the next update cycle.
- **DOM Binding Methods**: Chainable jQuery methods for reactive DOM updates:
  - `.atomText(atom)`: Bind text content.
  - `.atomHtml(atom)`: Bind HTML content.
  - `.atomClass(className, atom)`: Reactive class toggling.
  - `.atomCss(property, atom)`: Reactive CSS property updates.
  - `.atomAttr(attribute, atom)`: Reactive attribute updates.
  - `.atomProp(property, atom)`: Reactive property updates.
  - `.atomShow(atom)` / `.atomHide(atom)`: Reactive visibility toggling.
- **Two-Way Binding**:
  - `.atomVal(atom, options)`: Two-way binding for form inputs with debounce and formatting support.
  - `.atomChecked(atom)`: Two-way binding for checkboxes and radio buttons.
- **Unified Binding**: `.atomBind(bindings)` method to set multiple bindings (text, class, css, events) in a single call.
- **List Rendering**: `.atomList(atom, config)` for efficient array rendering with keyed diffing.
- **Component System**: `.atomMount(Component, props)` to mount functional components with lifecycle management.
- **Event Handling**: `.atomOn(event, handler)` for batched event listeners.
- **Automatic Cleanup**: Integrated `MutationObserver` to automatically dispose of effects when elements are removed from the DOM.
- **Debug Mode**: `$.atom.debug = true` to enable console logging and visual highlighting of updates.
- **Performance**: Optional global jQuery event batching via `enablejQueryBatching()`.
