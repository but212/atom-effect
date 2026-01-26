import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registry } from './registry';
import type { ReactiveValue } from './types';
import { isReactive } from './utils';

/**
 * Utility to register a reactive effect or apply a static update.
 * Centralizes the boilerplate for atomic bindings.
 *
 * @param el - The DOM element to associate with the effect.
 * @param source - The reactive or static value source.
 * @param updater - Function to apply the value to the DOM.
 * @param debugType - Type label for debug logging.
 */
/**
 * Utility to register a reactive effect or apply a static update.
 * Centralizes the boilerplate for atomic bindings and caches JQuery objects for performance.
 *
 * @param el - The DOM element to associate with the effect.
 * @param source - The reactive or static value source.
 * @param updater - Function to apply the value to the DOM.
 * @param debugType - Type label for debug logging.
 */
export function registerReactiveEffect<T>(
  el: HTMLElement,
  source: ReactiveValue<T>,
  updater: ($el: JQuery, value: T) => void,
  debugType: string,
  $elArg?: JQuery
): void {
  const $el = $elArg ?? $(el);

  if (isReactive(source)) {
    const fx = effect(() => {
      const value = source.value;
      updater($el, value);
      debug.domUpdated($el, debugType, value);
    });
    registry.trackEffect(el, fx);
  } else {
    updater($el, source);
    debug.domUpdated($el, debugType, source);
  }
}
