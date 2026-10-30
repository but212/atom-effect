/**
 * @module AEJGlobalDefinitions
 *
 * Responsibility:
 * Extends the global JQuery and JQueryStatic interfaces with reactive binding
 * capabilities, lifecycle management hooks, and diagnostic utilities.
 *
 * Design Intent:
 * Provides the definitive type system for the `atom-effect-jquery` library,
 * ensuring seamless IDE support and type safety for both core reactive
 * primitives and DOM-bound extensions.
 */

import type {
  ComputedAtom,
  ComputedOptions,
  EffectFunction,
  EffectObject,
  EffectOptions,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';
import type {
  AEJConfig,
  AsyncReactiveValue,
  AtomOptions,
  BindingOptions,
  ComponentFn,
  CssBindings,
  CssValue,
  FormOptions,
  ListOptions,
  PrimitiveValue,
  ValOptions,
} from './types';

declare global {
  interface Window {
    $: JQueryStatic;
    jQuery: JQueryStatic;
  }

  /**
   * Extensions to the global jQuery object ($).
   *
   * @public
   */
  interface JQueryStatic {
    /**
     * Creates a reactive atom to manage mutable state.
     *
     * When to use:
     * - As the primary source of truth for local or shared application state.
     * - When data needs to be manually updated via the `.value` property.
     *
     * @param initialValue The starting value of the atom.
     * @param options Configuration for custom equality logic or delivery strategy.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     *
     * // Subscribing to changes
     * count.subscribe((next, prev) => console.log(`${prev} -> ${next}`));
     *
     * // Updating value
     * count.value += 1; // Logs: "0 -> 1"
     * ```
     */
    atom<T>(initialValue: T, options?: AtomOptions<T>): WritableAtom<T>;
    /**
     * Creates an asynchronous reactive computation.
     *
     * When to use:
     * - For logic involving fetch, database queries, or long-running tasks.
     *
     * Attention:
     * A `defaultValue` is mandatory for async computations to provide a valid
     * state while the Promise is PENDING.
     */
    computed<T>(
      computationCallback: () => Promise<T>,
      options: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    /**
     * Creates an asynchronous reactive computation without a default value.
     */
    computed<T>(
      computationCallback: () => Promise<T>,
      options?: ComputedOptions<T>
    ): ComputedAtom<T>;
    /**
     * Creates a reactive computation derived from other atoms or computed nodes.
     *
     * When to use:
     * - To define values that automatically update when their dependencies change.
     * - To optimize performance through caching of expensive calculations.
     * - To transform or aggregate raw state for UI presentation.
     *
     * @param computationCallback The computation function.
     * @param options Configuration for custom equality checks or error handlers.
     *
     * @example
     * ```typescript
     * const count = $.atom(1);
     * const doubled = $.computed(() => count.value * 2);
     *
     * console.log(doubled.value); // 2
     * count.value = 5;
     * console.log(doubled.value); // 10
     * ```
     */
    computed<T>(
      computationCallback: () => T extends Promise<unknown> ? never : T,
      options?: ComputedOptions<T>
    ): ComputedAtom<T>;
    /**
     * Creates a reactive side-effect that synchronizes state with external systems.
     *
     * When to use:
     * - To update the DOM or integrate with third-party libraries.
     * - To perform logging, monitoring, or diagnostic tasks.
     * - To manage timers, network requests, or global subscriptions.
     *
     * @param effectCallback The function to execute. Can return a synchronous or asynchronous cleanup handle.
     * @param options Configuration for execution limits, custom error handlers, and sync delivery.
     * @returns An `EffectObject` used to manually trigger or stop the effect.
     *
     * @throws {EffectError} If the provided `effectCallback` is not a function.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     *
     * // Automatically logs whenever 'count' changes
     * const subscribe = $.effect(() => {
     *   console.log('Value:', count.value);
     *
     *   // Optional teardown called before the next run or on disposal
     *   return () => console.log('Cleaning up...');
     * });
     *
     * count.value++; // Logs: "Value: 1"
     * subscribe.dispose(); // Stops the effect
     * ```
     */
    effect(effectCallback: EffectFunction, options?: EffectOptions): EffectObject;
    /**
     * Logic: Atomic Update Batching
     * Groups multiple state updates into a single atomic change cycle.
     *
     * When to use:
     * - When performing multiple related updates to different atoms.
     * - To prevent intermediate re-computations or redundant effect executions.
     *
     * @param fn The function containing multiple state updates.
     * @returns The value returned by the provided function.
     *
     * @example
     * ```typescript
     * const firstName = $.atom('John');
     * const lastName = $.atom('Doe');
     *
     * $.effect(() => console.log(`Full name: ${firstName.value} ${lastName.value}`));
     *
     * // Without batch, the effect would run twice.
     * $.batch(() => {
     *   firstName.value = 'Jane';
     *   lastName.value = 'Smith';
     * }); // Effect runs once here.
     * ```
     */
    batch<T>(fn: () => T): T;
    /**
     * Determines whether a value is a ReadonlyAtom.
     *
     * When to use:
     * - To validate user input in APIs that expect reactive atoms.
     * - To differentiate between raw values and reactive containers.
     *
     * @example
     * ```typescript
     * if ($.isAtom(maybeAtom)) {
     *   console.log(maybeAtom.value);
     * }
     * ```
     */
    isAtom(obj: unknown): obj is WritableAtom<unknown> | ReadonlyAtom<unknown>;
    /**
     * Determines whether a value is a Promise or a Thenable.
     *
     * When to use:
     * - When you need to handle potentially asynchronous values from third-party
     *   libraries that might not use native Promises.
     *
     * Logic:
     * - Implements a tiered detection strategy. It prioritizes native `Promise`
     *   performance via `instanceof` before falling back to duck-typed thenable
     *   identification for Promises/A+ compatibility.
     *
     * @example
     * if ($.isPromise(value)) {
     *   value.then(result => console.log(result));
     * }
     */
    isPromise<T = unknown>(value: unknown): value is PromiseLike<T>;
    /**
     * Logic: Asynchronous Update Synchronization
     * Returns a promise that resolves after the next reactive update cycle.
     *
     * When to use:
     * - Perform manual DOM measurements after reactive changes.
     * - Coordinate external library initializations dependent on current DOM state.
     */
    nextTick(): Promise<void>;

    /**
     * Global diagnostic system for inspecting reactive behavior.
     *
     * When to use:
     * - Debugging reactive updates and DOM mutations in real-time.
     * - Inspecting error causes and call stacks in binding hooks.
     *
     * Logic: Runtime Control
     * Toggle `debug.enabled` at runtime (e.g., via the browser console) to
     * activate visual instrumentation without requiring a page reload.
     *
     * @example
     * ```typescript
     * $.debug.enabled = true; // Activate visual highlights
     * ```
     *
     * @public
     */
    debug: {
      /** Whether diagnostic logging and visual highlighting are active. */
      enabled: boolean;
      /** Logs a diagnostic warning message. */
      warn(prefix: string, message: string, ...rest: unknown[]): void;
      /** Logs a diagnostic error and its cause. */
      error(prefix: string, message: string, cause: unknown): void;
      /** Logs a DOM mutation and triggers a visual highlight on the target. */
      domUpdated(prefix: string, target: Element | JQuery, type: string, value: unknown): void;
    };

    /**
     * Role: Library Orchestrator
     * Initializes Atom-Effect jQuery with the specified configuration.
     *
     * When to use:
     * - At the application entry point to configure global reactive behavior.
     * - During runtime to toggle debugging or change auto-cleanup roots.
     *
     * Caution: Memory Leaks
     * If both `patch` and `autoCleanup` are disabled, the engine cannot track
     * DOM removal. You MUST call `cleanup(element)` manually to prevent
     * memory leaks.
     *
     * @param config Configuration options for patches and cleanup safety nets.
     *
     * @example
     * ```typescript
     * import { initAEJ } from '@but212/atom-effect-jquery';
     *
     * initAEJ({
     *   patch: true,
     *   autoCleanup: { root: document.getElementById('app') }
     * });
     * ```
     */
    initAEJ(config?: AEJConfig): void;
  }

  /**
   * Extensions to the jQuery instance object (fn).
   *
   * @public
   */
  interface JQuery<TElement = HTMLElement> {
    /**
     * Binds the text content of elements to a reactive source.
     *
     * When to use:
     * - Recommended for label synchronization, counters, or status messages.
     * - Suitable for displaying formatted strings derived from reactive data.
     *
     * @param source The reactive atom or computed value.
     * @param formatter Optional function to transform the value into a string.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.count-display').atomText(counterAtom, (value) => `Total: ${value}`);
     * ```
     */
    atomText<T>(source: AsyncReactiveValue<T>, format?: (value: T) => string): this;
    /**
     * Binds the HTML content of elements to a reactive source.
     *
     * Security: XSS Prevention
     * Ensure the source data is trusted. Rendering unsanitized HTML from user
     * input can lead to XSS vulnerabilities.
     *
     * When to use:
     * - Recommended for rendering complex markup or rich text with formatting tags.
     *
     * @param source The reactive atom containing the HTML string.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.content').atomHtml(htmlAtom);
     * ```
     */
    atomHtml(source: AsyncReactiveValue<string>): this;
    /**
     * Binds CSS classes to reactive conditions.
     *
     * When to use:
     * - Recommended for toggling stateful classes (e.g., 'is-active', 'is-loading').
     * - Suitable for managing complex UI states defined by multiple simultaneous flags.
     *
     * Logic: Class Toggling
     * Supports both toggling a single class based on a condition and managing
     * multiple classes through a mapping object.
     *
     * @param classNameOrMap A class name string or a map of `{ className: conditionAtom }`.
     * @param condition The condition for the class (required if `classNameOrMap` is a string).
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.tab').atomClass('active', activeAtom);
     * ```
     */
    atomClass(classNameOrMap: string, condition: AsyncReactiveValue<boolean>): this;
    atomClass(classNameOrMap: Record<string, AsyncReactiveValue<boolean>>): this;
    /**
     * Binds inline CSS properties to reactive sources.
     *
     * Logic: Unit Support
     * Standardizes property values with optional units (e.g., 'px', 'em')
     * before applying them to the element's style.
     *
     * @param propOrMap A CSS property name or a binding map.
     * @param source The reactive atom providing the value.
     * @param unit Optional unit suffix (e.g., 'px').
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.box').atomCss('width', widthAtom, 'px');
     * ```
     */
    atomCss(propOrMap: string, source: CssValue, unit?: string): this;
    atomCss(propOrMap: CssBindings): this;
    /**
     * Binds HTML attributes to reactive sources.
     *
     * @example
     * ```typescript
     * $('.link').atomAttr('href', urlAtom);
     * ```
     */
    atomAttr(nameOrMap: string, source: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(nameOrMap: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    /**
     * Binds DOM properties directly to reactive sources.
     *
     * @example
     * ```typescript
     * $('.input').atomProp('disabled', disabledAtom);
     * ```
     */
    atomProp<T>(nameOrMap: string, source: AsyncReactiveValue<T>): this;
    atomProp(nameOrMap: Record<string, AsyncReactiveValue<unknown>>): this;
    /**
     * Controls the visibility of elements based on a reactive condition.
     *
     * When to use:
     * - Recommended for conditional rendering where the element should be
     *   visible when the condition is truthy.
     *
     * @param condition The reactive condition governing visibility.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.modal').atomShow(isOpenAtom);
     * ```
     */
    atomShow(condition: AsyncReactiveValue<boolean>): this;
    /**
     * Controls the invisibility of elements based on a reactive condition.
     *
     * When to use:
     * - Recommended for conditional rendering where the element should be
     *   hidden when the condition is truthy.
     *
     * @param condition The reactive condition governing invisibility.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.overlay').atomHide(isLoadedAtom);
     * ```
     */
    atomHide(condition: AsyncReactiveValue<boolean>): this;

    /**
     * Performs two-way binding for form input values.
     *
     * When to use:
     * - Recommended for text inputs, textareas, and select menus.
     *
     * Logic: Two-Way Sync
     * Synchronizes the input's `value` with a writable atom, handling both
     * atom-to-DOM updates and DOM-to-atom changes (via `input` or `change` events).
     *
     * @param atom The writable atom to synchronize with the input value.
     * @param options Configuration for debouncing or event triggers.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.search-input').atomVal(queryAtom, { debounce: 300 });
     * ```
     */
    atomVal<T>(atom: WritableAtom<T>, options?: ValOptions<T>): this;

    /**
     * Performs two-way binding for checkbox and radio button checked states.
     *
     * @param atom The writable atom to synchronize with the checked state.
     * @returns The original jQuery collection for chaining.
     */
    atomChecked(atom: WritableAtom<boolean>): this;

    /**
     * Orchestrates two-way binding for an entire form element.
     *
     * When to use:
     * - Recommended for synchronizing complex data models with HTML forms.
     *
     * Logic: Field Mapping
     * Maps form fields (via `name` attributes) to nested properties within a
     * reactive object atom using structural lenses.
     *
     * @param atom The writable atom containing the form's data model.
     * @param options Configuration for validation or submission handling.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('form').atomForm(userProfileAtom);
     * ```
     */
    atomForm<T extends object>(
      atom: WritableAtom<T> | WritableAtom<unknown>[],
      options?: FormOptions<T>
    ): this;

    /**
     * Binds a reactive event listener to elements.
     *
     * @param event The name of the DOM event.
     * @param handler The event handler function.
     * @returns The original jQuery collection for chaining.
     */
    atomOn(event: string, handler: (event: JQuery.Event) => void): this;

    /**
     * A unified entry point for declaring multiple reactive bindings in a single call.
     *
     * When to use:
     * - Recommended for efficiently initializing multiple bindings on an element.
     * - Suitable for maintaining organized declarations in complex UIs.
     *
     * Logic: Task Orchestration
     * Iterates through the provided configuration and executes the corresponding
     * binding tasks in a predefined, deterministic order.
     *
     * @param options A configuration object defining multiple bindings.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.submit-btn').atomBind({
     *   text: labelAtom,
     *   class: { 'is-loading': loadingAtom },
     *   on: { click: handleSubmit }
     * });
     * ```
     */
    atomBind<T = unknown, TText = unknown>(options: BindingOptions<T, TText>): this;

    /**
     * Synchronizes an element's children with a reactive list source.
     *
     * When to use:
     * - Recommended for rendering dynamic collections with high-performance O(N) updates.
     * - Suitable for lists requiring complex item templates or delegated event handling.
     *
     * @param source The reactive atom containing the array of items.
     * @param options Configuration for rendering, identification, and lifecycle hooks.
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('#todo-list').atomList(todosAtom, {
     *   key: 'id',
     *   render: (todo) => `<li class="item">${todo.text}</li>`,
     *   events: {
     *     'click .remove': (todo, index, e) => removeTodo(todo.id)
     *   }
     * });
     * ```
     */
    atomList<T>(source: ReadonlyAtom<T[]>, options: ListOptions<T>): this;

    /**
     * Logic: Component Lifecycle Orchestration
     * Initializes and mounts a reactive UI component onto a jQuery collection.
     *
     * When to use:
     * - Initialize complex UI modules with internal reactive effects or listeners.
     * - Build reusable "Logic Units" that require dedicated cleanup phases.
     *
     * Lifecycle: Execution Pipeline
     * 1. Cleanup: Existing reactive bindings on the target are destroyed to prevent conflicts.
     * 2. Isolation: Component executes within `untracked` and `batch` scopes to prevent
     *    dependency leaks to/from the parent context.
     * 3. Registration: Teardown hooks are registered for automatic execution on DOM removal.
     *
     * @example
     * ```typescript
     * // 1. Define a component
     * const MyCounter = ($element, props) => {
     *   const count = $.atom(0);
     *   const fx = $.effect(() => $element.text(`${props.title}: ${count.value}`));
     *   return () => fx.dispose(); // Teardown hook
     * };
     *
     * // 2. Mount onto a collection
     * $('.counter-host').atomMount(MyCounter, { title: 'Click Count' });
     * ```
     */
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    /**
     * Logic: Manual Resource Teardown
     * Explicitly triggers unmounting and resource cleanup for elements in the collection.
     *
     * When to use:
     * - When you need to manually destroy a component before its host element is removed.
     */
    atomUnmount(): this;

    /**
     * Removes all reactive bindings and cleans up resources.
     *
     * Caution: Teardown Order
     * This method should be called when elements are permanently removed from
     * the DOM to prevent memory leaks from active effects.
     *
     * @returns The original jQuery collection for chaining.
     *
     * @example
     * ```typescript
     * $('.list-item').atomUnbind().remove();
     * ```
     */
    atomUnbind(): this;
  }
}
