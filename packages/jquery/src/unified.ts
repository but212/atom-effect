import { effect } from '@but212/atom-effect';
import $ from 'jquery';
import { debug } from './debug';
import { registerReactiveEffect } from './effect-factory';
import { applyInputBinding } from './input-binding';
import { registry } from './registry';
import type {
  BindingContext,
  BindingOptions,
  CssValue,
  ReactiveValue,
  ValOptions,
  WritableAtom,
} from './types';
import { createInputBindingState } from './types';

// ============================================================================
// One-Way Binding Handlers (Atom → DOM)
// ============================================================================

function bindText<T>(ctx: BindingContext, value: ReactiveValue<T>): void {
  registerReactiveEffect(ctx.el, value, (val) => ctx.$el.text(String(val ?? '')), 'text');
}

function bindHtml(ctx: BindingContext, value: ReactiveValue<string>): void {
  registerReactiveEffect(ctx.el, value, (val) => ctx.$el.html(String(val ?? '')), 'html');
}

function bindClass(ctx: BindingContext, classMap: Record<string, ReactiveValue<boolean>>): void {
  for (const [className, condition] of Object.entries(classMap)) {
    registerReactiveEffect(
      ctx.el,
      condition,
      (val) => ctx.$el.toggleClass(className, Boolean(val)),
      `class.${className}`
    );
  }
}

function bindCss(ctx: BindingContext, cssMap: Record<string, CssValue>): void {
  for (const [prop, value] of Object.entries(cssMap)) {
    if (Array.isArray(value)) {
      const [source, unit] = value;
      registerReactiveEffect(
        ctx.el,
        source,
        (val) => ctx.$el.css(prop, `${val}${unit}`),
        `css.${prop}`
      );
    } else {
      registerReactiveEffect(
        ctx.el,
        value,
        (val) => ctx.$el.css(prop, val as string | number),
        `css.${prop}`
      );
    }
  }
}

function bindAttr(
  ctx: BindingContext,
  attrMap: Record<string, ReactiveValue<string | boolean | null>>
): void {
  for (const [name, value] of Object.entries(attrMap)) {
    const applyAttr = (v: string | boolean | null | undefined) => {
      if (v === null || v === undefined || v === false) {
        ctx.$el.removeAttr(name);
      } else if (v === true) {
        ctx.$el.attr(name, name);
      } else {
        ctx.$el.attr(name, String(v));
      }
    };

    registerReactiveEffect(ctx.el, value, applyAttr, `attr.${name}`);
  }
}

function bindProp<T extends string | number | boolean | null | undefined>(
  ctx: BindingContext,
  propMap: Record<string, ReactiveValue<T>>
): void {
  for (const [name, value] of Object.entries(propMap)) {
    registerReactiveEffect(ctx.el, value, (val) => ctx.$el.prop(name, val), `prop.${name}`);
  }
}

function bindShow(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(ctx.el, condition, (val) => ctx.$el.toggle(Boolean(val)), 'show');
}

function bindHide(ctx: BindingContext, condition: ReactiveValue<boolean>): void {
  registerReactiveEffect(ctx.el, condition, (val) => ctx.$el.toggle(!val), 'hide');
}

/**
 * Two-way value binding with full feature parity to $.fn.atomVal.
 * Supports parse/format options, debouncing, IME composition, and focus-aware updates.
 */
function bindVal<T>(
  ctx: BindingContext,
  valConfig: WritableAtom<T> | [atom: WritableAtom<T>, options: ValOptions<T>]
): void {
  const atom = Array.isArray(valConfig) ? valConfig[0] : valConfig;
  const options = Array.isArray(valConfig) ? valConfig[1] : {};

  const { effect: fxFn, cleanup } = applyInputBinding(ctx.$el, atom, options);
  const fx = effect(fxFn);

  registry.trackEffect(ctx.el, fx);
  ctx.trackCleanup(cleanup);
}

function bindChecked(ctx: BindingContext, atom: WritableAtom<boolean>): void {
  const state = createInputBindingState();

  // DOM → Atom
  const handler = () => {
    if (state.phase !== 'idle') return;
    atom.value = !!ctx.$el.prop('checked');
  };

  ctx.$el.on('change', handler);
  ctx.trackCleanup(() => ctx.$el.off('change', handler));

  // Atom → DOM
  const fx = effect(() => {
    state.phase = 'syncing-to-dom';
    const val = !!atom.value;
    ctx.$el.prop('checked', val);
    debug.domUpdated(ctx.$el, 'checked', val);
    state.phase = 'idle';
  });
  registry.trackEffect(ctx.el, fx);
}

// ============================================================================
// Event Binding Handler
// ============================================================================

function bindEvents(
  ctx: BindingContext,
  eventMap: Record<string, (e: JQuery.Event) => void>
): void {
  for (const [eventName, handler] of Object.entries(eventMap)) {
    const wrapped = function (this: HTMLElement, e: JQuery.Event) {
      handler.call(this, e);
    };
    ctx.$el.on(eventName, wrapped);
    ctx.trackCleanup(() => ctx.$el.off(eventName, wrapped));
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Extends jQuery with atom-based data binding capabilities.
 *
 * This plugin synchronizes DOM element states (text, html, classes, styles, etc.)
 * with reactive atoms. Handlers are modular and focused for maintainability.
 */
$.fn.atomBind = function <T extends string | number | boolean | null | undefined>(
  options: BindingOptions<T>
): JQuery {
  return this.each(function () {
    const $el = $(this);

    // Build binding context
    const ctx: BindingContext = {
      $el,
      el: this,
      effects: [], // No longer used for registration, but kept for type compatibility
      trackCleanup: (fn) => registry.trackCleanup(this, fn),
    };

    // Apply bindings through focused handlers
    if (options.text !== undefined) bindText(ctx, options.text);
    if (options.html !== undefined) bindHtml(ctx, options.html);
    if (options.class) bindClass(ctx, options.class);
    if (options.css) bindCss(ctx, options.css);
    if (options.attr) bindAttr(ctx, options.attr);
    if (options.prop) bindProp(ctx, options.prop);
    if (options.show !== undefined) bindShow(ctx, options.show);
    if (options.hide !== undefined) bindHide(ctx, options.hide);
    if (options.val !== undefined) bindVal(ctx, options.val);
    if (options.checked !== undefined) bindChecked(ctx, options.checked);
    if (options.on) bindEvents(ctx, options.on);
  });
};
