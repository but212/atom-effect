import {
  batch,
  atom as createAtom,
  type EffectObject,
  effect,
  getPathValue,
  setDeepValue,
  untracked,
  type WritableAtom,
} from '@but212/atom-effect';
import $ from 'jquery';
import { INTERNAL_HANDLER } from '@/core/jquery-patch';
import { registry } from '@/core/registry';
import type { BindingContext, FormOptions } from '@/types';
import { bindVal, createContext } from './unified';

/**
 * Interface for managing the state and synchronization logic of individual form fields.
 */
interface FieldEntry {
  /** Independent Atom managing the data for this specific field */
  atom: WritableAtom<unknown>;
  /** Path segments for deep object property traversal (e.g., "a.b[0]" -> ["a", "b", "0"]) */
  parts: string[];
  /** The value of the field's "name" attribute */
  name: string;
  /** Number of DOM elements currently referencing this field */
  refCount: number;
  /** Effect object that reflects field Atom changes back to the root Atom */
  effect: EffectObject | null;
}

/** Selector definition for form controls (input, select, textarea) */
const SELECTOR = 'input, select, textarea';

/**
 * Orchestrator class for managing two-way synchronization between a single object-based Atom
 * and HTML form elements.
 *
 * This class uses a "Root -> Leaf" dispatcher model to maintain performance in large forms:
 * - Root -> Leaf: Updates individual field Atoms conditionally when the root data changes.
 * - Leaf -> Root: Updates the specific path within the root Atom when a field Atom changes.
 *
 * It uses the `isSyncingFromLeaf` flag to prevent infinite loops during two-way updates.
 *
 * @template T The type of the form data (object)
 */
class FormBinder<T extends object> {
  /** Map using field names as keys to manage field entries */
  private fieldMap = new Map<string, FieldEntry>();
  /** Cache of field entries for efficient iteration */
  private fields: FieldEntry[] = [];
  /** WeakMap tracking the previous name of elements to support cleanup when name attributes change */
  private elementNames = new WeakMap<Element, string>();
  /** Protection flag to prevent root dispatcher execution when the update originates from a leaf field */
  private isSyncingFromLeaf = false;

