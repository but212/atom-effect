/**
 * @module AEJReactiveTypes
 *
 * Responsibility:
 * Defines the core type system for reactive JQuery bindings, including lifecycle
 * hooks, polymorphic inputs, and component specifications.
 *
 * Design Intent:
 * Provides a type-safe interface for declarative DOM manipulation while
 * ensuring compatibility with the underlying atom-effect core.
 */

import type {
  AtomOptions as BaseAtomOptions,
  EffectCleanup,
  ReadonlyAtom,
  WritableAtom,
} from '@but212/atom-effect';

/**
 * Role: Lifecycle Teardown
 * Encapsulates cleanup logic executed during the unmount phase.
 */
export interface ComponentLifecycle {
  /** Task to release resources, observers, or listeners. */
  unmount: EffectCleanup;
}

/** The result of a reactive effect function, which may include cleanup logic. */
export type EffectResult = undefined | EffectCleanup | ComponentLifecycle;

/**
 * Logic: Equality Comparison
 * Used to optimize reactivity by preventing updates when values are
 * logically equivalent, even if object references have changed.
 */
export type EqualFn<T> = (first: T, second: T) => boolean;

/**
 * Configuration options for creating reactive atoms.
 *
 * When to use:
 * - When creating a new state atom that requires a name for diagnostics
 *   or specific update scheduling (sync vs batched).
 *
 * @public
 * @example
 * const count = atom(0, { name: 'counter', sync: true });
 */
export type AtomOptions<T = unknown> = BaseAtomOptions<T>;

/**
 * Logic: Polymorphic Input
 * Supports raw values for static initialization, reactive atoms for state-driven
 * updates, or functional getters for deferred execution of complex logic.
 *
 * When to use:
 * - In component props or binding options where the input source is uncertain.
 */
export type ReactiveValue<T> = T | ReadonlyAtom<T> | (() => T);

/**
 * A value that can be a static literal, a reactive atom, a promise, or a getter
 * function that returns any of these.
 *
 * When to use:
 * - CSS or Attribute bindings that require data from an asynchronous source.
 * - Integration with fetch-based reactive atoms where values resolve over time.
 *
 * @public
 */
export type AsyncReactiveValue<T> =
  | T
  | ReadonlyAtom<T | Promise<T>>
  | Promise<T>
  | (() => T | Promise<T>);

/** Supported primitive types for attribute and property bindings. */
export type PrimitiveValue = string | number | boolean | null | undefined;

/**
 * Reason: Unit Standardization
 * Tuples allow for reactive numeric values to be automatically suffixed
 * with a unit string (e.g., 'px', '%') during DOM synchronization.
 */
export type CssValue =
  | AsyncReactiveValue<string | number>
  | [source: AsyncReactiveValue<number>, unit: string];

/** A mapping of CSS property names to their reactive values. */
export type CssBindings = Record<string, CssValue>;

/**
 * Declaration of reactive bindings for a DOM element.
 *
 * Logic: Binding Strategy Map
 * Maps reactive sources to specific DOM manipulation strategies (text, class,
 * val, etc.). This declarative structure allows the engine to batch updates
 * and optimize resource cleanup automatically.
 *
 * @public
 * @example
 * // Single element binding
 * $('#user-card').bind({
 *   text: [nameAtom, (v) => `Hello, ${v}`],
 *   class: { 'is-active': isActiveAtom },
 *   css: { color: themeColorAtom },
 *   on: { click: () => console.log('Clicked!') }
 * });
 */
/** @internal */
export type UnwrapAsyncReactiveValue<T> =
  T extends ReadonlyAtom<infer U>
    ? U extends Promise<infer P>
      ? P
      : U
    : T extends Promise<infer U>
      ? U
      : T extends () => infer U
        ? U extends Promise<infer P>
          ? P
          : U
        : T;

export interface BindingOptions<T = unknown, TText = unknown> {
  /** Binds the element's text content. Can include an optional formatter. */
  text?:
    | TText
    | [
        source: TText,
        formatter?: ((v: UnwrapAsyncReactiveValue<TText>) => string) | null | undefined,
      ];
  /** Binds the element's inner HTML. Use with caution for untrusted content. */
  html?: AsyncReactiveValue<string>;
  /** Toggles CSS classes based on reactive conditions. */
  class?: Record<string, AsyncReactiveValue<boolean>>;
  /** Binds CSS styles reactively. */
  css?: CssBindings;
  /** Binds HTML attributes reactively. */
  attr?: Record<string, AsyncReactiveValue<PrimitiveValue>>;
  /** Binds DOM properties reactively. */
  prop?: Record<string, AsyncReactiveValue<unknown>>;
  /** Toggles element visibility (`display: block/none`) based on a condition. */
  show?: AsyncReactiveValue<boolean>;
  /** Hides the element (`display: none`) when the condition is true. */
  hide?: AsyncReactiveValue<boolean>;
  /** Two-way binding for form input values. */
  val?: WritableAtom<T> | [atom: WritableAtom<T>, options?: ValOptions<T> | null | undefined];
  /** Two-way binding for checkbox and radio checked states. */
  checked?: WritableAtom<boolean>;
  /** Orchestrates two-way bindings for an entire form element. */
  form?:
    | WritableAtom<T extends object ? T : unknown>
    | WritableAtom<unknown>[]
    | [
        atom: WritableAtom<T extends object ? T : unknown> | WritableAtom<unknown>[],
        options?: FormOptions<T extends object ? T : unknown> | null | undefined,
      ];
  /** Registers event listeners with automatic lifecycle management. */
  on?: Record<string, (event: JQuery.Event) => void>;
}

