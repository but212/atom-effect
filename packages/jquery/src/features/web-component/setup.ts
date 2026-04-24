import { isAtom } from '@but212/atom-effect';
import $ from 'jquery';
import { HYDRATION_MARKER } from '@/core/symbols';
import type { EffectObject, ReactiveValue, ReadonlyAtom } from '@/types';
import { flattenToFormData } from '@/utils';

/**
 * Collection of decomposed activation logic for setup components.
 *
 * Logic: Feature Specialization
 * Separates concerns for different reactive integrations (ARIA, Styles,
 * Form, Dispatch) to maintain maintainability.
 *
 * @internal
 */
export const SetupFeatures = {
  dispatch(
    el: HTMLElement,
    mappings: Record<string, ReactiveValue<unknown>>,
    effects: Set<EffectObject>
  ) {
    for (const [name, source] of Object.entries(mappings)) {
      effects.add(
        $.effect(() => {
          const val = isAtom(source)
            ? source.value
            : typeof source === 'function'
              ? (source as Function)()
              : source;
          const detail =
            typeof source === 'function' && typeof val === 'object' && val !== null
              ? val
              : { value: val };
          el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
          return undefined;
        })
      );
    }
  },

  styles(root: ShadowRoot | Document, sheets: CSSStyleSheet[]) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets];
    return sheets;
  },

  aria(
    internals: ElementInternals,
    aria: Record<string, ReadonlyAtom<unknown>>,
    effects: Set<EffectObject>
  ) {
    for (const [prop, atom] of Object.entries(aria)) {
      effects.add(
        $.effect(() => {
          (internals as unknown as Record<string, string | null>)[prop] =
            atom.value == null ? null : String(atom.value);
          return undefined;
        })
      );
    }
  },

  hydrate(
    root: ParentNode,
    bindings: Record<string, ReadonlyAtom<unknown>>,
    effects: Set<EffectObject>,
    hydratedNodes: Set<Element>
  ) {
    const BIND_ATTRS = ['data-aej-bind', 'data-bind'];
    const selector = BIND_ATTRS.map((a) => `[${a}]`).join(',');

    const apply = (node: Element) => {
      const target = node as Element & { [HYDRATION_MARKER]?: boolean };
      if (target[HYDRATION_MARKER]) return;
      for (const attr of BIND_ATTRS) {
        const key = node.getAttribute(attr);
        if (key && bindings[key]) {
          const atom = bindings[key];
          effects.add(
            $.effect(() => {
              const val = String(atom.value ?? '');
              if (node.textContent !== val) node.textContent = val;
              return undefined;
            })
          );
          target[HYDRATION_MARKER] = true;
          hydratedNodes.add(node);
          break;
        }
      }
    };

    this.observe(root, selector, apply, effects);
  },

  parts(
    root: ParentNode,
    parts: Record<string, ReadonlyAtom<unknown>>,
    effects: Set<EffectObject>
  ) {
    const apply = (node: Element) => {
      const key = node.getAttribute('data-aej-part');
      if (key && parts[key]) {
        const atom = parts[key];
        effects.add(
          $.effect(() => {
            const val = atom.value;
            const normalized =
              typeof val === 'string'
                ? val
                : Array.isArray(val)
                  ? val.join(' ')
                  : Object.entries((val as Record<string, boolean>) || {})
                      .filter((e) => !!e[1])
                      .map((e) => e[0])
                      .join(' ');
            if (node.getAttribute('part') !== normalized) node.setAttribute('part', normalized);
            return undefined;
          })
        );
      }
    };
    this.observe(root, '[data-aej-part]', apply, effects);
  },

  observe(
    root: ParentNode,
    selector: string,
    apply: (n: Element) => void,
    effects: Set<EffectObject>
  ) {
    $(root)
      .find(selector)
      .addBack(selector)
      .each((_, el) => apply(el));

    const obs = new MutationObserver((muts) =>
      muts.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches(selector)) apply(n);
            $(n)
              .find(selector)
              .each((_, el) => apply(el));
          }
        })
      )
    );
    obs.observe(root, { childList: true, subtree: true });
    effects.add($.effect(() => () => obs.disconnect()));
  },

  form(
    el: HTMLElement,
    internals: ElementInternals,
    value:
      | ReadonlyAtom<unknown>
      | { val: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> }
      | undefined,
    validation:
      | ReadonlyAtom<ValidityStateFlags | string>
      | ((val: unknown) => ValidityStateFlags | string)
      | undefined,
    effects: Set<EffectObject>
  ) {
    const valAtom = !value ? null : isAtom(value) ? value : value.val;
    const stateAtom = !value || isAtom(value) ? null : value.state;

    effects.add(
      $.effect(() => {
        const v = valAtom?.value;
        const s = stateAtom?.value;

        if (valAtom) {
          if (typeof v === 'object' && v !== null && !(v instanceof File) && !(v instanceof Blob)) {
            const fd = new FormData();
            flattenToFormData(fd, el.getAttribute('name') || '', v);
            internals.setFormValue(fd, s as string | FormData | null);
          } else {
            internals.setFormValue(v as string | null, s as string | FormData | null);
          }
        }

        if (validation) {
          const res = isAtom(validation) ? validation.value : validation(v);
          if (typeof res === 'string') {
            internals.setValidity(res ? { customError: true } : {}, res, el);
          } else {
            internals.setValidity(res, undefined, el);
          }
        }
        return undefined;
      })
    );
  },
};
