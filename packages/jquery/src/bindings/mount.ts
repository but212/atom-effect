import { batch, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { atomEachElement } from '@/core/dom';
import { registry } from '@/core/registry';
import type { ComponentFn } from '@/types';

const EMPTY_PROPS = Object.freeze({});

/**
 * Mounts a functional component to the selected elements.
 *
 * Logic: Orchestrates the lifecycle of a discrete UI unit. It handles
 * pre-mount cleanup, executes the component within a safe reactive window,
 * and tracks individual teardown logic for future disposal.
 *
 * When to use:
 * - Creating complex UI modules that manage internal reactive effects or listeners.
 * - Building reusable "Logic Units" that require dedicated cleanup phases.
 *
 * Lifecycle:
 * 1. Cleanup: Automatically destroys any existing bindings on the target element.
 * 2. Isolation: Executes the component inside `untracked` and `batch` to prevent
 *    dependency leaks and ensure atomic initial rendering.
 * 3. Registration: Tracks the returned cleanup function via the global registry.
 *
 * @example
 * ```typescript
 * // 1. Define a component
 * const MyCounter = ($el, props) => {
 *   const count = atom(0);
 *   const fx = effect(() => $el.text(`${props.title}: ${count.value}`));
 *
 *   return () => fx.dispose(); // Teardown
 * };
 *
 * // 2. Mount it
 * $('.counter-host').atomMount(MyCounter, { title: 'Clicks' });
 * ```
 *
 * @public
 */
$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const componentProps = (props ?? EMPTY_PROPS) as P;

  return atomEachElement(this, (element) => {
    // Reason: Prevents memory leaks and conflicting effects if mounting on a non-empty element.
    registry.cleanupTree(element);

    // Reason: 'untracked' ensures component initialization doesn't establish dependency
    // loops with the parent caller. 'batch' ensures initial DOM updates are atomic.
    const result = untracked(() => batch(() => component($(element), componentProps)));

    if (result) {
      const teardown = typeof result === 'function' ? result : result.unmount;
      registry.setComponentCleanup(element, teardown);
    }
  });
};

/**
 * Manually triggers the teardown phase for the component and all nested bindings.
 *
 * @public
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
