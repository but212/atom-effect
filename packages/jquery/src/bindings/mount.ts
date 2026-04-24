import { batch, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { atomEachElement } from '@/core/dom';
import { registry } from '@/core/registry';
import type { ComponentFn } from '@/types';

/**
 * A frozen empty object used as the default fallback for component properties.
 * @internal
 */
const DEFAULT_PROPS = Object.freeze({});

/**
 * Orchestrates the lifecycle and mounting of a reactive UI component onto a jQuery collection.
 *
 * This function manages the initialization, reactive isolation, and teardown
 * registration for discrete UI units. It ensures that components are executed
 * within a safe window to prevent dependency leaks and that their resources
 * are automatically released when the element is removed from the DOM.
 *
 * When to use:
 * - To initialize complex UI modules that manage internal reactive effects,
 *   event listeners, or child bindings.
 * - To build reusable "Logic Units" that require dedicated cleanup phases.
 *
 * Lifecycle:
 * 1. Cleanup: Existing reactive bindings on the target elements are destroyed to prevent conflicts.
 * 2. Isolation: The component is executed within `untracked` and `batch` scopes to
 *    prevent the parent context from tracking the component's internal dependencies.
 * 3. Registration: The returned cleanup function (or unmount hook) is registered
 *    in the global registry for automatic execution during disposal.
 *
 * @param component - The component function to initialize.
 * @param props - Optional properties to pass to the component.
 * @returns The original jQuery collection for chaining.
 *
 * @example
 * ```typescript
 * import { atom, effect } from '@but212/atom-effect';
 *
 * // 1. Define a component
 * const MyCounter = ($el, props) => {
 *   const count = atom(0);
 *   const fx = effect(() => $el.text(`${props.title}: ${count.value}`));
 *
 *   // Return a teardown function
 *   return () => fx.dispose();
 * };
 *
 * // 2. Mount the component
 * $('.counter-host').atomMount(MyCounter, { title: 'Click Count' });
 * ```
 */
$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const mergedProps = (props ?? DEFAULT_PROPS) as P;

  return atomEachElement(this, (element) => {
    // Reason: Existing bindings are cleaned up first to prevent memory leaks and
    // conflicting reactive effects if mounting on a non-empty element.
    registry.cleanupTree(element);

    // Logic: 'untracked' ensures the component's initialization logic does not
    // establish dependency loops with the parent caller. 'batch' ensures that
    // initial DOM manipulations occur atomically.
    const hook = untracked(() => batch(() => component($(element), mergedProps)));

    if (hook) {
      const teardown = typeof hook === 'function' ? hook : hook.unmount;
      registry.setTeardown(element, teardown);
    }
  });
};

/**
 * Manually triggers the unmounting and resource cleanup for elements in the collection.
 *
 * When to use:
 * - To explicitly destroy a mounted component and its associated reactive effects.
 *
 * @returns The original jQuery collection for chaining.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
