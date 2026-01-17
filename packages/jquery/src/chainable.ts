import $ from 'jquery';
import { effect, batch } from '@but212/atom-effect';
import { registry } from './registry';
import { debug } from './debug';
import { isReactive, getValue } from './utils';
import type { ReactiveValue, WritableAtom, ValOptions } from './types';
import { createInputBindingState, type InputBindingState } from './types';

/**
 * Updates element text content.
 * @param source - Atom or static value.
 * @param formatter - Optional function to format the value.
 */
$.fn.atomText = function<T>(
  source: ReactiveValue<T>,
  formatter?: (v: T) => string
): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(source)) {
      const fx = effect(() => {
        const value = getValue(source);
        const text = formatter ? formatter(value) : String(value ?? '');
        $el.text(text);
        debug.domUpdated($el, 'text', text);
      });
      registry.trackEffect(this, fx);
    } else {
      const text = formatter ? formatter(source) : String(source ?? '');
      $el.text(text);
    }
  });
};

/**
 * Updates element inner HTML.
 * @param source - Atom or static value.
 */
$.fn.atomHtml = function(source: ReactiveValue<string>): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(source)) {
      const fx = effect(() => {
        const html = String(getValue(source) ?? '');
        $el.html(html);
        debug.domUpdated($el, 'html', html);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.html(String(source ?? ''));
    }
  });
};

/**
 * Toggles a CSS class based on boolean value.
 * @param className - The class to toggle.
 * @param condition - Boolean source value.
 */
$.fn.atomClass = function(
  className: string,
  condition: ReactiveValue<boolean>
): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(condition)) {
      const fx = effect(() => {
        const value = Boolean(getValue(condition));
        $el.toggleClass(className, value);
        debug.domUpdated($el, `class.${className}`, value);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.toggleClass(className, Boolean(condition));
    }
  });
};

/**
 * Updates a CSS style property.
 * @param prop - CSS property name.
 * @param source - Value source.
 * @param unit - Optional unit (e.g., 'px', 'em').
 */
$.fn.atomCss = function(
  prop: string,
  source: ReactiveValue<string | number>,
  unit?: string
): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(source)) {
      const fx = effect(() => {
        const value = getValue(source);
        const cssValue = unit ? `${value}${unit}` : value;
        $el.css(prop, cssValue);
        debug.domUpdated($el, `css.${prop}`, cssValue);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.css(prop, unit ? `${source}${unit}` : source);
    }
  });
};

/**
 * Updates an HTML attribute.
 * @param name - Attribute name.
 * @param source - Attribute value.
 */
$.fn.atomAttr = function(
  name: string,
  source: ReactiveValue<string | boolean | null>
): JQuery {
  return this.each(function() {
    const $el = $(this);

    const applyAttr = (value: string | boolean | null) => {
      if (value === null || value === undefined || value === false) {
        $el.removeAttr(name);
      } else if (value === true) {
        $el.attr(name, name);
      } else {
        $el.attr(name, String(value));
      }
      debug.domUpdated($el, `attr.${name}`, value);
    };

    if (isReactive(source)) {
      const fx = effect(() => applyAttr(getValue(source)));
      registry.trackEffect(this, fx);
    } else {
      applyAttr(source);
    }
  });
};

/**
 * Updates a DOM property (e.g., checked, selected, value).
 * @param name - Property name.
 * @param source - Property value.
 */
$.fn.atomProp = function<T extends string | number | boolean | null | undefined>(
  name: string,
  source: ReactiveValue<T>
): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(source)) {
      const fx = effect(() => {
        const value = getValue(source);
        $el.prop(name, value);
        debug.domUpdated($el, `prop.${name}`, value);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.prop(name, source);
    }
  });
};

/**
 * Shows element when condition is true.
 * @param condition - Boolean source value.
 */
$.fn.atomShow = function(condition: ReactiveValue<boolean>): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(condition)) {
      const fx = effect(() => {
        const value = Boolean(getValue(condition));
        $el.toggle(value);
        debug.domUpdated($el, 'show', value);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.toggle(Boolean(condition));
    }
  });
};

/**
 * Hides element when condition is true.
 * @param condition - Boolean source value.
 */
$.fn.atomHide = function(condition: ReactiveValue<boolean>): JQuery {
  return this.each(function() {
    const $el = $(this);

    if (isReactive(condition)) {
      const fx = effect(() => {
        const value = !getValue(condition);
        $el.toggle(value);
        debug.domUpdated($el, 'hide', !value);
      });
      registry.trackEffect(this, fx);
    } else {
      $el.toggle(!condition);
    }
  });
};

