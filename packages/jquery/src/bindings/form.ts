import {
  atomLens,
  effect,
  type Paths,
  type PathValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import { Option, Result } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { registry } from '@/core/registry';
import { INTERNAL_HANDLER } from '@/core/symbols';
import type { FormOptions } from '@/types';
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
 * Orchestrates the synchronization between a complex reactive object and an HTML Form.
 *
 * This class implements a two-way binding system that maps form controls (via `name`
 * attributes) to nested properties of a source atom using lenses. It ensures
 * that the DOM and the reactive state remain consistent even as the form structure
 * changes dynamically.
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

  /** A flat list of entries maintained for efficient iteration. */
  private entryList: FieldEntry[] = [];

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
   * @param el - The root element of the subtree to scan.
   */
  public bindSubtree(el: Element): void {
    // Optimization: Use native form.elements for the root form, otherwise fallback to querySelectorAll.
    const targets =
      el === this.form
        ? Array.from(this.form.elements)
        : el.matches?.(SELECTOR)
          ? [el]
          : Array.from((el as HTMLElement).querySelectorAll?.(SELECTOR) || []);

    targets.forEach((target) => this.bindField(target as Element));
  }

  /**
   * Establishes a two-way binding for an individual form control.
   *
   * Logic: Field Identification
   * Identification is based on the control's `name` attribute. If the name attribute
   * changes, the previous binding is cleaned up and a new lens is established.
   *
   * @param el - The form control element to bind.
   */
  private bindField(el: Element): void {
    const control = el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

    Option.map(Option.fromNullable(control.name || el.getAttribute('name')), (name: string) => {
      // Logic: Identity Reconciliation
      Option.map(Option.fromNullable(this.names.get(control)), (oldName: string) => {
        if (oldName !== name) registry.cleanup(control);
      });

      if (this.names.has(control) && this.names.get(control) === name) return;

      const entry = this.ensureField(name);
      this.names.set(control, name);

      // Logic: Resource Cleanup
      // Registers a cleanup hook to release the field reference and associated
      // lens effects when the element is disconnected.
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
    });
  }

  /**
   * Integrates declarative validation for a specific form control.
   *
   * Logic: Constraint Validation Bridge
   * Maps validation results from the reactive schema to the browser's native
   * Constraint Validation API (`setCustomValidity`).
   */
  private applyValidation(
    control: HTMLFormElement['elements'][number],
    name: string,
    atom: WritableAtom<unknown>
  ): void {
    const validate = this.options.validation?.[name];
    if (!validate) return;

    registry.trackEffect(
      control,
      effect(() => {
        const value = atom.value;
        const res = Result.tryCatch(() => validate(value));

        Result.match(res, {
          ok: (errorMsg) => {
            const msg = Option.unwrapOr(
              Option.map(
                Option.fromNullable(errorMsg as string | boolean | undefined),
                (res: string | boolean) => (typeof res === 'string' ? res : res ? '' : 'Invalid')
              ),
              ''
            );
            (control as HTMLInputElement).setCustomValidity?.(msg);
          },
          err: (err) => {
            console.error(`Validation error in field "${name}":`, err);
            (control as HTMLInputElement).setCustomValidity?.('Validation failed');
          },
        });
      })
    );
  }

  /**
   * Specifically handles two-way binding for toggleable controls (checkboxes and radios).
   *
   * Logic: Multi-checkbox Arrays
   * For checkboxes bound to an array, synchronization is performed by maintaining
   * a Set of values, ensuring order-independent updates and preventing
   * duplicate entries during reactive flushes.
   */
  private bindToggle(
    el: HTMLInputElement,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const handler = () => {
      const curr = atom.peek();

      if (isCheck && Array.isArray(curr)) {
        const s = new Set(curr.map(String));
        el.checked ? s.add(val) : s.delete(val);
        atom.value = Array.from(s);
      } else {
        atom.value = isCheck ? el.checked : val;
      }
    };

    // Logic: Batch Coalescing
    // Marks the handler as an internal AEJ handler to prevent redundant
    // wrapping during multiple patch cycles, maintaining a flat execution stack.
    (handler as unknown as { [INTERNAL_HANDLER]: boolean })[INTERNAL_HANDLER] = true;
    $(el).on('change', handler);
    registry.onCleanup(el, () => $(el).off('change', handler));

    registry.trackEffect(
      el,
      effect(() => {
        const v = atom.value;
        const checked = isCheck
          ? Array.isArray(v)
            ? v.some((x) => String(x) === val)
            : !!v
          : String(v) === val;
        if (el.checked !== checked) el.checked = checked;
      })
    );
  }

  /**
   * Retrieves or creates a reactive entry for a specific field name.
   *
   * Logic: Path Transformation
   * Flat HTML 'name' attributes (e.g., 'user.profile[0].name') are converted
   * into dot-separated paths compatible with the `atomLens` structural sharing engine.
   */
  private ensureField(name: string): FieldEntry {
    let entry = this.entries.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    const dotPath = name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');

    const baseLens = atomLens(this.atom, dotPath as Paths<T>);
    const customLens = Object.create(baseLens);

    const { transform, onChange } = this.options;

    Object.defineProperty(customLens, 'value', {
      get() {
        return baseLens.value;
      },
      set(val: unknown) {
        const transformed = transform ? transform(name, val) : val;
        baseLens.value = transformed as PathValue<T, Paths<T>>;
        if (onChange) {
          untracked(() => onChange(name, transformed));
        }
      },
    });

    entry = { atom: customLens as WritableAtom<unknown>, name, refCount: 1 };

    this.entries.set(name, entry);
    this.entryList.push(entry);
    return entry;
  }

  /**
   * Releases a field binding and disposes of the associated lens if no other
   * controls are referencing it.
   */
  private unbindField(el: Element, name: string): void {
    const entry = this.entries.get(name);
    if (entry && --entry.refCount <= 0) {
      const idx = this.entryList.indexOf(entry);
      if (idx !== -1) {
        this.entryList.splice(idx, 1);
      }
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
   */
  private observe(): void {
    const observer = new MutationObserver((ms) => {
      ms.forEach((m) => {
        if (m.type === 'childList') {
          Array.from(m.addedNodes)
            .filter((node) => node.nodeType === Node.ELEMENT_NODE)
            .forEach((node) => this.bindSubtree(node as Element));
        } else if (m.attributeName === 'name') {
          this.bindSubtree(m.target as Element);
        }
      });
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
 * @param atom - A writable atom containing the state model.
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
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  registry.cleanup(form);
  new FormBinder(form, atom, options);
}
