import { isAtom } from '@but212/atom-effect';
import { Option, type SlotBuffer } from '@but212/atom-effect-utils';
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
    effects: SlotBuffer<EffectObject>
  ) {
    for (const [name, source] of Object.entries(mappings)) {
      effects.push(
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
    effects: SlotBuffer<EffectObject>
  ) {
    for (const [prop, atom] of Object.entries(aria)) {
      effects.push(
        $.effect(() => {
          (internals as unknown as Record<string, string | null>)[prop] = Option.unwrapOr(
            Option.map(Option.fromNullable(atom.value), String),
            null
          );
          return undefined;
        })
      );
    }
  },

  hydrate(
    root: ParentNode,
    bindings: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<EffectObject>,
    hydratedNodes: Set<Element>
  ) {
    const BIND_ATTRS = ['data-aej-bind', 'data-bind'];
    const selector = BIND_ATTRS.map((a) => `[${a}]`).join(',');

    const apply = (node: Element) => {
      const target = node as Element & { [HYDRATION_MARKER]?: boolean };
      if (target[HYDRATION_MARKER]) return;
      for (const attr of BIND_ATTRS) {
        Option.map(Option.fromNullable(node.getAttribute(attr)), (key) => {
          if (bindings[key]) {
            const atom = bindings[key];
            effects.push(
              $.effect(() => {
                const val = String(atom.value ?? '');
                if (node.textContent !== val) node.textContent = val;
                return undefined;
              })
            );
            target[HYDRATION_MARKER] = true;
            hydratedNodes.add(node);
          }
        });
        if (target[HYDRATION_MARKER]) break;
      }
    };

    this.observe(root, selector, apply, effects);
  },

  parts(
    root: ParentNode,
    parts: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<EffectObject>
  ) {
    const apply = (node: Element) => {
      Option.map(Option.fromNullable(node.getAttribute('data-aej-part')), (key) => {
        if (parts[key]) {
          const atom = parts[key];
          effects.push(
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
      });
    };
    this.observe(root, '[data-aej-part]', apply, effects);
  },

  observe(
    root: ParentNode,
    selector: string,
    apply: (n: Element) => void,
    effects: SlotBuffer<EffectObject>
  ) {
    if (root instanceof Element && root.matches(selector)) apply(root);
    root.querySelectorAll(selector).forEach((el) => apply(el));

    const obs = new MutationObserver((muts) =>
      muts.forEach((m) =>
        m.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches(selector)) apply(n);
            n.querySelectorAll(selector).forEach((el) => apply(el));
          }
        })
      )
    );
    obs.observe(root, { childList: true, subtree: true });
    effects.push($.effect(() => () => obs.disconnect()));
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
    effects: SlotBuffer<EffectObject>
  ) {
    const valAtomOpt = Option.fromNullable(!value ? null : isAtom(value) ? value : value.val);
    const stateAtomOpt = Option.fromNullable(!value || isAtom(value) ? null : value.state);

    effects.push(
      $.effect(() => {
        Option.map(valAtomOpt, (valAtom) => {
          const v = valAtom.value;
          const s = Option.unwrapOr(
            Option.map(stateAtomOpt, (a) => a.value),
            null
          );

          if (typeof v === 'object' && v !== null && !(v instanceof File) && !(v instanceof Blob)) {
            const fd = new FormData();
            flattenToFormData(fd, el.getAttribute('name') || '', v);
            internals.setFormValue(fd, s as string | FormData | null);
          } else {
            internals.setFormValue(v as string | null, s as string | FormData | null);
          }
        });

        Option.map(Option.fromNullable(validation), (vld) => {
          const val = Option.unwrapOr(
            Option.map(valAtomOpt, (a) => a.value),
            undefined
          );
          const res = isAtom(vld) ? vld.value : vld(val);
          if (typeof res === 'string') {
            internals.setValidity(res ? { customError: true } : {}, res, el);
          } else {
            internals.setValidity(res, undefined, el);
          }
        });
        return undefined;
      })
    );
  },
};
