import {
  atomLens,
  effect,
  type Paths,
  type PathValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import $ from 'jquery';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import { registry } from '@/core/registry';
import type { FormOptions } from '@/types';
import { bindVal } from './unified';

/**
 * Represents an internal entry for a specific form field and its associated lens.
 * @internal
 */
interface FieldEntry {
  /** The reactive lens atom providing access to a specific nested property. */
  atom: WritableAtom<unknown>;

  /** The unique name of the field. */
  name: string;

  /** Reference count used to determine when the field atom can be safely disposed. */
  refCount: number;
}

/** Default selector for identifyable form controls. @internal */
const SELECTOR = 'input, select, textarea';

/**
 * Orchestrates the synchronization between a complex reactive object and an HTML Form.
 *
 * This class implements a two-way binding system that maps form controls (via `name`
 * attributes) to nested properties of a source atom using lenses. It ensures
 * that the DOM and the reactive state remain consistent even as the form structure
 * changes dynamically.
 *
 * When to use:
 * - To manage complex, nested data models through standard HTML form interfaces.
 * - To implement automated two-way synchronization for entire form containers.
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
    const targets = el.matches?.(SELECTOR)
      ? [el]
      : (el as HTMLElement).querySelectorAll?.(SELECTOR) || [];
    for (let i = 0, len = targets.length; i < len; i++) {
      this.bindField(targets[i] as Element);
    }
  }

  /**
   * Establishes a two-way binding for an individual form control.
   *
   * Logic: Field identification is based on the control's `name` attribute. If
   * the name changes, the previous binding is cleaned up and a new lens is established.
   *
   * @param el - The form control element.
   */
  private bindField(el: Element): void {
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLSelectElement ||
        el instanceof HTMLTextAreaElement
      )
    ) {
      return;
    }
    const control = el;
    const name = control.name;
    if (!name) return;

    // Logic: Detect name attribute changes and trigger a cleanup of the old binding association.
    const oldName = this.names.get(control);
    if (oldName !== undefined && oldName !== name) {
      registry.cleanup(control);
    }

    if (this.names.has(control) && oldName === name) return;

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
  }

  /**
   * Specifically handles two-way binding for toggleable controls (checkboxes and radios).
   *
   * Logic: Multi-checkbox scenarios (where the atom value is an array) are
   * handled by maintaining a set of selected values to ensure synchronization
   * without assuming positional order.
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
        if (el.checked) {
          s.add(val);
        } else {
          s.delete(val);
        }
        atom.value = Array.from(s);
      } else {
        atom.value = isCheck ? el.checked : val;
      }
    };

    // Note: Marked as internal to distinguish from user-defined event handlers.
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
   * Logic: Flat name attributes (e.g., 'user.profile[0].name') are converted
   * into dot-separated paths compatible with the `atomLens` engine.
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
   *
   * Logic: Newly injected elements or changes to 'name' attributes are
   * automatically detected, allowing for dynamic form support without
   * manual re-binding.
   */
  private observe(): void {
    const observer = new MutationObserver((ms) => {
      for (let i = 0, len = ms.length; i < len; i++) {
        const m = ms[i]!;
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j]!;
            if (node.nodeType === 1) {
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
 * - To synchronize a standard HTML form with a complex, nested reactive state object.
 *
 * @param form - The target form element to bind.
 * @param atom - A writable atom containing the state model.
 * @param options - Configuration for transformations and change listeners.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  registry.cleanup(form);
  new FormBinder(form, atom, options);
}
