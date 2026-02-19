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

/**
 * Mounts a functional component on a single element.
 *
 * If a component is already mounted on `el`, it is unmounted first so that
 * its cleanup runs before the new component initialises.
 *
 * The component function receives `($el, props)` and may return an optional
 * cleanup callback — see {@link ComponentFn}. That callback is stored in the
 * registry and called automatically when the element is removed or
 * `atomUnmount` is invoked. `registry.cleanup` runs `componentCleanup` before
 * any reactive effects, giving the component a chance to unmount gracefully.
 * Errors thrown by the cleanup are caught and logged by `registry.cleanup`
 * using `MOUNT_CLEANUP_ERROR` — no additional wrapping is needed here.
 */
function mountComponent<P>(el: HTMLElement, component: ComponentFn<P>, props: P): void {
  // Unmount any existing component before mounting the new one.
  registry.cleanupTree(el);

  const $el = $(el);
  let teardown: ReturnType<typeof component>;
  try {
    // untracked: component setup code must not register dependencies on any
    // outer reactive context (e.g. if atomMount is called inside an effect).
    // Inner effect() calls inside the component set up their own subscriptions
    // independently via the registry.
    teardown = untracked(() => component($el, props));
  } catch (err) {
    debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT_ERROR(), err);
    return;
  }

  if (typeof teardown === 'function') {
    registry.setComponentCleanup(el, teardown);
  }
}

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
  return this.each(function () {
    mountComponent(this, component, (props ?? {}) as P);
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
