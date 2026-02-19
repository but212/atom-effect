import { untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import { registry } from './registry';
import type { ComponentFn } from './types';
import { bindUnbind } from './unified';

// ============================================================================
// Internal helpers
// ============================================================================

const EMPTY_PROPS = Object.freeze({});

// ============================================================================
// jQuery plugin methods
// ============================================================================

/**
 * Mounts a functional component on each selected element.
 *
 * @param component - Function receiving `($el, props)` and returning an
 *   optional cleanup callback. See {@link ComponentFn}.
 * @param props - Props passed to the component. When omitted, `P` must be
 *   compatible with an empty object (i.e. all fields optional or
 *   `P = object`). Passing no props to a component with required fields is
 *   a type error that TypeScript will catch at the call site, but only when
 *   `props` is explicitly typed — the `{} as P` fallback is not type-safe
 *   for components with required fields.
 */
$.fn.atomMount = function <P>(component: ComponentFn<P>, props?: P): JQuery {
  // Hoist default props object to avoid allocation in loop
  const p = (props ?? EMPTY_PROPS) as P;

  return this.each(function () {
    // Unmount any existing component before mounting the new one.
    registry.cleanupTree(this);

    const $el = $(this);
    let teardown: ReturnType<typeof component>;
    try {
      // untracked: component setup code must not register dependencies on any
      // outer reactive context (e.g. if atomMount is called inside an effect).
      teardown = untracked(() => component($el, p));
    } catch (err) {
      debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT_ERROR(), err);
      return;
    }

    if (typeof teardown === 'function') {
      registry.setComponentCleanup(this, teardown);
    }
  });
};

/**
 * Unmounts the component and disposes all reactive bindings on each selected
 * element and its descendants.
 */
$.fn.atomUnmount = function (): JQuery {
  return this.each(function () {
    bindUnbind(this);
  });
};
