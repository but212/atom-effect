import type { WritableAtom } from '@but212/atom-effect';
import { registry } from '@/core/registry';
import type { ValOptions } from '@/types';
import { bindChecked, bindVal, createContext } from './unified';

/**
 * Internal recursive helper for creating deep immutable copies with structural sharing.
 * Only clones nodes along the path where changes occur.
 */
function setDeepValue(obj: unknown, keys: string[], index: number, value: unknown): unknown {
  if (index === keys.length) return value;

  const key = keys[index]!;
  const currentLevel = obj && typeof obj === 'object' ? obj : {};
  const oldValue = (currentLevel as Record<string, unknown>)[key];

  const newValue = setDeepValue(oldValue, keys, index + 1, value);

  // Structural Sharing: If the value didn't change, return the original object
  // to avoid unnecessary allocations and downstream effect triggers.
  if (Object.is(oldValue, newValue)) return obj;

  return { ...currentLevel, [key]: newValue };
}

/**
 * Creates a two-way "lens" for a specific property path on an object-based atom.
 * Optimized for performance using structural sharing and equality guards.
 */
function createLens<T extends object>(atom: WritableAtom<T>, path: string): WritableAtom<unknown> {
  const ATOM_BRAND = Symbol.for('atom-effect/atom');
  const WRITABLE_BRAND = Symbol.for('atom-effect/writable');
  const parts = path.includes('.') ? path.split('.') : [path];

  const getPathValue = (source: unknown) => {
    let result = source;
    for (let i = 0, len = parts.length; i < len && result != null; i++) {
      result = (result as Record<string, unknown>)[parts[i]!];
    }
    return result;
  };

  return {
    get value() {
      return getPathValue(atom.value);
    },
    set value(newVal: unknown) {
      const current = atom.peek();
      const next = setDeepValue(current, parts, 0, newVal);

      // Only write back to the atom if a change actually occurred.
      if (next !== current) {
        atom.value = next as T;
      }
    },
    peek() {
      return getPathValue(atom.peek());
    },
    subscribe(listener: Parameters<WritableAtom<T>['subscribe']>[0]) {
      return atom.subscribe(listener);
    },
    subscriberCount() {
      return atom.subscriberCount();
    },
    dispose() {},
    // @ts-expect-error
    [Symbol.dispose || Symbol.for('dispose')]() {},
    [ATOM_BRAND]: true,
    [WRITABLE_BRAND]: true,
  } as unknown as WritableAtom<unknown>;
}

/**
 * Binds an entire form to a single object-based atom.
 * Optimized for performance on large forms and supports dynamic DOM changes.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: ValOptions<unknown> = {}
): void {
  // Optimization: use the native form.elements collection which is significantly faster
  // than selector-based find('[name]') on large forms.
  const elements = form.elements;

  const bindElement = (el: Element) => {
    // Only bind form controls that have a name attribute and haven't been bound yet.
    if (
      !(
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
    ) {
      return;
    }
    const name = el.name;
    if (!name || registry.hasBind(el)) return;

    // Create a two-way lens for this specific name/path.
    const fieldAtom = createLens(atom, name);
    const controlCtx = createContext(el as HTMLElement);

    // Initial sync from atom to DOM and event listeners are handled by bindVal/bindChecked.
    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      bindChecked(controlCtx, fieldAtom as WritableAtom<boolean>);
    } else {
      bindVal(controlCtx, fieldAtom, options);
    }
  };

  // Initial scan: bind all currently present form controls.
  for (let i = 0, len = elements.length; i < len; i++) {
    bindElement(elements[i]!);
  }

  // Support dynamic DOM changes (new inputs added or name attributes changed).
  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const mutation = mutations[i]!;
      if (mutation.type === 'childList') {
        const added = mutation.addedNodes;
        for (let j = 0, aLen = added.length; j < aLen; j++) {
          const node = added[j]!;
          if (node.nodeType === 1) {
            // Element
            const el = node as Element;
            bindElement(el);
            // Scan subtree for new controls.
            const controls = el.querySelectorAll('input, select, textarea');
            for (let k = 0, cLen = controls.length; k < cLen; k++) {
              bindElement(controls[k]!);
            }
          }
        }
      } else if (mutation.type === 'attributes' && mutation.attributeName === 'name') {
        bindElement(mutation.target as Element);
      }
    }
  });

  observer.observe(form, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['name'],
  });

  // Track the observer for automatic cleanup when the form is removed or unbound.
  registry.trackCleanup(form, () => observer.disconnect());
}
