import $ from 'jquery';
import { registry } from './registry';
import { debug } from './debug';
import { getSelector } from './utils';
import type { ComponentFn } from './types';

const mountedComponents = new WeakMap<Element, () => void>();

/**
 * Mounts a functional component to the element.
 * Automatically cleans up existing components on the same element.
 */
$.fn.atomMount = function<P>(
  component: ComponentFn<P>,
  props: P = {} as P
): JQuery {
  return this.each(function() {
    const $el = $(this);
    const selector = getSelector(this);

    // Unmount existing component
    const existing = mountedComponents.get(this);
    if (existing) {
      debug.log('mount', `${selector} unmounting existing component`);
      existing();
    }

    debug.log('mount', `${selector} mounting component`);

    // Mount
    let userCleanup: void | (() => void);
    try {
      userCleanup = component($el, props);
    } catch (e) {
      console.error('[atom-effect-jquery] Mount error:', e);
      return;
    }

    // cleanup
    let isUnmounted = false;
    const fullCleanup = () => {
      if (isUnmounted) return;
      isUnmounted = true;

      debug.log('mount', `${selector} full cleanup`);
      
      if (typeof userCleanup === 'function') {
        try { userCleanup(); } catch {}
      }
      registry.cleanupTree(this);
      mountedComponents.delete(this);
    };

    mountedComponents.set(this, fullCleanup);
    registry.trackCleanup(this, fullCleanup);
  });
};

/**
 * Manually unmounts a component from the element.
 */
$.fn.atomUnmount = function(): JQuery {
  return this.each(function() {
    mountedComponents.get(this)?.();
  });
};
