import { atom as createAtom, effect, untracked, type WritableAtom } from '@but212/atom-effect';
import { getPathValue, setDeepValue } from '@/core/lens';
import { registry } from '@/core/registry';
import type { ValOptions } from '@/types';
import { bindChecked, bindVal, createContext } from './unified';

/**
 * Binds an entire form to a single object-based atom.
 *
 * DESIGN STRATEGY:
 * Optimized for O(1) performance on large forms. Instead of each input
 * directly observing a "lens" of the root atom (which would create N effects),
 * we use a single centralized 'rootDispatcher' effect. This dispatcher
 * watches the root atom once and pushes updates to individual 'leaf atoms'
 * only when their specific values change, eliminating O(N) effect fan-out.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: ValOptions<unknown> = {}
): void {
  // Use a flat array for O(N) iteration without Map iterator overhead
  const fieldAtoms = new Map<string, WritableAtom<unknown>>();
  const fields: { atom: WritableAtom<unknown>; parts: string[] }[] = [];

  // Single effect to watch the root atom and dispatch updates to individual fields.
  // This ensures that typing in one field doesn't trigger O(N) re-computations
  // across all other fields.
  const rootDispatcher = effect(() => {
    const rootValue = atom.value; // Subscribes to the root atom once
    const len = fields.length;
    if (len === 0) return;

    untracked(() => {
      for (let i = 0; i < len; i++) {
        const item = fields[i]!;
        const newValue = getPathValue(rootValue, item.parts);
        // Only trigger the leaf atom if the value actually changed.
        if (!Object.is(item.atom.peek(), newValue)) {
          item.atom.value = newValue;
        }
      }
    });
  });

  // Track the dispatcher for cleanup when the form is removed.
  registry.trackEffect(form, rootDispatcher);

  const getOrFieldAtom = (name: string): WritableAtom<unknown> => {
    let fieldAtom = fieldAtoms.get(name);
    if (!fieldAtom) {
      const parts = name.includes('.') ? name.split('.') : [name];

      // Create a leaf atom that only holds the value of this specific field.
      fieldAtom = createAtom(getPathValue(atom.peek(), parts));
      fields.push({ atom: fieldAtom, parts });

      // Separate effect to sync changes from the field atom back to the root atom.
      registry.trackEffect(
        form,
        effect(() => {
          const newValue = fieldAtom!.value; // Subscribes to the leaf atom only
          const currentRoot = atom.peek();
          const nextRoot = setDeepValue(currentRoot, parts, 0, newValue);

          if (nextRoot !== currentRoot) {
            atom.value = nextRoot as T;
          }
        })
      );

      fieldAtoms.set(name, fieldAtom);
    }
    return fieldAtom;
  };

  const bindElement = (el: Element) => {
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

    const fieldAtom = getOrFieldAtom(name);
    const controlCtx = createContext(el as HTMLElement);

    if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      bindChecked(controlCtx, fieldAtom as WritableAtom<boolean>);
    } else {
      bindVal(controlCtx, fieldAtom, options);
    }
  };

  for (let i = 0, len = form.elements.length; i < len; i++) {
    bindElement(form.elements[i]!);
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const mutation = mutations[i]!;
      if (mutation.type === 'childList') {
        for (let j = 0, aLen = mutation.addedNodes.length; j < aLen; j++) {
          const node = mutation.addedNodes[j]!;
          if (node.nodeType === 1) {
            const el = node as HTMLElement;
            bindElement(el);
            // Search for inputs within the newly added fragment
            const controls = el.matches?.('input, select, textarea')
              ? [el]
              : el.querySelectorAll('input, select, textarea');
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

  registry.trackCleanup(form, () => observer.disconnect());
}
