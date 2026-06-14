/**
 * @module Form Binding
 *
 * Responsibility:
 * Orchestrates two-way reactive synchronization between complex state objects
 * and HTML Form elements, including nested property access and native validation.
 *
 * Design Intent:
 * Uses a centralized 'FormBinder' to manage the lifecycle of reactive lenses
 * and DOM observers, ensuring memory safety through integrated cleanup
 * registration and reference counting for shared fields.
 */

import {
  effect,
  lensFor,
  mergeLenses,
  type Paths,
  type PathValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import { Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { getOrCreateRootObserver } from '@/core/observer';
import { registry } from '@/core/registry';
import { markInternal } from '@/core/symbols';
import type { FormOptions, ValOptions } from '@/types';
import { normalizePath } from '@/utils';
import { bindVal } from './unified';

/**
 * Role: Internal registry entry for form fields.
 *
 * Logic: Reference Counting
 * Tracks multiple form controls (e.g., multiple radios for one name) bound
 * to the same property path to ensure lens atoms are only disposed when
 * the last associated control is removed from the DOM.
 *
 * @internal
 */
interface FieldEntry {
  /** The reactive lens atom providing access to a specific nested property. */
  atom: WritableAtom<unknown>;
  /** The unique name of the field derived from the `name` attribute. */
  name: string;
  /** Reference count for lifecycle management. */
  refCount: number;
}

/**
 * Role: Selector used for identifying form-associated elements and custom elements.
 * @internal
 */
const SELECTOR = 'input, select, textarea, [name]';

/**
 * Logic: Multi-checkbox Array Sync
 * Optimization: Uses an imperative loop to populate the Set in a single pass,
 * avoiding memory overhead and GC pressure from intermediate array allocations.
 *
 * @internal
 */
function getNextToggleValue(
  current: unknown,
  checked: boolean,
  val: string,
  isCheck: boolean
): unknown {
  if (!isCheck) return val;
  if (!Array.isArray(current)) return checked;

  const s = new Set(current.map(String));
  if (checked) s.add(val);
  else s.delete(val);
  return Array.from(s);
}

/**
 * Logic: Toggle State Resolution
 * Optimization: Replaces functional iteration with an imperative loop to allow
 * for early termination, reducing unnecessary string conversions.
 *
 * @internal
 */
function isToggleChecked(v: unknown, val: string, isCheck: boolean): boolean {
  if (!isCheck) return String(v) === val;
  return Array.isArray(v) ? v.some((item) => String(item) === val) : !!v;
}

/**
 * Role: Interception Proxy
 *
 * Design Intent:
 * Creates a lens that intercepts write operations to apply transformations
 * and trigger change callbacks without mutating the underlying base lens directly.
 *
 * @internal
 */
function createInterceptedLens<T extends object, U>(
  name: string,
  baseLens: WritableAtom<PathValue<T, Paths<T>>>,
  options: FormOptions<U>
): WritableAtom<unknown> {
  const { transform, onChange } = options;
  return new Proxy(baseLens, {
    get(target, prop) {
      if (prop === 'value') return target.value;
      const val = Reflect.get(target, prop, target);
      return typeof val === 'function' ? val.bind(target) : val;
    },
    set(target, prop, val) {
      if (prop === 'value') {
        let transformed = val;
        if (transform) {
          const res = Result.tryCatch(() => transform(name, val));
          if (Result.isErr(res)) {
            console.error(`[bindForm] Transform error in field "${name}":`, res.error);
          } else {
            transformed = res.value;
          }
        }
        target.value = transformed;
        if (onChange) {
          const res = Result.tryCatch(() => untracked(() => onChange(name, transformed)));
          if (Result.isErr(res)) {
            console.error(`[bindForm] onChange error in field "${name}":`, res.error);
          }
        }
        return true;
      }
      return Reflect.set(target, prop, val, target);
    },
  });
}

/**
 * Logic: Constraint Validation Bridge
 * Synchronizes reactive validation results with the browser's native
 * Constraint Validation API (`setCustomValidity`).
 *
 * @internal
 */
function syncValidationEffect(
  control: Element,
  name: string,
  atom: WritableAtom<unknown>,
  validate: (v: unknown) => string | boolean | undefined
) {
  return effect(() => {
    const res = Result.tryCatch(() => validate(atom.value));
    if (Result.isErr(res)) {
      console.error(`Validation error in field "${name}":`, res.error);
      (control as HTMLInputElement).setCustomValidity?.('Validation failed');
    } else {
      const val = res.value;
      const msg = typeof val === 'string' ? val : val === false ? 'Invalid' : '';
      (control as HTMLInputElement).setCustomValidity?.(msg);
    }
  });
}

/**
 * Logic: Toggle Value Synchronization
 * Synchronizes checkbox/radio states based on reactive atom updates.
 *
 * @internal
 */
function syncToggleEffect(
  el: HTMLInputElement,
  atom: WritableAtom<unknown>,
  val: string,
  isCheck: boolean
) {
  return effect(() => {
    const checked = isToggleChecked(atom.value, val, isCheck);
    if (el.checked !== checked) el.checked = checked;
  });
}

/**
 * Synchronizes an HTML `<form>` with a reactive state object.
 *
 * When to use:
 * - Recommended for synchronizing standard HTML forms with complex, nested
 *   reactive state objects.
 * - Suitable for scenarios requiring declarative validation integrated with
 *   browser-native APIs.
 *
 * Logic: Polymorphic Input
 * If an array of atoms is provided, they are merged via `mergeLenses`.
 * Later atoms in the array override properties with the same path from earlier atoms.
 *
 * @param form - The target form element to bind.
 * @param atom - A writable atom or an array of atoms providing the state.
 * @param options - Configuration for transformations, change callbacks, and validation.
 *
 * @example
 * ```typescript
 * const user = $.atom({ profile: { name: 'Alice' }, items: [] });
 *
 * $.bindForm($('form')[0], user, {
 *   validation: {
 *     'profile.name': (v) => v ? true : 'Name is required'
 *   },
 *   onChange: (path, val) => console.log(`${path} changed to ${val}`)
 * });
 * ```
 */
function getElementNameProperty(el: HTMLElement): string | undefined {
  if ('name' in el) {
    const value = (el as Record<string, unknown>).name;
    return value == null ? undefined : String(value);
  }
  return undefined;
}

export function bindForm<T extends object, U = unknown>(
  form: HTMLFormElement,
  atom: WritableAtom<T> | WritableAtom<unknown>[],
  options: FormOptions<U> = {}
): void {
  const targetAtom = Array.isArray(atom) ? mergeLenses(...atom) : atom;
  registry.cleanup(form);

  const entries = new Map<string, FieldEntry>();
  const names = new WeakMap<Element, string>();

  const unbindField = (el: Element, name: string): void => {
    const entry = entries.get(name);
    if (entry && --entry.refCount <= 0) {
      const disposableAtom = entry.atom;
      if (typeof disposableAtom.dispose === 'function') {
        disposableAtom.dispose();
      }
      entries.delete(name);
    }
    registry.cleanup(el);
  };

  const ensureField = (name: string): FieldEntry => {
    let entry = entries.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    const dotPath = normalizePath(name);
    const baseLens = lensFor(targetAtom)(dotPath as Paths<T>);
    const atom = createInterceptedLens(name, baseLens, options);

    entry = { atom, name, refCount: 1 };
    entries.set(name, entry);
    return entry;
  };

  const applyValidation = (
    control: HTMLFormElement['elements'][number],
    name: string,
    atom: WritableAtom<unknown>
  ): void => {
    const validate = options.validation?.[name];
    if (!validate) return;

    registry.trackEffect(control, syncValidationEffect(control, name, atom, validate));
  };

  const bindToggle = (
    el: HTMLInputElement,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void => {
    const handler = () => {
      atom.value = getNextToggleValue(atom.peek(), el.checked, val, isCheck);
    };

    markInternal(handler);
    $(el).on('change', handler);
    registry.onCleanup(el, () => $(el).off('change', handler));

    registry.trackEffect(el, syncToggleEffect(el, atom, val, isCheck));
  };

  const bindField = (el: Element): void => {
    if (!(el instanceof HTMLElement)) return;
    const name = el.getAttribute('name') || getElementNameProperty(el);
    if (!name) return;

    const control = el as HTMLElement & { name?: string; value?: string; type?: string };

    const oldName = names.get(control);
    if (oldName === name) return;

    if (oldName !== undefined) {
      registry.cleanup(control);
    }

    const entry = ensureField(name);
    names.set(control, name);

    registry.onCleanup(control, () => unbindField(control, name));

    if (
      control instanceof HTMLInputElement &&
      (control.type === 'radio' || control.type === 'checkbox')
    ) {
      bindToggle(control, entry.atom, control.value, control.type === 'checkbox');
    } else {
      const valOpts: ValOptions<unknown> = {};
      if (options.debounce !== undefined) valOpts.debounce = options.debounce;
      if (options.event !== undefined) valOpts.event = options.event;
      bindVal(control, entry.atom, valOpts);
    }

    applyValidation(control, name, entry.atom);
  };

  const bindSubtree = (el: Element): void => {
    if (el === form) {
      for (const control of form.elements) {
        bindField(control);
      }
    } else if (el.matches?.(SELECTOR)) {
      bindField(el);
    } else {
      const targets = el.querySelectorAll?.(SELECTOR);
      if (targets) {
        for (const target of targets) {
          bindField(target);
        }
      }
    }
  };

  bindSubtree(form);

  const rootObserver = getOrCreateRootObserver(form);
  const unsubAdded = rootObserver.onNodeAdded(SELECTOR, (el) => bindField(el));
  const unsubAttr = rootObserver.onAttributeChanged('name', (el) => {
    if (el.matches(SELECTOR)) {
      bindField(el);
    }
  });

  registry.onCleanup(form, () => {
    unsubAdded();
    unsubAttr();
  });
}