/**
 * Two-way binding for input values.
 * Uses InputBindingState for explicit lifecycle management.
 * Supports IME (Input Method Editor) for CJK languages.
 */
$.fn.atomVal = function<T>(
  atom: WritableAtom<T>,
  options: ValOptions<T> = {}
): JQuery {
  const {
    debounce: debounceMs,
    event = 'input',
    parse = (v: string) => v as unknown as T,
    format = (v: T) => String(v ?? '')
  } = options;

  return this.each(function() {
    const $el = $(this);
    
    // Unified state context - explicit lifecycle phases
    const state: InputBindingState = createInputBindingState();

    // Phase transition: idle → composing
    const onCompositionStart = () => {
      state.phase = 'composing';
    };

    // Phase transition: composing → idle, then sync
    const onCompositionEnd = () => {
      state.phase = 'idle';
      syncAtomFromDom();
    };

    $el.on('compositionstart', onCompositionStart);
    $el.on('compositionend', onCompositionEnd);

    const onFocus = () => { state.hasFocus = true; };
    const onBlur = () => {
      state.hasFocus = false;
      // Force formatting on blur to ensure clean display
      const formatted = format(atom.value);
      if ($el.val() !== formatted) {
        $el.val(formatted);
      }
    };

    $el.on('focus', onFocus);
    $el.on('blur', onBlur);

    // Core sync: DOM → Atom
    const syncAtomFromDom = () => {
      // Guard: only sync when idle
      if (state.phase !== 'idle') return;
      
      state.phase = 'syncing-to-atom';
      batch(() => {
        atom.value = parse($el.val() as string);
      });
      state.phase = 'idle';
    };

    const onInput = () => {
      // Guard: skip during composition or sync phases
      if (state.phase !== 'idle') return;

      if (debounceMs) {
        if (state.timeoutId) clearTimeout(state.timeoutId);
        state.timeoutId = window.setTimeout(syncAtomFromDom, debounceMs);
      } else {
        syncAtomFromDom();
      }
    };

    $el.on(event, onInput);
    $el.on('change', onInput);
    
    // Core sync: Atom → DOM
    const fx = effect(() => {
      const formatted = format(atom.value);
      const currentVal = $el.val() as string;
      
      // Update only if value differs
      if (currentVal !== formatted) {
        // Don't interrupt user input if parsed value matches
        if (state.hasFocus && parse(currentVal) === atom.value) {
          return;
        }
        
        state.phase = 'syncing-to-dom';
        $el.val(formatted);
        debug.domUpdated($el, 'val', formatted);
        state.phase = 'idle';
      }
    });

    registry.trackEffect(this, fx);

    registry.trackCleanup(this, () => {
      $el.off(event, onInput);
      $el.off('change', onInput);
      $el.off('compositionstart', onCompositionStart);
      $el.off('compositionend', onCompositionEnd);
      $el.off('focus', onFocus);
      $el.off('blur', onBlur);
      if (state.timeoutId) clearTimeout(state.timeoutId);
    });
  });
};

/**
 * Two-way binding for checkbox/radio checked state.
 */
$.fn.atomChecked = function(atom: WritableAtom<boolean>): JQuery {
  return this.each(function() {
    const $el = $(this);
    
    let isUpdatingFromAtom = false;

    // DOM → Atom
    const handler = () => {
      if (isUpdatingFromAtom) return;
      
      batch(() => {
        atom.value = $el.prop('checked');
      });
    };
    
    $el.on('change', handler);
    registry.trackCleanup(this, () => $el.off('change', handler));

    // Atom → DOM
    const fx = effect(() => {
      isUpdatingFromAtom = true;
      $el.prop('checked', atom.value);
      debug.domUpdated($el, 'checked', atom.value);
      isUpdatingFromAtom = false;
    });
    registry.trackEffect(this, fx);
  });
};

/**
 * Binds an event handler that automatically runs within a batch.
 */
$.fn.atomOn = function(
  event: string,
  handler: (e: JQuery.Event) => void
): JQuery {
  return this.each(function() {
    const $el = $(this);

    const wrappedHandler = function(this: HTMLElement, e: JQuery.Event) {
      batch(() => handler.call(this, e));
    };

    $el.on(event, wrappedHandler);
    registry.trackCleanup(this, () => $el.off(event, wrappedHandler));
  });
};

/**
 * Removes all atom bindings and cleanup effects from the elements.
 */
$.fn.atomUnbind = function(): JQuery {
  return this.each(function() {
    registry.cleanupTree(this);
  });
};
