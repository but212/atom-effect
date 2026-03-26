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
  const elements = form.elements;
  const fieldAtoms = new Map<string, WritableAtom<unknown>>();
  const fieldPaths = new Map<string, string[]>();

  // Single effect to watch the root atom and dispatch updates to individual fields.
  // This is the core optimization: instead of N effects subscribing to the root atom
  // (which causes O(N^2) overhead on large forms), only this single effect reacts
  // to root changes and filters updates to only those fields that actually changed.
  const rootDispatcher = effect(() => {
    const rootVal = atom.value; // Subscribes to the root atom once
    untracked(() => {
      for (const [name, fAtom] of fieldAtoms) {
        const parts = fieldPaths.get(name)!;
        const newVal = getPathValue(rootVal, parts);
        if (!Object.is(fAtom.peek(), newVal)) {
          fAtom.value = newVal;
        }
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
      // This effect only tracks its specific fAtom, so typing in one field
      // does not wake up other field effects.
      const syncToRoot = effect(() => {
        const newVal = fAtom!.value;
        const currentRoot = atom.peek();
        const nextRoot = setDeepValue(currentRoot, parts, 0, newVal);

        if (nextRoot !== currentRoot) {
          atom.value = nextRoot as T;
        }
      });

      registry.trackEffect(form, syncToRoot);
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

  for (let i = 0, len = elements.length; i < len; i++) {
    bindElement(elements[i]!);
  }

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const mutation = mutations[i]!;
      if (mutation.type === 'childList') {
        const added = mutation.addedNodes;
        for (let j = 0, aLen = added.length; j < aLen; j++) {
          if (added[j]!.nodeType === 1) {
            const el = added[j] as Element;
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
