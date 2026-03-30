import { atom as createAtom, effect, untracked, type WritableAtom } from '@but212/atom-effect';
import { getPathValue, setDeepValue } from '@/core/lens';
import { registry } from '@/core/registry';
import type { ValOptions } from '@/types';
import { bindChecked, bindVal, createContext } from './unified';

/**
 * Binds an entire form to a single object-based atom.
 * Optimized for O(1) performance on large forms by avoiding O(N) effect fan-out.
 */
export function bindForm<T extends object>(
  form: HTMLFormElement,
  atom: WritableAtom<T>,
  options: ValOptions<unknown> = {}
): void {
  const fieldAtoms = new Map<string, WritableAtom<unknown>>();
  const fieldPaths = new Map<string, string[]>();

  // Single effect to watch the root atom and dispatch updates to individual fields.
  const rootDispatcher = effect(() => {
    const rootVal = atom.value; // Subscribes to the root atom once
    untracked(() => {
      for (const [name, fAtom] of fieldAtoms) {
        const newVal = getPathValue(rootVal, fieldPaths.get(name)!);
        if (!Object.is(fAtom.peek(), newVal)) fAtom.value = newVal;
      }
    });
  });

  // Track the dispatcher for cleanup when the form is removed.
  registry.trackEffect(form, rootDispatcher);

  const getOrFieldAtom = (name: string): WritableAtom<unknown> => {
    let fAtom = fieldAtoms.get(name);
    if (!fAtom) {
      const parts = name.includes('.') ? name.split('.') : [name];
      fieldPaths.set(name, parts);

      // Create a leaf atom that only holds the value of this specific field.
      fAtom = createAtom(getPathValue(atom.peek(), parts));

      // Separate effect to sync changes from the field atom back to the root atom.
      registry.trackEffect(
        form,
        effect(() => {
          const newVal = fAtom!.value;
          const currentRoot = atom.peek();
          const nextRoot = setDeepValue(currentRoot, parts, 0, newVal);

          if (nextRoot !== currentRoot) atom.value = nextRoot as T;
        })
      );

      fieldAtoms.set(name, fAtom);
    }
    return fAtom;
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
            const el = node as Element;
            bindElement(el);
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

  registry.trackCleanup(form, () => observer.disconnect());
}
