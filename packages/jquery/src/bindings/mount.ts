import { batch, untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { atomEachElement } from '@/core/dom';
import { registry } from '@/core/registry';
import type { ComponentFn } from '@/types';

const EMPTY_PROPS = Object.freeze({});

/**
 * Mounts a functional component to the selected elements.
 *
 * When to use:
 * - Use for complex UI modules that manage their own internal reactive effects or DOM listeners.
 * - Ideal for "Logic Units" that need a cleanup phase when removed.
 *
 * Lifecycle:
 * 1. Automatically cleans up any existing component logic/effects on the target element.
 * 2. Executes the component function in an isolated reactive window (batch/untracked).
 * 3. Registers any returned cleanup function for future destruction.
 *
 * @example
 * // Define a component
 * const MyComponent = ($element, props) => {
 *   const reactiveEffect = effect(() => $element.text(props.label));
 *   return () => reactiveEffect.dispose(); // Optional teardown
 * };
 *
 * // Mount it
 * $('.tab').atomMount(MyComponent, { label: 'Home' });
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
 * Manually triggers the teardown phase for the component(s) and all nested bindings.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
