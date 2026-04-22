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
 * Logic:
 * - Employs `atomLens` to create fine-grained reactive bridges between form controls
 *   and nested object properties.
 * - Utilizes a `MutationObserver` to maintain synchronization even as form fields
 *   are dynamically added or removed via AJAX or scripts.
 *
 * When to use:
 * - Managing complex, nested data models through standard HTML form interfaces.
 * - Automated 2-way synchronization for entire form sections.
 *
 * @internal
 */
class FormBinder<T extends object> {
  private entries = new Map<string, FieldEntry>();

  private entryList: FieldEntry[] = [];

  private names = new WeakMap<Element, string>();

  constructor(
    private form: HTMLFormElement,
    private atom: WritableAtom<T>,
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  private init(): void {
    this.bindSubtree(this.form);
    this.observe();
  }

  public bindSubtree(el: Element): void {
    const targets = el.matches?.(SELECTOR)
      ? [el]
      : (el as HTMLElement).querySelectorAll?.(SELECTOR) || [];
    for (let i = 0, len = targets.length; i < len; i++) {
      this.bindField(targets[i] as Element);
    }
  }

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

    // Handle 'name' attribute changes reactively
    const oldName = this.names.get(control);
    if (oldName !== undefined && oldName !== name) registry.cleanup(control);

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

  private bindToggle(
    el: HTMLInputElement,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const handler = () => {
      const curr = atom.peek();
      // Logic: Multi-checkbox mode manages an array of selected values.
      // Positional order is not guaranteed; we use a Set for efficiency.
      if (isCheck && Array.isArray(curr)) {
        const s = new Set(curr.map(String));
        el.checked ? s.add(val) : s.delete(val);
        atom.value = Array.from(s);
      } else {
        atom.value = isCheck ? el.checked : val;
      }
    };

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
   * Logic: Converts flat name attributes (e.g., 'user.info[0]') into
   * reactive dot-paths that `atomLens` can understand.
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

    this.entries.set(name, entry);
    this.entryList.push(entry);
    return entry;
  }

  private unbindField(el: Element, name: string): void {
    const entry = this.entries.get(name);
    if (entry && --entry.refCount <= 0) {
      const idx = this.entryList.indexOf(entry);
      if (idx !== -1) this.entryList.splice(idx, 1);
      const disposableAtom = entry.atom as Partial<{ dispose: () => void }>;
      if (typeof disposableAtom.dispose === 'function') {
        disposableAtom.dispose();
      }
      this.entries.delete(name);
    }
    registry.cleanup(el);
  }

  /**
   * Logic: Leverages MutationObserver to detect child element injections
   * and 'name' attribute changes, ensuring newly added fields are
   * automatically enrolled in the two-way binding system.
   */
  private observe(): void {
    const observer = new MutationObserver((ms) => {
      for (let i = 0, len = ms.length; i < len; i++) {
        const m = ms[i]!;
        if (m.type === 'childList') {
          for (let j = 0; j < m.addedNodes.length; j++) {
            const node = m.addedNodes[j]!;
            if (node.nodeType === 1) this.bindSubtree(node as Element);
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
 * When to use:
 * - Bridging a standard `<form>` element with a reactive object atom.
 *
 * @param form - The target form element.
 * @param atom - A writable atom holding the form's state object.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  new FormBinder(form, atom, options);
}
