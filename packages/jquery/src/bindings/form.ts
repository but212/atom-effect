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
import type { FormOptions } from '@/types';
import { bindVal } from './unified';

/** Internal metadata for a single bound form field. */
interface FieldEntry {
  /** Individual atom for this specific field to isolate reactive noise from the root object. */
  atom: WritableAtom<unknown>;

  /** Tokenized path segments for deep object traversal. */
  parts: string[];

  name: string;

  /** Reference count to determine when to safely dispose of the field effect. */
  refCount: number;

  effect: EffectObject | null;
}

const SELECTOR = 'input, select, textarea';

/**
 * Engine for synchronizing a complex object (Atom) with a flat HTML Form.
 * 
 * Design Intent:
 * - Decouples individual field updates from the large root object for better performance.
 * - Supports nested object paths through standard form 'name' attributes.
 * - Observes DOM mutations to handle form fields added or removed after initialization.
 */
class FormBinder<T extends object> {
  private fieldMap = new Map<string, FieldEntry>();

  private fields: FieldEntry[] = [];

  private elementNames = new WeakMap<Element, string>();

  /** Prevents feedback loops where a leaf update triggers a redundant root sync. */
  private isSyncingFromLeaf = false;

  constructor(
    private form: HTMLFormElement,
    private atom: WritableAtom<T>,
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  private init(): void {
    // Root-to-Leaf Synchronization:
    // When the main atom changes externally, propagate values down to each field-level atom.
    const rootDispatcher = effect(() => {
      const rootValue = this.atom.value;

      if (this.isSyncingFromLeaf || !this.fields.length) return;

      batch(() => {
        untracked(() => {
          for (let i = 0; i < this.fields.length; i++) {
            const f = this.fields[i]!;
            const newVal = getPathValue(rootValue, f.parts);

            // Optimization: Only update the field atom if the value has truly changed.
            if (!Object.is(f.atom.peek(), newVal)) f.atom.value = newVal;
          }
        });
      });
    });

    registry.trackEffect(this.form, rootDispatcher);
    this.bindElement(this.form);
    this.setupObserver();
  }

  /** Scans an element or its descendants for bindable form controls. */
  public bindElement(el: Element): void {
    const targets = el.matches?.(SELECTOR)
      ? [el]
      : (el as HTMLElement).querySelectorAll?.(SELECTOR) || [];
    for (let i = 0, len = targets.length; i < len; i++) {
      this.bindControl(targets[i] as Element);
    }
  }

  /** Configures a single form control with two-way binding. */
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

    // Handle 'name' attribute changes reactively
    const oldName = this.elementNames.get(control);
    if (oldName !== undefined && oldName !== name) registry.cleanup(control);

    if (this.elementNames.has(control) && oldName === name) return;

    const entry = this.acquireField(name);
    this.elementNames.set(control, name);

    registry.trackCleanup(control, () => this.releaseField(control, name));

    if (
      control instanceof HTMLInputElement &&
      (control.type === 'radio' || control.type === 'checkbox')
    ) {
      this.bindToggle(control, entry.atom, control.value, control.type === 'checkbox');
    } else {
      bindVal(control, entry.atom, this.options);
    }
  }

  /** Specialized internal logic for radio buttons and multi-value checkboxes. */
  private bindToggle(
    el: HTMLInputElement,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const handler = () => {
      const curr = atom.peek();
      if (isCheck && Array.isArray(curr)) {
        // Multi-checkbox mode: manages an array of selected values
        const s = new Set(curr.map(String));
        el.checked ? s.add(val) : s.delete(val);
        atom.value = Array.from(s);
      } else {
        atom.value = isCheck ? el.checked : val;
      }
    };

    (handler as unknown as { [INTERNAL_HANDLER]: boolean })[INTERNAL_HANDLER] = true;
    $(el).on('change', handler);
    registry.trackCleanup(el, () => $(el).off('change', handler));

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
   * Leaf-to-Root Synchronization:
   * Resolves or creates a field-level atom and binds its changes back to the root object.
   */
  private acquireField(name: string): FieldEntry {
    let entry = this.fieldMap.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    // Convert flat names (e.g., 'user.info[0]') into token paths
    const parts = name
      .replace(/\[(\w+)\]/g, '.$1')
      .split('.')
      .filter(Boolean);

    const fieldAtom = createAtom(getPathValue(this.atom.peek(), parts));
    entry = { atom: fieldAtom, parts, name, refCount: 1, effect: null };

    entry.effect = effect(() => {
      let val = fieldAtom.value;

      if (this.options.transform) val = this.options.transform(name, val);

      const root = this.atom.peek();
      // Immutable update of the root object via nested path patching
      const next = setDeepValue(root, parts, 0, val);

      if (next !== root) {
        this.isSyncingFromLeaf = true;
        try {
          this.atom.value = next as T;
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

  /** Monitors the form DOM for structural changes (AJAX loads, dynamic inputs). */
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
          // Re-bind if a 'name' attribute is changed on the fly
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

    registry.trackCleanup(this.form, () => observer.disconnect());
  }
}

/**
 * Initializes a reactive whole-form binding.
 * 
 * @param form The target form element.
 * @param atom A writable atom holding the form's state object.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  new FormBinder(form, atom, options);
}
