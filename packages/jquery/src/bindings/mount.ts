/**
 * @module AEJMount
 *
 * Responsibility:
 * Orchestrates the lifecycle and mounting of reactive UI components
 * onto jQuery collections, ensuring isolated execution and automated teardown.
 */

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
 * const MyCounter = ($el, props) => {
 *   const count = $.atom(0);
 *   const fx = $.effect(() => $el.text(`${props.title}: ${count.value}`));
 *   return () => fx.dispose(); // Teardown hook
 * };
 *
 * // 2. Mount onto a collection
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
 * Logic: Manual Resource Teardown
 * Explicitly triggers unmounting and resource cleanup for elements in the collection.
 *
 * When to use:
 * - When you need to manually destroy a component before its host element is removed.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