  constructor(
    private form: HTMLFormElement,
    private atom: WritableAtom<T>,
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  /**
   * Initializes the Root -> Leaf synchronization dispatcher.
   * Updates child field Atoms whenever the root Atom value changes.
   */
  private init(): void {
    const rootDispatcher = effect(() => {
      const rootValue = this.atom.value;
      // Skip if updating from a leaf field or if there are no managed fields (optimization & loop protection).
      if (this.isSyncingFromLeaf || !this.fields.length) return;

      batch(() => {
        untracked(() => {
          for (let i = 0; i < this.fields.length; i++) {
            const f = this.fields[i]!;
            const newVal = getPathValue(rootValue, f.parts);
            // Only update the field Atom if the value has actually changed to prevent redundant DOM renders.
            if (!Object.is(f.atom.peek(), newVal)) f.atom.value = newVal;
          }
        });
      });
    });

    // Link the form element lifecycle with the dispatcher.
    registry.trackEffect(this.form, rootDispatcher);
    this.bindElement(this.form);
    this.setupObserver();
  }

  /**
   * Finds and binds all form controls within the given element.
   * @param el Root element to start binding from
   */
  public bindElement(el: Element): void {
    const targets = el.matches?.(SELECTOR)
      ? [el]
      : (el as HTMLElement).querySelectorAll?.(SELECTOR) || [];
    for (let i = 0, len = targets.length; i < len; i++) {
      this.bindControl(targets[i] as Element);
    }
  }

  /**
   * Handles binding for individual controls (input, select, textarea).
   * Only processes elements with a name attribute and prevents duplicate bindings.
   */
  private bindControl(el: Element): void {
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

    // Cleanup existing field resources if the name attribute has changed.
    const oldName = this.elementNames.get(control);
    if (oldName !== undefined && oldName !== name) registry.cleanup(control);
    // Prevent duplicate binding if already bound with the same name.
    if (this.elementNames.has(control) && oldName === name) return;

    const entry = this.acquireField(name);
    this.elementNames.set(control, name);

    const ctx = createContext(control);
    // Track cleanup to decrement field reference count when the element is removed from DOM.
    ctx.trackCleanup(() => this.releaseField(control, name));

    // Choose appropriate binding strategy based on control type.
    if (
      control instanceof HTMLInputElement &&
      (control.type === 'radio' || control.type === 'checkbox')
    ) {
      this.bindToggle(ctx, entry.atom, control.value, control.type === 'checkbox');
    } else {
      // Standard input fields (text, select, etc.) use the standard bindVal logic.
      bindVal(ctx, entry.atom, this.options);
    }
  }

  /**
   * Handles specialized binding logic for checkboxes and radio buttons.
   * Supports multi-checkbox configurations (managing values as an array).
   */
  private bindToggle(
    ctx: BindingContext,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const el = ctx.el as HTMLInputElement;

    // Handler to reflect UI changes back to the Atom
    const handler = () => {
      const curr = atom.peek();
      if (isCheck && Array.isArray(curr)) {
        // Multi-checkbox logic using Set for array-based values
        const s = new Set(curr.map(String));
        el.checked ? s.add(val) : s.delete(val);
        atom.value = Array.from(s);
      } else {
        // Standard radio buttons and single checkboxes
        atom.value = isCheck ? el.checked : val;
      }
    };

    // Mark as internal handler to prevent redundant interceptions.
    (handler as unknown as { [INTERNAL_HANDLER]: boolean })[INTERNAL_HANDLER] = true;
    $(el).on('change', handler);
    ctx.trackCleanup(() => $(el).off('change', handler));

    // Effect to update UI checked state when the Atom changes
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
   * Acquires field resources for a specific name path.
   * Increments refCount if it exists, otherwise creates a new Atom and synchronization Effect.
   */
  private acquireField(name: string): FieldEntry {
    let entry = this.fieldMap.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    // Parse the name attribute into an object path (e.g., "user[info].name" -> ["user", "info", "name"])
    const parts = name
      .replace(/\[(\w+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);

    // Create an independent field Atom for Leaf -> Root synchronization
    const fieldAtom = createAtom(getPathValue(this.atom.peek(), parts));
    entry = { atom: fieldAtom, parts, name, refCount: 1, effect: null };

    // Set up Leaf (field Atom) -> Root (main data Atom) synchronization effect
    entry.effect = effect(() => {
      let val = fieldAtom.value;
      // Support custom data transformation via options
      if (this.options.transform) val = this.options.transform(name, val);

      const root = this.atom.peek();
      // Update deep path value immutably
      const next = setDeepValue(root, parts, 0, val);

      if (next !== root) {
        // Mark as syncing from leaf to prevent infinite loop in Root dispatcher
        this.isSyncingFromLeaf = true;
        try {
          this.atom.value = next as T;
          // Execute onChange callback if provided (wrapped in untracked to protect from effect collection)
          if (this.options.onChange) untracked(() => this.options.onChange!(name, val));
        } finally {
          this.isSyncingFromLeaf = false;
        }
      }
    });

    this.fieldMap.set(name, entry);
    this.fields.push(entry);
    return entry;
  }

  /**
   * Releases field usage and cleans up resources when refCount reaches zero.
   */
  private releaseField(el: Element, name: string): void {
    const entry = this.fieldMap.get(name);
    if (entry && --entry.refCount <= 0) {
      const idx = this.fields.indexOf(entry);
      if (idx !== -1) this.fields.splice(idx, 1);
      entry.effect?.dispose();
      this.fieldMap.delete(name);
    }
    registry.cleanup(el);
  }

  /**
   * Uses MutationObserver to detect dynamic changes within the form.
   * Automatically updates bindings when new elements are added or name attributes change.
   */
  private setupObserver(): void {
    const observer = new MutationObserver((ms) => {
      for (let i = 0, len = ms.length; i < len; i++) {
        const m = ms[i]!;
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j]!;
            if (node.nodeType === 1) this.bindElement(node as Element);
          }
        } else if (m.attributeName === 'name') {
          this.bindElement(m.target as Element);
        }
      }
    });

    observer.observe(this.form, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['name'],
    });

    // Disconnect the observer when the form is destroyed.
    registry.trackCleanup(this.form, () => observer.disconnect());
  }
}

/**
 * Binds an entire HTML form to a single object-based Atom.
 *
 * Key Features:
 * - O(1) level update performance for large forms (only changed fields react)
 * - Circular loop protection via internal flags for two-way updates
 * - Support for custom data transformation (transform) and change callbacks (onChange)
 * - Automatic dynamic element binding and memory management via MutationObserver
 *
 * @param form The HTMLFormElement to bind
 * @param atom The WritableAtom holding the form data
 * @param options Evaluation options for performance tuning or callbacks
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  new FormBinder(form, atom, options);
}