/** A writable atom that includes an explicit disposal mechanism. @internal */
export interface DisposableWritableAtom<T> extends WritableAtom<T> {
  /** Releases all reactive resources and observers associated with the atom. */
  dispose(): void;
}

/** Supported key types for identifying items in a reactive list. */
export type ListKey = string | number;

/** Valid return types for a list item render function. */
export type ListRenderResult = string | Element | DocumentFragment | JQuery;

/** A function that extracts a unique identity key from a list item. */
export type ListKeyFn<T> = (item: T, index: number) => ListKey;

/**
 * Configuration options for reactive list rendering.
 *
 * Optimization: DOM Reconciliation
 * Uses unique keys for identity tracking to minimize DOM churn by reordering
 * existing elements instead of re-rendering the entire list when data changes.
 *
 * @public
 * @example
 * const items = atom([{ id: 1, text: 'A' }, { id: 2, text: 'B' }]);
 *
 * $('#list').list(items, {
 *   key: 'id',
 *   render: (item) => `<li>${item.text}</li>`,
 *   onAdd: ($element) => $element.fadeIn()
 * });
 */
export interface ListOptions<T> {
  /** The property name or function used to extract unique keys. */
  key: keyof T | ListKeyFn<T>;
  /** Function to generate the DOM representation for an item. */
  render: (item: T, index: number) => ListRenderResult;
  /** Optional callback to apply bindings to the rendered element. */
  bind?: ($element: JQuery, item: T, index: number) => void;
  /** Optional callback triggered when an item's data is updated. */
  update?: ($element: JQuery, item: T, index: number) => void;
  /** Callback triggered when a new element is added to the list. */
  onAdd?: ($element: JQuery) => void;
  /** Callback triggered when an element is removed (can be used for transitions). */
  onRemove?: ($element: JQuery) => Promise<void> | void;
  /** Content to display when the list is empty. */
  empty?: ListRenderResult;
  /** Event handlers bound to individual list items. */
  events?: Record<string, (item: T, index: number, e: JQuery.TriggeredEvent) => void>;
  /** Optional function for custom item equality checks. */
  isEqual?: (first: T, second: T) => boolean;
}

/** Options for customizing two-way value bindings. */
export interface ValOptions<T> {
  /** Time in milliseconds to delay atom synchronization after user input. */
  debounce?: number;
  /** The DOM event used to trigger synchronization (e.g., 'change'). */
  event?: string;
  /** Function to parse the DOM string value into the atom's type. */
  parse?: (rawValue: string) => T;
  /** Function to format the atom's value for DOM display. */
  format?: (v: T) => string;
  /** Function for custom value equality checks. */
  equal?: EqualFn<T>;
}

/** Options for orchestrating form-wide reactive synchronization. */
export interface FormOptions<T> extends ValOptions<T> {
  /** Function to transform field values based on their object path before synchronization. */
  transform?: (path: string, value: unknown) => unknown;
  /** Callback triggered whenever any field in the form changes. */
  onChange?: (path: string, value: unknown) => void;
  /** Reactive validation schema mapping paths to validators. */
  validation?: Record<string, (fieldValue: unknown) => string | boolean>;
}

/** Definition for a mountable component that manages its own reactive lifecycle. */
export type ComponentFn<P = Record<string, unknown>> = ($element: JQuery, props: P) => EffectResult;

/**
 * Options for customizing jQuery core method overrides.
 *
 * @public
 */
export interface PatchOptions {
  /**
   * Automatically wraps .on()/.one() callbacks in $.batch() for reactivity.
   * @default true
   */
  events?: boolean;
  /**
   * Hooks .remove()/.empty()/.detach() for automatic resource cleanup.
   * @default true
   */
  lifecycle?: boolean;
}

/**
 * Global configuration settings for the library.
 *
 * @public
 */
export interface AEJConfig {
  /**
   * Configuration for jQuery prototype patches.
   * Set to false to disable all automated overrides.
   */
  patch?: boolean | PatchOptions;
  /**
   * Configuration for the automated MutationObserver cleanup system.
   * Set to false to manage reactive resource disposal manually.
   */
  autoCleanup?: boolean | { root: Element | ShadowRoot | DocumentFragment };
}

export type { EffectCleanup, ReadonlyAtom, WritableAtom };
