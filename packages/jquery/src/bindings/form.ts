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
 * Manager class for orchestrating two-way form synchronization.
 * Optimizes performance via Root -> Leaf dispatcher and maintains circular protection.
 */
interface FieldEntry {
  atom: WritableAtom<unknown>;
  parts: string[];
  name: string;
  refCount: number;
  effect: EffectObject | null;
}

const SELECTOR = 'input, select, textarea';

class FormBinder<T extends object> {
  private fieldMap = new Map<string, FieldEntry>();
  private fields: FieldEntry[] = [];
  private elementNames = new WeakMap<Element, string>();
  private isSyncingFromLeaf = false;

  constructor(
    private form: HTMLFormElement,
    private atom: WritableAtom<T>,
    private options: FormOptions<unknown> = {}
  ) {
    this.init();
  }

  private init(): void {
    const rootDispatcher = effect(() => {
      const rootValue = this.atom.value;
      if (this.isSyncingFromLeaf || !this.fields.length) return;

      batch(() => {
        untracked(() => {
          for (let i = 0; i < this.fields.length; i++) {
            const f = this.fields[i]!;
            const newVal = getPathValue(rootValue, f.parts);
            if (!Object.is(f.atom.peek(), newVal)) f.atom.value = newVal;
          }
        });
      });
    });

    registry.trackEffect(this.form, rootDispatcher);
    this.bindElement(this.form);
    this.setupObserver();
  }

  public bindElement(el: Element): void {
    const targets = el.matches?.(SELECTOR)
      ? [el]
      : (el as HTMLElement).querySelectorAll?.(SELECTOR) || [];
    for (let i = 0, len = targets.length; i < len; i++) {
      this.bindControl(targets[i] as Element);
    }
  }

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

    if (this.elementNames.get(control) !== name) registry.cleanup(control);
    if (registry.hasBind(control)) return;

    const entry = this.acquireField(name);
    this.elementNames.set(control, name);

    const ctx = createContext(control);
    ctx.trackCleanup(() => this.releaseField(control, name));

    if (
      control instanceof HTMLInputElement &&
      (control.type === 'radio' || control.type === 'checkbox')
    ) {
      this.bindToggle(ctx, entry.atom, control.value, control.type === 'checkbox');
    } else {
      bindVal(ctx, entry.atom, this.options);
    }
  }

  private bindToggle(
    ctx: BindingContext,
    atom: WritableAtom<unknown>,
    val: string,
    isCheck: boolean
  ): void {
    const el = ctx.el as HTMLInputElement;
    const handler = () => {
      const curr = atom.peek();
      if (isCheck && Array.isArray(curr)) {
        const s = new Set(curr);
        el.checked ? s.add(val) : s.delete(val);
        atom.value = Array.from(s);
      } else {
        atom.value = isCheck ? el.checked : val;
      }
    };

    (handler as unknown as { [INTERNAL_HANDLER]: boolean })[INTERNAL_HANDLER] = true;
    $(el).on('change', handler);
    ctx.trackCleanup(() => $(el).off('change', handler));

    registry.trackEffect(
      el,
      effect(() => {
        const v = atom.value;
        const checked = isCheck ? (Array.isArray(v) ? v.includes(val) : !!v) : String(v) === val;
        if (el.checked !== checked) el.checked = checked;
      })
    );
  }

  private acquireField(name: string): FieldEntry {
    let entry = this.fieldMap.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

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

    registry.trackCleanup(this.form, () => observer.disconnect());
  }
}

/**
 * Binds an entire form to a single object-based atom.
 * Features: O(1) performance for large forms, circular loop protection,
 * and custom transform/change hooks.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: FormOptions<unknown> = {}
): void {
  new FormBinder(form, atom, options);
}
