import $ from 'jquery';
import { debug } from './debug';
import { registry } from './registry';
import type { ComponentFn } from './types';
import { getSelector } from './utils';

const mountedComponents = new WeakMap<Element, () => void>();

/**
 * Mounts a functional component to the element.
 * Automatically cleans up existing components on the same element.
 */
$.fn.atomMount = function <P>(component: ComponentFn<P>, props: P = {} as P): JQuery {
  return this.each(function () {
    const selector = getSelector(this);

    // Unmount existing component
    if (mountedComponents.has(this)) {
      debug.log('mount', `${selector} unmounting existing component`);
      mountedComponents.get(this)!();
    }

    debug.log('mount', `${selector} mounting component`);

    // Mount
    let userCleanup: undefined | (() => void);
    try {
      userCleanup = component($(this), props);
    } catch (e) {
      console.error('[atom-effect-jquery] Mount error:', e);
      return;
    }

    // cleanup
    const fullCleanup = () => {
      if (!mountedComponents.has(this)) return;
      mountedComponents.delete(this);

      debug.log('mount', `${selector} full cleanup`);

      if (typeof userCleanup === 'function') {
        try {
          userCleanup();
        } catch (e) {
          console.error('[atom-effect-jquery] Cleanup error:', e);
        }
      }
      registry.cleanupTree(this);
    };

    mountedComponents.set(this, fullCleanup);
    registry.trackCleanup(this, fullCleanup);
  });
};

/**
 * Manually unmounts a component from the element.
 */
$.fn.atomUnmount = function (): JQuery {
  return this.each(function () {
    mountedComponents.get(this)?.();
  });
};
