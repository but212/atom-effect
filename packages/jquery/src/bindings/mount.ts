import { untracked } from '@but212/atom-effect';
import $ from 'jquery';
import { bindUnbind } from '@/bindings/unified';
import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import { registry } from '@/core/registry';
import type { ComponentFn } from '@/types';
import { debug } from '@/utils/debug';

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
 *   for components with required fields, which is why the cast is explicit
 *   rather than implicit.
 */
$.fn.atomMount = function <P>(component: ComponentFn<P>, props?: P): JQuery {
  // `props ?? EMPTY_PROPS` is cast to P: when props is omitted, P is
  // constrained by the caller to be compatible with `{}` (all fields optional).
  // The cast is necessary because TypeScript cannot infer the exact type of P
  // from the `props` argument alone, especially for components with required fields.
  const p = (props ?? EMPTY_PROPS) as P;

  for (let i = 0, len = this.length; i < len; i++) {
    const rootEl = this[i];
    if (!rootEl) continue;

    // Dispose any existing component and its reactive bindings on this element
    // *before* mounting the new one. This ensures a clean slate and uses the
    // same `cleanupTree` path as `atomUnmount` for consistency.
    registry.cleanupTree(rootEl);

    const $el = $(rootEl);
    let teardown: ReturnType<typeof component>;
    try {
      // untracked: component setup code must not register dependencies on any
      // outer reactive context (e.g. if atomMount is called inside an effect).
      teardown = untracked(() => component($el, p));
    } catch (err) {
      debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.ERROR(component.name), err);
      continue;
    }

    if (typeof teardown === 'function') {
      registry.setComponentCleanup(rootEl, teardown);
    }
  }

  return this;
};

/**
 * Unmounts the component and disposes all reactive bindings on each selected
 * element and its descendants.
 *
 * Delegates to `bindUnbind`, which calls `registry.cleanupTree` — performing
 * a recursive cleanup of all reactive bindings on the element and its descendants.
 * This is the same full-subtree cleanup path used by `atomMount` when replacing
 * an existing component.
 */
$.fn.atomUnmount = function (): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    const el = this[i];
    if (el) bindUnbind(el);
  }
  return this;
};
