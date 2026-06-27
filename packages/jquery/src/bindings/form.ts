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
  toggleValue: string,
  isCheck: boolean
): unknown {
  if (!isCheck) return toggleValue;
  if (!Array.isArray(current)) return checked;

  const toggledValueSet = new Set(current.map(String));
  if (checked) toggledValueSet.add(toggleValue);
  else toggledValueSet.delete(toggleValue);
  return Array.from(toggledValueSet);
}

/**
 * Logic: Toggle State Resolution
 * Optimization: Replaces functional iteration with an imperative loop to allow
 * for early termination, reducing unnecessary string conversions.
 *
 * @internal
 */
function isToggleChecked(currentValue: unknown, targetValue: string, isCheck: boolean): boolean {
  if (!isCheck) return String(currentValue) === targetValue;
  return Array.isArray(currentValue)
    ? currentValue.some((toggledItem) => String(toggledItem) === targetValue)
    : !!currentValue;
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
    get(target, propertyKey) {
      if (propertyKey === 'value') return target.value;
      const propertyValue = Reflect.get(target, propertyKey, target);
      return typeof propertyValue === 'function' ? propertyValue.bind(target) : propertyValue;
    },
    set(target, propertyKey, targetValue) {
      if (propertyKey === 'value') {
        let transformed = targetValue;
        if (transform) {
          const transformResult = Result.tryCatch(() => transform(name, targetValue));
          if (Result.isErr(transformResult)) {
            console.error(`[bindForm] Transform error in field "${name}":`, transformResult.error);
          } else {
            transformed = transformResult.value;
          }
        }
        target.value = transformed;
        if (onChange) {
          const onChangeResult = Result.tryCatch(() =>
            untracked(() => onChange(name, transformed))
          );
          if (Result.isErr(onChangeResult)) {
            console.error(`[bindForm] onChange error in field "${name}":`, onChangeResult.error);
          }
        }
        return true;
      }
      return Reflect.set(target, propertyKey, targetValue, target);
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
    const validationResult = Result.tryCatch(() => validate(atom.value));
    if (Result.isErr(validationResult)) {
      console.error(`Validation error in field "${name}":`, validationResult.error);
      (control as HTMLInputElement).setCustomValidity?.('Validation failed');
    } else {
      const validationResultValue = validationResult.value;
      const validationMessage =
        typeof validationResultValue === 'string'
          ? validationResultValue
          : validationResultValue === false
            ? 'Invalid'
            : '';
      (control as HTMLInputElement).setCustomValidity?.(validationMessage);
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
  toggleElement: HTMLInputElement,
  atom: WritableAtom<unknown>,
  value: string,
  isCheck: boolean
) {
  return effect(() => {
    const checked = isToggleChecked(atom.value, value, isCheck);
    if (toggleElement.checked !== checked) toggleElement.checked = checked;
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
 *   onChange: (path, value) => console.log(`${path} changed to ${value}`)
 * });
 * ```
 */
function getElementNameProperty(element: HTMLElement): string | undefined {
  if ('name' in element) {
    const nameValue = (element as Record<string, unknown>).name;
    return nameValue == null ? undefined : String(nameValue);
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

  const unbindField = (element: Element, name: string): void => {
    const entry = entries.get(name);
    if (entry && --entry.refCount <= 0) {
      const disposableAtom = entry.atom;
      if (typeof disposableAtom.dispose === 'function') {
        disposableAtom.dispose();
      }
      entries.delete(name);
    }
    registry.cleanup(element);
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
    element: HTMLInputElement,
    atom: WritableAtom<unknown>,
    value: string,
    isCheck: boolean
  ): void => {
    const handler = () => {
      atom.value = getNextToggleValue(atom.peek(), element.checked, value, isCheck);
    };

    markInternal(handler);
    $(element).on('change', handler);
    registry.onCleanup(element, () => $(element).off('change', handler));

    registry.trackEffect(element, syncToggleEffect(element, atom, value, isCheck));
  };

  const bindField = (element: Element): void => {
    if (!(element instanceof HTMLElement)) return;
    const name = element.getAttribute('name') || getElementNameProperty(element);
    if (!name) return;

    const control = element as HTMLElement & { name?: string; value?: string; type?: string };

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
      const valueOptions: ValOptions<unknown> = {};
      if (options.debounce !== undefined) valueOptions.debounce = options.debounce;
      if (options.event !== undefined) valueOptions.event = options.event;
      bindVal(control, entry.atom, valueOptions);
    }

    applyValidation(control, name, entry.atom);
  };

  const bindSubtree = (element: Element): void => {
    if (element === form) {
      for (const control of form.elements) {
        bindField(control);
      }
    } else if (element.matches?.(SELECTOR)) {
      bindField(element);
    } else {
      const targets = element.querySelectorAll?.(SELECTOR);
      if (targets) {
        for (const target of targets) {
          bindField(target);
        }
      }
    }
  };

  bindSubtree(form);

  const rootObserver = getOrCreateRootObserver(form);
  const unsubscribeNodeAdded = rootObserver.onNodeAdded(SELECTOR, (element) => bindField(element));
  const unsubscribeAttributeChanged = rootObserver.onAttributeChanged('name', (element) => {
    if (element.matches(SELECTOR)) {
      bindField(element);
    }
  });

  registry.onCleanup(form, () => {
    unsubscribeNodeAdded();
    unsubscribeAttributeChanged();
  });
}
