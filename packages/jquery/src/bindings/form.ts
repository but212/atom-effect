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

interface FieldEntry {
  /** Individual atom (lens) for this specific field. */
  atom: WritableAtom<unknown>;

  name: string;

  /** Reference count to determine when to safely dispose of the field effect. */
  refCount: number;
}

const SELECTOR = 'input, select, textarea';

/**
 * Engine for synchronizing a complex object (Atom) with a flat HTML Form.
 *
 * Design Intent:
 * - Uses simple data structures (`atomLens`) over fancy dual-sync algorithms.
 * - Supports nested object paths through standard form 'name' attributes.
 * - Observes DOM mutations to handle form fields added or removed after initialization.
 */
class FormBinder<T extends object> {
  private fieldMap = new Map<string, FieldEntry>();

  private fields: FieldEntry[] = [];

  private elementNames = new WeakMap<Element, string>();

  constructor(
    private form: HTMLFormElement,
    private atom: WritableAtom<T>,
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  private init(): void {
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
   * Resolves or creates a field-level lens and binds it to the root object.
   */
  private acquireField(name: string): FieldEntry {
    let entry = this.fieldMap.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    // Convert flat names (e.g., 'user.info[0]') into dot paths
    const dotPath = name.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '');

    const baseLens = atomLens(this.atom, dotPath as Paths<T>);
    const customLens = Object.create(baseLens);

    // Explicitly destructure options to avoid 'this' context issues in the setter
    const { transform, onChange } = this.options;

    Object.defineProperty(customLens, 'value', {
      get() {
        return baseLens.value;
      },
      set(val: unknown) {
        const transformed = transform ? transform(name, val) : val;
        baseLens.value = transformed as PathValue<T, Paths<T>>;
        if (onChange) untracked(() => onChange(name, transformed));
      },
    });

    entry = { atom: customLens as WritableAtom<unknown>, name, refCount: 1 };

    this.fieldMap.set(name, entry);
    this.fields.push(entry);
    return entry;
  }

  private releaseField(el: Element, name: string): void {
    const entry = this.fieldMap.get(name);
    if (entry && --entry.refCount <= 0) {
      const idx = this.fields.indexOf(entry);
      if (idx !== -1) this.fields.splice(idx, 1);
      const disposableAtom = entry.atom as Partial<{ dispose: () => void }>;
      if (typeof disposableAtom.dispose === 'function') {
        disposableAtom.dispose();
      }
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
