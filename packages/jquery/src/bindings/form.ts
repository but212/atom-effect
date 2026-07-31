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
  BRAND,
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
 * Role: Interception Wrapper Class
 *
 * Design Intent:
 * Direct WritableAtom implementation delegating to baseLens, avoiding Proxy overhead
 * and repeated .bind() dynamic allocations on hot path.
 *
 * @internal
 */
class InterceptedLens<T extends object, U> implements WritableAtom<unknown> {
  readonly #base: WritableAtom<PathValue<T, Paths<T>>>;
  readonly #name: string;
  readonly #transform: FormOptions<U>['transform'];
  readonly #onChange: FormOptions<U>['onChange'];

  constructor(
    name: string,
    baseLens: WritableAtom<PathValue<T, Paths<T>>>,
    options: FormOptions<U>
  ) {
    this.#base = baseLens;
    this.#name = name;
    this.#transform = options.transform;
    this.#onChange = options.onChange;
  }

  get value(): unknown {
    return this.#base.value;
  }

  set value(targetValue: unknown) {
    let transformed = targetValue;
    const transform = this.#transform;
    if (transform) {
      const transformResult = Result.tryCatch(() => transform(this.#name, targetValue));
      if (Result.isErr(transformResult)) {
        console.error(
          `[bindForm] Transform error in field "${this.#name}":`,
          transformResult.error
        );
      } else {
        transformed = transformResult.value;
      }
    }
    this.#base.value = transformed as PathValue<T, Paths<T>>;
    const onChange = this.#onChange;
    if (onChange) {
      const onChangeResult = Result.tryCatch(() =>
        untracked(() => onChange(this.#name, transformed))
      );
      if (Result.isErr(onChangeResult)) {
        console.error(`[bindForm] onChange error in field "${this.#name}":`, onChangeResult.error);
      }
    }
  }

  peek(): unknown {
    return this.#base.peek();
  }

  subscribe(listener: unknown): () => void {
    // Cast to WritableAtom<unknown> to call subscribe
    return (this.#base as WritableAtom<unknown>).subscribe(
      listener as (newValue?: unknown, oldValue?: unknown) => void
    );
  }

  subscriberCount(): number {
    return this.#base.subscriberCount();
  }

  dispose(): void {
    this.#base.dispose();
  }

  // --- ReactiveNodeBase & Dependency Delegation ---
  get id(): number {
    return this.#base.id;
  }
  get version(): number {
    return this.#base.version;
  }
  get flags(): number {
    return this.#base.flags;
  }
  get _lastSeenEpoch(): number {
    return this.#base._lastSeenEpoch;
  }
  get isComputed(): boolean {
    return this.#base.isComputed;
  }
  get isRejected(): boolean {
    return (this.#base as unknown as { isRejected: boolean }).isRejected ?? false;
  }
  get hasError(): boolean {
    return this.#base.hasError;
  }
  get [BRAND](): number {
    return Reflect.get(this.#base, BRAND) as number;
  }
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

function getElementNameProperty(element: HTMLElement): string | undefined {
  if ('name' in element) {
    const nameValue = (element as Record<string, unknown>).name;
    return nameValue == null ? undefined : String(nameValue);
  }
  return undefined;
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
 * @param form The target form element to bind.
 * @param atom A writable atom or an array of atoms providing the state.
 * @param options Configuration for transformations, change callbacks, and validation.
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
    const entry = entries.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    const dotPath = normalizePath(name);
    const baseLens = (lensFor(targetAtom) as (path: string) => WritableAtom<unknown>)(dotPath);
    const atom = new InterceptedLens(
      name,
      baseLens as WritableAtom<PathValue<T, Paths<T>>>,
      options
    );

    const newEntry: FieldEntry = {
      atom: atom as unknown as WritableAtom<unknown>,
      name,
      refCount: 1,
    };
    entries.set(name, newEntry);
    return newEntry;
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

    const control = element as HTMLElement & {
      name?: string;
      value?: string;
      type?: string;
    };

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
