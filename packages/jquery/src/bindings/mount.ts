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

/** Shared read-only default props to prevent redundant allocations across components */
const EMPTY_PROPS = Object.freeze({});

/**
 * Logic: Component Lifecycle Orchestration
 * Initializes and mounts a reactive UI component onto a jQuery collection.
 *
 * Lifecycle: Execution Pipeline
 * 1. Cleanup: Existing reactive bindings on the target are destroyed to prevent conflicts.
 * 2. Isolation: Component executes within `untracked` and `batch` scopes to prevent
 *    dependency leaks to/from the parent context.
 * 3. Registration: Teardown hooks are registered for automatic execution on DOM removal.
 */
$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const resolvedProps = props ?? (EMPTY_PROPS as P);
  return atomEachElement(this, (element) => {
    registry.cleanupTree(element);

    const hook = untracked(() => batch(() => component($(element), resolvedProps)));
    const teardown = typeof hook === 'function' ? hook : hook?.unmount;
    if (teardown) {
      registry.setTeardown(element, teardown);
    }
  });
};

/**
 * Logic: Manual Resource Teardown
 * Explicitly triggers unmounting and resource cleanup for elements in the collection.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  return atomEachElement(this, (element) => registry.cleanupTree(element));
};
