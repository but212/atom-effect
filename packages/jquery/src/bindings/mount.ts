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
 * const MyComp = ($el, props) => {
 *   const fx = effect(() => $el.text(props.label));
 *   return () => fx.dispose(); // Optional teardown
 * };
 *
 * // Mount it
 * $('.tab').atomMount(MyComp, { label: 'Home' });
 */
$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const p = (props ?? EMPTY_PROPS) as P;

  return atomEachElement(this, (el) => {
    // Reason: Prevents memory leaks and conflicting effects if mounting on a non-empty element.
    registry.cleanupTree(el);

    // Reason: 'untracked' ensures component initialization doesn't establish dependency
    // loops with the parent caller. 'batch' ensures initial DOM updates are atomic.
    const teardown = untracked(() => batch(() => component($(el), p)));

    if (typeof teardown === 'function') {
      registry.setComponentCleanup(el, teardown);
    }
  });
};

/**
 * Manually triggers the teardown phase for the component(s) and all nested bindings.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (el) => registry.cleanupTree(el));
};
