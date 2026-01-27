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
    const isDebug = debug.enabled;
    const selector = isDebug ? getSelector(this) : '';

    // 1. Unmount existing component (Consolidated O(1) lookup)
    const existingUnmount = mountedComponents.get(this);
    if (existingUnmount) {
      if (isDebug) debug.log('mount', `${selector} unmounting existing component`);
      existingUnmount();
    }

    if (isDebug) debug.log('mount', `${selector} mounting component`);

    // 2. Mount
    let userCleanup: undefined | (() => void);
    try {
      userCleanup = component($(this), props);
    } catch (e) {
      console.error('[atom-effect-jquery] Mount error:', e);
      return;
    }

    // 3. Optimized cleanup
    const fullCleanup = () => {
      // Atomic delete() acts as a high-performance guard against double-cleanup
      if (!mountedComponents.delete(this)) return;

      if (isDebug) debug.log('mount', `${selector} full cleanup`);

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
    const unmount = mountedComponents.get(this);
    if (unmount) unmount();
  });
};
