import {
  effect,
  lensFor,
  mergeLenses,
  type Paths,
  type PathValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import $ from 'jquery';
import { registry } from '@/core/registry';
import { INTERNAL_HANDLER } from '@/core/symbols';
import type { FormOptions } from '@/types';
import { normalizePath } from '@/utils';
import { bindVal } from './unified';

/**
 * Represents an internal entry for a specific form field and its associated lens.
 *
 * Logic: Reference Counting
 * Tracks multiple form controls bound to the same property path to ensure
 * lens atoms are only disposed when the last associated control is removed.
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
 * Selector used for identifying form-associated elements and custom elements.
 * @internal
 */
const SELECTOR = 'input, select, textarea, [name]';

/**
 * Logic: Multi-checkbox Array Sync
 * Optimization: High-performance set population
 * Uses an imperative loop to populate the Set in a single pass, avoiding the
 * memory overhead and GC pressure of intermediate array allocations from `.map()`.
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

  const s = new Set<string>();
  const len = current.length;
  for (let i = 0; i < len; i++) {
    s.add(String(current[i]));
  }

  if (checked) {
    s.add(val);
  } else {
    s.delete(val);
  }
  return Array.from(s);
}

/**
 * Logic: Toggle State Resolution
 * Optimization: Low-overhead early exit
 * Replaces functional iteration with an imperative loop to allow for early
 * termination once a match is found, reducing unnecessary string conversions.
 *
 * @internal
 */
function isToggleChecked(v: unknown, val: string, isCheck: boolean): boolean {
  if (!isCheck) return String(v) === val;
  if (!Array.isArray(v)) return !!v;

  const len = v.length;
  for (let i = 0; i < len; i++) {
    if (String(v[i]) === val) return true;
  }
  return false;
}

/**
 * Creates a lens that intercepts write operations to apply transformations
 * and trigger change callbacks.
 *
 * Logic: Interception Proxy
 * Uses Object.create to inherit ReadonlyAtom/Disposable methods while
 * overriding the .value setter for custom hooks.
 *
 * @internal
 */
function createInterceptedLens<T extends object>(
  name: string,
  baseLens: WritableAtom<PathValue<T, Paths<T>>>,
  options: FormOptions<unknown>
): WritableAtom<unknown> {
  const { transform, onChange } = options;
  const intercepted = Object.create(baseLens);

  Object.defineProperty(intercepted, 'value', {
    get() {
      return baseLens.value;
    },
    set(val: unknown) {
      let transformed = val;
      try {
        transformed = transform ? transform(name, val) : val;
      } catch (err) {
        console.error(`[bindForm] Transform error in field "${name}":`, err);
      }

      baseLens.value = transformed as PathValue<T, Paths<T>>;

      if (onChange) {
        try {
          untracked(() => onChange(name, transformed));
        } catch (err) {
          console.error(`[bindForm] onChange error in field "${name}":`, err);
        }
      }
    },
  });

  return intercepted as WritableAtom<unknown>;
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
    try {
      const res = validate(atom.value);
      let msg = '';
      if (typeof res === 'string') {
        msg = res;
      } else if (res === false) {
        msg = 'Invalid';
      }
      (control as HTMLInputElement).setCustomValidity?.(msg);
    } catch (err) {
      console.error(`Validation error in field "${name}":`, err);
      (control as HTMLInputElement).setCustomValidity?.('Validation failed');
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
 * Orchestrates the synchronization between a complex reactive object and an HTML Form.
 *
 * Logic: Hybrid Discovery
 * Combines initial scanning with a MutationObserver to maintain bindings for
 * dynamically added elements or attribute changes.
 *
 * @internal
 */
class FormBinder<T extends object> {
  /** A map of field names to their corresponding reactive entries. */
  private entries = new Map<string, FieldEntry>();
  /** A mapping of DOM elements to their current 'name' identifier for reconciliation. */
  private names = new WeakMap<Element, string>();

  constructor(
    /** The target form element. */
    private form: HTMLFormElement,
    /** The writable atom containing the form's state object. */
    private atom: WritableAtom<T>,
    /** Configuration for transformations and change callbacks. */
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  /** Initializes the binder by scanning the form and starting the mutation observer. */
  private init(): void {
    this.bindSubtree(this.form);
    this.observe();
  }

  /**
   * Scans a DOM subtree for form controls and establishes reactive bindings.
   *
   * Optimization: Loop invariant hoisting
   * Caches collection lengths and uses guard clauses to minimize branching
   * in deep subtree scans.
   */
  public bindSubtree(el: Element): void {
    if (el === this.form) {
      const elements = this.form.elements;
      const len = elements.length;
      for (let i = 0; i < len; i++) {
        this.bindField(elements[i]! as Element);
      }
      return;
    }

    if (el.matches?.(SELECTOR)) {
      this.bindField(el);
      return;
    }

    const targets = (el as HTMLElement).querySelectorAll?.(SELECTOR);
    if (targets) {
      const len = targets.length;
      for (let i = 0; i < len; i++) {
        this.bindField(targets[i]! as Element);
      }
    }
  }

  /**
   * Establishes a two-way binding for an individual form control.
   *
   * Logic: Field Identification
   * Identification is based on the control's `name` attribute. If the name
   * changes, the previous binding is cleaned up.
   *
   * Optimization: Minimized Map lookups
   * Reduces WeakMap access from 3 to 1 in the hot path of field reconciliation.
   */
  private bindField(el: Element): void {
    const control = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = control.name || el.getAttribute('name');
    if (!name) return;

    const oldName = this.names.get(control);
    if (oldName === name) return;

    if (oldName !== undefined) {
      registry.cleanup(control);
    }

    const entry = this.ensureField(name);
    this.names.set(control, name);

    registry.onCleanup(control, () => this.unbindField(control, name));

    if (
      control instanceof HTMLInputElement &&
      (control.type === 'radio' || control.type === 'checkbox')
    ) {
      this.bindToggle(control, entry.atom, control.value, control.type === 'checkbox');
    } else {
      bindVal(control, entry.atom, this.options);
    }

    this.applyValidation(control, name, entry.atom);
  }

  private applyValidation(
    control: HTMLFormElement['elements'][number],
    name: string,
    atom: WritableAtom<unknown>
  ): void {
    const validate = this.options.validation?.[name];
    if (!validate) return;

    registry.trackEffect(control, syncValidationEffect(control as Element, name, atom, validate));
  }

  private bindToggle(
    el: HTMLInputElement,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const handler = () => {
      atom.value = getNextToggleValue(atom.peek(), el.checked, val, isCheck);
    };

    (handler as unknown as { [INTERNAL_HANDLER]: boolean })[INTERNAL_HANDLER] = true;
    $(el).on('change', handler);
    registry.onCleanup(el, () => $(el).off('change', handler));

    registry.trackEffect(el, syncToggleEffect(el, atom, val, isCheck));
  }

  /**
   * Retrieves or creates a reactive entry for a specific field name.
   *
   * Logic: Path Transformation
   * Flat HTML 'name' attributes are converted into dot-separated paths
   * compatible with the structural sharing engine.
   */
  private ensureField(name: string): FieldEntry {
    let entry = this.entries.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    const dotPath = normalizePath(name);
    const baseLens = lensFor(this.atom)(dotPath as Paths<T>);
    const atom = createInterceptedLens(name, baseLens, this.options);

    entry = { atom, name, refCount: 1 };
    this.entries.set(name, entry);
    return entry;
  }

  private unbindField(el: Element, name: string): void {
    const entry = this.entries.get(name);
    if (entry && --entry.refCount <= 0) {
      const disposableAtom = entry.atom as Partial<{ dispose: () => void }>;
      if (typeof disposableAtom.dispose === 'function') {
        disposableAtom.dispose();
      }
      this.entries.delete(name);
    }
    registry.cleanup(el);
  }

  /**
   * Monitors the form for structural changes using a MutationObserver.
   *
   * Optimization: Numeric constant comparison
   * Uses numeric constants for `nodeType` checks to avoid property access overhead
   * during rapid DOM mutations.
   */
  private observe(): void {
    const observer = new MutationObserver((ms) => {
      const mLen = ms.length;
      for (let i = 0; i < mLen; i++) {
        const m = ms[i]!;
        if (m.type === 'childList') {
          const added = m.addedNodes;
          const jLen = added.length;
          for (let j = 0; j < jLen; j++) {
            const node = added[j]!;
            if (node.nodeType === 1) {
              // Node.ELEMENT_NODE
              this.bindSubtree(node as Element);
            }
          }
        } else if (m.attributeName === 'name') {
          this.bindSubtree(m.target as Element);
        }
      }
    });

    observer.observe(this.form, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['name'],
    });

    registry.onCleanup(this.form, () => observer.disconnect());
  }
}

/**
 * Establishes a two-way reactive binding between a `<form>` and an object atom.
 *
 * When to use:
 * - Recommended for synchronizing standard HTML forms with complex, nested
 *   reactive state objects.
 * - Suitable for scenarios requiring declarative validation integrated with
 *   browser-native APIs.
 *
 * @param form - The target form element to bind.
 * @param atom - A writable atom or an array of atoms.
 *               Logic: Polymorphic Input
 *               If an array is provided, it is merged via `mergeLenses`.
 *               Note: When merging, later atoms in the array override
 *               properties with the same path from earlier atoms.
 * @param options - Configuration for transformations and reactive validation.
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
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T> | WritableAtom<unknown>[],
  options: FormOptions<unknown> = {}
): void {
  const targetAtom = Array.isArray(atom) ? mergeLenses(...atom) : atom;
  registry.cleanup(form);
  new FormBinder(form, targetAtom as WritableAtom<T>, options);
}
