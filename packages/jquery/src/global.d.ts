import type { EffectOptions, Paths, PathValue } from '@but212/atom-effect';
import type {
  AEJConfig,
  AsyncReactiveValue,
  AtomNav,
  AtomNavOptions,
  AtomOptions,
  BindingOptions,
  ComponentFn,
  ComputedAtom,
  ComputedOptions,
  CssBindings,
  Dependency,
  DisposableWritableAtom,
  EffectObject,
  EffectResult,
  FetchOptions,
  FormOptions,
  ListOptions,
  MergedDependencyValue,
  PrimitiveValue,
  ReadonlyAtom,
  RouteConfig,
  Router,
  ValOptions,
  WritableAtom,
} from './types';

declare global {
  var $: JQueryStatic;
  var jQuery: JQueryStatic;

  interface Window {
    $: JQueryStatic;
    jQuery: JQueryStatic;
  }

  interface Document {
    /**
     * Set of constructable stylesheets to be applied to the document.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Document/adoptedStyleSheets
     */
    adoptedStyleSheets: CSSStyleSheet[];
  }

  interface ShadowRoot {
    /**
     * Set of constructable stylesheets to be applied to this shadow root.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/ShadowRoot/adoptedStyleSheets
     */
    adoptedStyleSheets: CSSStyleSheet[];
  }

  interface HTMLElement {
    /**
     * Returns an ElementInternals object that allows the element to participate in form submission,
     * accessibility, and states.
     * @see https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/attachInternals
     */
    attachInternals(): ElementInternals;
  }

  interface ElementInternals extends ARIAMixin {
    /** The ShadowRoot associated with the element. */
    readonly shadowRoot: ShadowRoot | null;
    /** Sets the form value, state, and validity for the element. */
    setFormValue(value: string | FormData | null, state?: string | FormData | null): void;
    /** Sets the validity state of the element. */
    setValidity(flags?: ValidityStateFlags, message?: string, anchor?: HTMLElement): void;
    /** The validation message for the element. */
    readonly validationMessage: string;
    /** The validity state of the element. */
    readonly validity: ValidityState;
    /** Whether the element will be validated. */
    readonly willValidate: boolean;
    /** Checks the validity of the element. */
    checkValidity(): boolean;
    /** Reports the validity of the element. */
    reportValidity(): boolean;
    /** The labels associated with the element. */
    readonly labels: NodeList;
  }

  /**
   * Extensions to the global jQuery object ($).
   *
   * @public
   */
  interface JQueryStatic {
    /**
     * Creates a writable reactive atom.
     *
     * When to use:
     * - When you need a source of truth for a specific piece of application state.
     * - When state needs to be updated manually in response to user actions.
     *
     * @param initialValue - The initial state value.
     * @param options - Configuration for sync mode, custom equality, or naming.
     * @returns A writable reactive atom.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     * console.log(count.value); // 0
     * count.value++;
     * ```
     */
    atom<T>(initialValue: T, options?: AtomOptions): WritableAtom<T>;
    /**
     * Creates a read-only atom that derives its value from other reactive sources.
     *
     * When to use:
     * - When a value needs to be automatically calculated based on other atoms.
     * - To optimize performance by caching expensive derived results.
     *
     * @param fn - The calculation function.
     * @param options - Configuration for custom equality or default values.
     * @returns A read-only reactive computed atom.
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
    computed<T>(fn: () => T, options?: ComputedOptions<T>): ComputedAtom<T>;
    computed<T>(
      fn: () => Promise<T>,
      options: ComputedOptions<T> & { defaultValue: T }
    ): ComputedAtom<T>;
    /**
     * Registers a side effect that automatically re-runs when its dependencies change.
     *
     * When to use:
     * - To perform logging, data fetching, or manual DOM updates in response to state changes.
     * - To synchronize external systems (e.g., local storage) with the reactive state.
     *
     * @param fn - The function to execute. Can return a cleanup callback.
     * @param options - Configuration for sync mode or error handling.
     * @returns A handle for manual control or disposal of the effect.
     *
     * @example
     * ```typescript
     * const count = $.atom(0);
     * $.effect(() => {
     *   console.log(`Current count: ${count.value}`);
     *   return () => console.log('Cleanup before next run');
     * });
     *
     * count.value++; // Logs: "Cleanup before next run", "Current count: 1"
     * ```
     */
    effect(fn: () => EffectResult, options?: EffectOptions): EffectObject;
    /**
     * Executes multiple state updates in a single atomic cycle.
     *
     * When to use:
     * - When performing multiple related atom updates to prevent redundant effect triggers.
     *
     * @param fn - Function containing multiple atom updates.
     *
     * @example
     * ```typescript
     * const a = $.atom(0);
     * const b = $.atom(0);
     * $.effect(() => console.log(a.value + b.value));
     *
     * $.batch(() => {
     *   a.value = 1;
     *   b.value = 2;
     * }); // Logs "3" once.
     * ```
     */
    batch(fn: () => void): void;
    /**
     * Reads a reactive value without creating a dependency relationship.
     *
     * When to use:
     * - To access reactive state inside an effect without causing the effect to re-run.
     *
     * @param fn - Function to execute in untracked mode.
     * @returns The result of the function.
     *
     * @example
     * ```typescript
     * $.effect(() => {
     *   const val = $.untracked(() => someAtom.value);
     *   console.log('Read without tracking:', val);
     * });
     * ```
     */
    untracked<T>(fn: () => T): T;
    /**
     * Determines if a value is a reactive atom.
     *
     * @param obj - The value to check.
     * @returns True if the value is an atom.
     */
    isAtom(obj: unknown): obj is WritableAtom<unknown> | ReadonlyAtom<unknown>;
    /**
     * Determines if a value is a derived computed atom.
     *
     * @param obj - The value to check.
     * @returns True if the value is a computed atom.
     */
    isComputed(obj: unknown): obj is ComputedAtom<unknown>;
    /**
     * Returns a promise that resolves after the next reactive scheduler cycle.
     *
     * @returns A promise resolving on the next tick.
     */
    nextTick(): Promise<void>;

    /**
     * Combines multiple object-based atoms into a single computed atom with a flattened type.
     *
     * This utility merges the value types of all input atoms into a single
     * unified object type.
     *
     * @param atoms - A variadic list of atoms or computed nodes to merge.
     * @returns A read-only reactive computed atom containing the merged object.
     *
     * @example
     * ```typescript
     * const a = $.atom({ x: 1 });
     * const b = $.atom({ y: 2 });
     * const combined = $.mergeAtoms(a, b);
     * // combined.value is { x: number, y: number }
     * ```
     */
    mergeAtoms<T extends Dependency<unknown>[]>(
      ...atoms: T
    ): ComputedAtom<MergedDependencyValue<T>>;

    /**
     * Merges multiple writable lenses into a single unified lens with a flattened type.
     *
     * Getting the value returns a merged object, and setting the value propagates
     * the changes back to the constituent lenses.
     *
     * @param lenses - A variadic list of WritableAtoms (lenses).
     * @returns A writable reactive atom (lens) containing the merged object.
     */
    mergeLenses<L extends WritableAtom<unknown>[]>(
      ...lenses: L
    ): WritableAtom<MergedDependencyValue<L>>;

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
     * Creates a two-way reactive proxy for a nested property path.
     *
     * @param atom - The source atom.
     * @param path - Dot-separated path to the property (e.g., 'user.name').
     * @returns A new writable lens atom.
     *
     * @example
     * ```typescript
     * const store = $.atom({ user: { name: 'Alice' } });
     * const nameLens = $.atomLens(store, 'user.name');
     * nameLens.value = 'Bob'; // Updates the original store
     * ```
     */
    atomLens<T extends object, P extends Paths<T>>(
      atom: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Composes an existing lens with a sub-path.
     *
     * @param lens - The parent lens atom.
     * @param path - Sub-path relative to the lens.
     * @returns A new writable lens atom.
     */
    composeLens<T extends object, P extends Paths<T>>(
      lens: WritableAtom<T>,
      path: P
    ): DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Creates a lens factory bound to a specific source atom.
     *
     * @param atom - The source atom.
     * @returns A function that generates lenses for the atom's paths.
     */
    lensFor<T extends object>(
      atom: WritableAtom<T>
    ): <P extends Paths<T>>(p: P) => DisposableWritableAtom<PathValue<T, P>>;

    /**
     * Initializes a reactive router for synchronizing URL state with DOM views.
     *
     * When to use:
     * - Invoke during application bootstrap to define your routing manifest
     *   and bind a target container for dynamic content rendering.
     *
     * Logic: Reactive Routing
     * This manager orchestrates URL synchronization, path matching, and dynamic
     * view rendering. It exposes reactive atoms (`currentRoute`, `params`)
     * allowing the rest of your UI to respond automatically to navigation changes.
     *
     * Capabilities:
     * - Multi-mode support: Modern 'history' (clean URLs) or 'hash' for legacy/static hosting.
     * - Dynamic matching: High-performance parameter extraction for named segments.
     * - Lifecycle guards: Navigation control via `onEnter` and `onLeave` hooks.
     * - Accessibility: Built-in focus management for Screen Readers on route transitions.
     *
     * @param config - Configuration for routes, target containers, and lifecycle hooks.
     * @returns A router interface for programmatic control and state monitoring.
     *
     * @example
     * ```typescript
     * const router = $.route({
     *   target: '#app-root',
     *   routes: {
     *     '/': { template: '#home-tmpl' },
     *     '/user/:id': {
     *       onEnter: (params) => console.log('Entering user:', params.id),
     *       render: (el, name, params) => {
     *         $(el).text(`User Profile: ${params.id}`);
     *       }
     *     }
     *   }
     * });
     *
     * // Programmatic navigation
     * router.navigate('/user/42');
     * ```
     */
    route(config: RouteConfig): Router;

    /**
     * Creates a computed atom that manages an asynchronous AJAX lifecycle.
     *
     * Logic: Concurrency Control
     * - Uses `AbortController` and `jqXHR.abort()` to ensures that only the
     *   result of the most recent request is reflected in the atom's state.
     * - Discards older, "out-of-order" responses to prevent UI flickering
     *   and data race conditions.
     *
     * When to use:
     * - Fetching data that depends on other reactive atoms.
     * - Implementing automatic refetching and request cancellation.
     *
     * @param source - A static URL or a reactive function returning a URL.
     * @param opts - Fetch configuration and response transformation.
     * @returns A computed atom with abort and disposal capabilities.
     *
     * @example
     * ```typescript
     * const userId = $.atom(1);
     * const user = $.atomFetch(() => `/api/users/${userId.value}`, {
     *   defaultValue: { name: 'Loading...' },
     *   eager: true
     * });
     * ```
     *
     * @public
     */
    atomFetch<T>(
      url: string | (() => string),
      opts: FetchOptions<T>
    ): ComputedAtom<T> & {
      /** Aborts the currently active request. */
      abort: () => void;
      /** Releases all reactive resources and aborts pending requests. */
      dispose(): void;
    };

    /**
     * Initializes fragment-based SPA navigation.
     *
     * When to use:
     * - To implement partial page updates via AJAX without full reloads.
     * - When automatic cleanup of bindings in replaced containers is required.
     *
     * @param options - Navigation configuration.
     * @returns An interface for managing fragment navigation.
     *
     * @public
     */
    atomNav(options: AtomNavOptions): AtomNav;

    /**
     * Registers a reactive context value at a specific DOM root.
     *
     * When to use:
     * - Recommended for sharing state (atoms) with deep descendants without
     *   explicit prop drilling.
     * - Suitable for establishing theme or configuration contexts at specific DOM roots.
     *
     * Logic: Dependency Injection
     * Shares state with descendant elements via the bubbling `aej:context-request` event.
     *
     * Logic: CSS Bridge
     * Automatically synchronizes provided values with CSS custom properties (`--aej-[key]`),
     * enabling reactive styling driven by application state.
     *
     * @param element - The host element, selector, or collection acting as provider.
     * @param key - Unique identifier for the context (string or symbol).
     * @param val - The reactive atom or static value to share.
     */
    provideAtom(element: HTMLElement | JQuery | string, key: string | symbol, val: unknown): void;

    /**
     * Injects a reactive context provided by an ancestor element.
     *
     * When to use:
     * - Recommended for consuming state from an ancestor without direct coupling.
     * - Suitable for creating context-aware components that adapt to their
     *   DOM hierarchy position.
     *
     * Logic: Hybrid Discovery
     * Returns a reactive proxy atom that automatically re-locates providers
     * if the element is moved within the DOM hierarchy.
     *
     * @param element - The element or selector requesting the context.
     * @param key - The unique identifier of the context to locate.
     * @returns A reactive proxy atom representing the injected context.
     */
    injectAtom<T = unknown>(
      element: HTMLElement | JQuery | string,
      key: string | symbol
    ): WritableAtom<T>;

    /**
     * Composition-based helper for building reactive Web Components.
     *
     * When to use:
     * - Recommended for integrating reactive state management into standard
     *   Custom Elements.
     * - Suitable for mapping HTML attributes and slots to reactive atoms.
     *
     * Logic: Lifecycle Integration
     * Returns a controller that orchestrates the initialization and teardown
     * of component-specific reactive resources.
     *
     * @param element - The host Custom Element (usually `this`).
     * @returns A controller for managing the component's reactive lifecycle.
     *
     * @example
     * ```typescript
     * class MyComponent extends HTMLElement {
     *   private aej = $.useAtomComponent(this);
     *   private count = $.atom(0);
     *
     *   connectedCallback() {
     *     this.aej.setup({
     *       bind: { count: this.count }
     *     });
     *     this.aej.$('.btn').on('click', () => console.log('Action performed'));
     *   }
     *
     *   disconnectedCallback() {
     *     this.aej.teardown();
     *   }
     * }
     * ```
     */
    useAtomComponent(element: HTMLElement): AtomComponentController;

    /**
     * Initializes the Atom-Effect jQuery library with custom settings.
     *
     * @param config - Global configuration for patches and cleanup observers.
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
     * Reactively synchronizes the element's text content.
     *
     * When to use:
     * - Rendering labels, status messages, or counters that track state.
     *
     * @param src - The reactive source value.
     * @param fmt - Optional function to format the value for display.
     * @returns The original jQuery collection.
     *
     * @example
     * ```typescript
     * $('.status').atomText(isOnline, (v) => v ? 'Online' : 'Offline');
     * ```
     */
    atomText<T>(src: AsyncReactiveValue<T>, fmt?: (v: T) => string): this;
    /**
     * Reactively synchronizes the element's inner HTML.
     *
     * Caution: Security Risk
     * Rendering unsanitized HTML from user input can lead to XSS attacks.
     * Always ensure the source data is trusted or sanitized.
     *
     * @param src - The reactive source for the HTML content.
     * @returns The original jQuery collection.
     */
    atomHtml(src: AsyncReactiveValue<string>): this;
    /**
     * Toggles CSS classes based on reactive conditions.
     *
     * Logic: Supports both individual class toggling and batch management
     * via mapping objects.
     *
     * @example
     * ```typescript
     * $('.btn').atomClass('is-active', isActive);
     * $('.card').atomClass({ 'is-hidden': isHidden, 'is-loading': isLoading });
     * ```
     */
    atomClass(name: string, cond: AsyncReactiveValue<boolean>): this;
    atomClass(map: Record<string, AsyncReactiveValue<boolean>>): this;
    /**
     * Reactively synchronizes CSS styles.
     *
     * Logic: Normalizes property names and units (e.g., 'px') to ensure
     * cross-browser consistency for dynamic layouts.
     *
     * @example
     * ```typescript
     * $('.box').atomCss('width', progress, '%');
     * $('.overlay').atomCss({ opacity: transparency });
     * ```
     */
    atomCss(prop: string, src: AsyncReactiveValue<string | number>, unit?: string): this;
    atomCss(map: CssBindings): this;
    /**
     * Reactively synchronizes HTML attributes.
     *
     * When to use:
     * - Updating `id`, `title`, `alt`, or `aria-*` attributes.
     *
     * @example
     * ```typescript
     * $('.icon').atomAttr('title', tooltipAtom);
     * ```
     */
    atomAttr(name: string, src: AsyncReactiveValue<PrimitiveValue>): this;
    atomAttr(map: Record<string, AsyncReactiveValue<PrimitiveValue>>): this;
    /**
     * Reactively synchronizes DOM properties (e.g., `disabled`, `checked`).
     *
     * When to use:
     * - Toggling stateful properties that require boolean values or direct access.
     */
    atomProp<T>(name: string, src: AsyncReactiveValue<T>): this;
    atomProp(map: Record<string, AsyncReactiveValue<unknown>>): this;
    /**
     * Shows the element (`display: block/initial`) when the condition is true.
     *
     * @param cond - Reactive condition for visibility.
     */
    atomShow(cond: AsyncReactiveValue<boolean>): this;
    /**
     * Hides the element (`display: none`) when the condition is true.
     *
     * @param cond - Reactive condition for hiding.
     */
    atomHide(cond: AsyncReactiveValue<boolean>): this;

    /**
     * Establishes a two-way binding for form input values.
     *
     * Logic: Synchronization Engine
     * Automatically coordinates updates between the DOM's `value` and a
     * writable atom, handling cursor stability and IME composition.
     *
     * @param atom - The writable atom to synchronize with.
     * @param opts - Configuration for debouncing, parsing, and formatting.
     */
    atomVal<T>(atom: WritableAtom<T>, opts?: ValOptions<T>): this;

    /**
     * Establishes a two-way binding for checkboxes and radio buttons.
     *
     * @param atom - The writable atom to synchronize with.
     */
    atomChecked(atom: WritableAtom<boolean>): this;

    /**
     * Orchestrates two-way bindings for an entire form element.
     *
     * When to use:
     * - Recommended for synchronizing standard HTML forms with complex, nested
     *   reactive state objects.
     * - Suitable for scenarios requiring declarative validation integrated with
     *   browser-native APIs.
     *
     * Logic: Path Mapping
     * Maps form field `name` attributes to nested properties of a reactive
     * object atom using lenses, allowing for structural sharing updates.
     *
     * @param atom - The writable atom containing the form data object.
     * @param opts - Configuration for transformation and validation callbacks.
     *
     * @example
     * ```typescript
     * const user = $.atom({ name: 'Alice' });
     * $('form').atomForm(user, {
     *   validation: { name: (v) => !!v }
     * });
     * ```
     */
    atomForm<T extends object>(
      atom: WritableAtom<T> | WritableAtom<unknown>[],
      opts?: FormOptions<T>
    ): this;

    /**
     * Registers an event listener with automatic lifecycle cleanup.
     *
     * @param event - The event name to listen for.
     * @param handler - The event handler function.
     */
    atomOn(event: string, handler: (e: JQuery.Event) => void): this;

    /**
     * Entry point for declaring multiple reactive bindings in a single call.
     *
     * Logic: Batch Initialization
     * Iterates through the provided options and executes the corresponding
     * binding logic in a deterministic order for optimal performance.
     *
     * @param opts - A mapping of binding types to their reactive sources.
     */
    atomBind<T = unknown>(opts: BindingOptions<T>): this;

    /**
     * High-performance reactive list renderer for jQuery.
     *
     * Usage Example:
     * ```javascript
     * $('#todo-list').atomList(todosAtom, {
     *   key: 'id',
     *   render: (todo) => `<li class="item">${todo.text}</li>`,
     *   events: {
     *     'click .remove': (todo, index, e) => removeTodo(todo.id)
     *   }
     * });
     * ```
     *
     * Lifecycle:
     * - Automatically cleans up via `registry` when the element is removed from DOM.
     * - Re-binding to the same element replaces the previous reactive effect.
     */
    atomList<T>(src: ReadonlyAtom<T[]>, opts: ListOptions<T>): this;

    /**
     * Mounts a reactive component and manages its isolated lifecycle.
     *
     * Logic: Component Sandbox
     * Handles automatic teardown of existing content, isolated component
     * execution, and registration of cleanup hooks in the global registry.
     *
     * @param comp - The component function to mount.
     * @param props - Properties to pass to the component.
     */
    atomMount<P>(comp: ComponentFn<P>, props?: P): this;
    /**
     * Manually triggers the teardown phase for the component and its bindings.
     *
     * @returns The original jQuery collection.
     */
    atomUnmount(): this;

    /**
     * Manually destroys all reactive bindings associated with the elements.
     *
     * @returns The original jQuery collection.
     */
    atomUnbind(): this;
  }
}
