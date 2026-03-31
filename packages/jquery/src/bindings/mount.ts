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
$.fn.atomMount = function <P>(this: JQuery, component: ComponentFn<P>, props?: P): JQuery {
  const p = (props ?? EMPTY_PROPS) as P;
  const compName = component.name || 'Component';

  for (let i = 0, len = this.length; i < len; i++) {
    const rootEl = this[i];
    if (!rootEl) continue;

    registry.cleanupTree(rootEl);
    try {
      // Untracked execution prevents component initialization from leaking into parent effects
      const teardown = untracked(() => component($(rootEl), p));
      if (typeof teardown === 'function') {
        registry.setComponentCleanup(rootEl, teardown);
      }
    } catch (err) {
      debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.ERROR(compName), err);
    }
  }
  return this;
};

/**
 * Unmounts the component and disposes all reactive bindings on each selected
 * element and its descendants.
 */
$.fn.atomUnmount = function (this: JQuery): JQuery {
  for (let i = 0, len = this.length; i < len; i++) {
    const el = this[i];
    if (el) bindUnbind(el);
  }
  return this;
};
