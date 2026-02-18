import $ from 'jquery';
import { registry } from './registry';
import type { ComponentFn } from './types';

/**
 * Functional component mounting logic.
 */
export function mountComponent<P>($el: JQuery, component: ComponentFn<P>, props: P): void {
  const el = $el[0];
  if (!el) return;

  // Cleanup existing component if any
  unmountComponent($el);

  // Initialize component and register cleanup
  let cleanup: ReturnType<typeof component>;
  try {
    cleanup = component($el, props);
  } catch (err) {
    console.error('[atom-effect-jquery] Mount error:', err);
    return;
  }
  if (typeof cleanup === 'function') {
    // Registry will automatically mark as bound via _getOrCreateRecord
    registry.setComponentCleanup(el, cleanup);
  }
}

/**
 * Functional component unmounting logic.
 */
export function unmountComponent($el: JQuery): void {
  $el.each(function () {
    const cleanup = registry.getComponentCleanup(this);
    if (cleanup) {
      try {
        cleanup();
      } catch (err) {
        console.error('[atom-effect-jquery] Cleanup error:', err);
      }
      registry.setComponentCleanup(this, undefined);
    }

    // Also run general effect cleanup for this tree
    registry.cleanupTree(this);
  });
}

$.fn.atomMount = function <P>(component: ComponentFn<P>, props?: P): JQuery {
  return this.each(function () {
    mountComponent($(this), component, (props ?? {}) as P);
  });
};

$.fn.atomUnmount = function (): JQuery {
  unmountComponent(this);
  return this;
};
