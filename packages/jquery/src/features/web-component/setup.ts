import { isAtom } from '@but212/atom-effect';
import type { SlotBuffer } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import { HYDRATION_MARKER } from '@/core/symbols';
import type { EffectObject, ReactiveValue, ReadonlyAtom } from '@/types';
import { flattenToFormData } from '@/utils';
import { resolveValue } from './utils';

/**
 * Collection of decomposed activation logic for setup components.
 * Separates concerns for different reactive integrations to maintain maintainability.
 * @internal
 */
export const SetupFeatures = {
  /**
   * Synchronizes atom values to custom events dispatched from the host.
   *
   * Logic:
   * - If the source is a function returning an object, it is used as the event `detail`.
   * - Otherwise, the value is wrapped in `{ value: val }` for a predictable API.
   */
  dispatch(
    el: HTMLElement,
    mappings: Record<string, ReactiveValue<unknown>>,
    effects: SlotBuffer<EffectObject>
  ) {
    for (const [name, source] of Object.entries(mappings)) {
      effects.push(
        $.effect(() => {
          const val = resolveValue(source);

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

  /**
   * Applies constructable stylesheets to a ShadowRoot or Document.
   * Note: This appends to existing sheets rather than replacing them.
   */
  styles(root: ShadowRoot | Document, sheets: CSSStyleSheet[]) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets];
    return sheets;
  },

  /**
   * Synchronizes atoms to AriaMixin properties via ElementInternals.
   * Useful for high-level accessibility state (e.g. `aria-pressed`, `aria-valuenow`).
   */
  aria(
    internals: ElementInternals,
    aria: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<EffectObject>
  ) {
    for (const [prop, atom] of Object.entries(aria)) {
      effects.push(
        $.effect(() => {
          const val = atom.value;
          // ElementInternals properties typically expect strings or null to remove the attribute
          (internals as unknown as Record<string, unknown>)[prop] =
            val != null ? String(val) : null;
          return undefined;
        })
      );
    }
  },

  /**
   * Performs declarative hydration of text content based on data-aej-bind attributes.
   *
   * Constraint: Uses `HYDRATION_MARKER` to ensure a node is only bound once,
   * even if multiple hydration passes occur.
   */
  hydrate(
    root: ParentNode,
    bindings: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<EffectObject>,
    hydratedNodes: Set<Element>
  ) {
    const { BIND, LEGACY_BIND } = SYSTEM_COMPONENT.ATTRS;
    const selector = `[${BIND}],[${LEGACY_BIND}]`;

    const apply = (node: Element) => {
      const target = node as Element & { [HYDRATION_MARKER]?: boolean };
      if (target[HYDRATION_MARKER]) return;

      const key = node.getAttribute(BIND) || node.getAttribute(LEGACY_BIND);
      const atom = key ? bindings[key] : null;

      if (atom) {
        effects.push(
          $.effect(() => {
            const val = String(atom.value ?? '');
            // Only update DOM if value actually changed to avoid layout thrashing
            if (node.textContent !== val) node.textContent = val;
            return undefined;
          })
        );
        target[HYDRATION_MARKER] = true;
        hydratedNodes.add(node);
      }
    };

    this.observe(root, selector, apply, effects);
  },

  /**
   * Synchronizes atoms to CSS Parts (`part` attribute) based on data-aej-part.
   *
   * Input Support:
   * - String: "part1 part2"
   * - Array: ["part1", "part2"]
   * - Object: { part1: true, part2: false }
   */
  parts(
    root: ParentNode,
    parts: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<EffectObject>
  ) {
    const attr = SYSTEM_COMPONENT.ATTRS.PART;
    const apply = (node: Element) => {
      const key = node.getAttribute(attr);
      const atom = key ? parts[key] : null;

      if (atom) {
        effects.push(
          $.effect(() => {
            const val = atom.value;
            let normalized: string;

            if (typeof val === 'string') {
              normalized = val;
            } else if (Array.isArray(val)) {
              normalized = val.join(' ');
            } else if (typeof val === 'object' && val !== null) {
              normalized = Object.entries(val as Record<string, boolean>)
                .filter(([, active]) => active)
                .map(([name]) => name)
                .join(' ');
            } else {
              normalized = '';
            }

            if (node.getAttribute('part') !== normalized) node.setAttribute('part', normalized);
            return undefined;
          })
        );
      }
    };
    this.observe(root, `[${attr}]`, apply, effects);
  },

  /**
   * Shared DOM observer for detecting dynamically added elements matching a selector.
   * This is the engine behind "late-binding" hydration for dynamically inserted nodes.
   */
  observe(
    root: ParentNode,
    selector: string,
    apply: (n: Element) => void,
    effects: SlotBuffer<EffectObject>
  ) {
    // Phase 1: Initial sync for already existing nodes
    if (root instanceof Element && root.matches(selector)) apply(root);
    const initial = root.querySelectorAll(selector);
    for (let i = 0; i < initial.length; i++) {
      apply(initial[i]!);
    }

    // Phase 2: Live monitoring for future nodes
    const obs = new MutationObserver((mutations) => {
      for (let i = 0; i < mutations.length; i++) {
        const added = mutations[i]!.addedNodes;
        for (let j = 0; j < added.length; j++) {
          const node = added[j];
          if (node instanceof Element) {
            if (node.matches(selector)) apply(node);
            const children = node.querySelectorAll(selector);
            for (let k = 0; k < children.length; k++) {
              apply(children[k]!);
            }
          }
        }
      }
    });

    obs.observe(root, { childList: true, subtree: true });
    // Disposal: The observer is disconnected when the component effect scope is disposed.
    effects.push($.effect(() => () => obs.disconnect()));
  },

  /**
   * Integrates reactive state with Form-Associated Custom Element (FACE) internals.
   *
   * This handles both the value state (via `setFormValue`) and the validity state
   * (via `setValidity`), making the component behave like a native input.
   */
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
    const valAtom =
      value && (isAtom(value) ? value : (value as { val: ReadonlyAtom<unknown> }).val);
    const stateAtom =
      value && !isAtom(value) ? (value as { state?: ReadonlyAtom<unknown> }).state : null;

    effects.push(
      $.effect(() => {
        // Sync Value
        if (valAtom) {
          const v = valAtom.value;
          const s = stateAtom ? stateAtom.value : null;

          // Reason: Complex objects are flattened to FormData to support multi-value field synchronization.
          if (typeof v === 'object' && v !== null && !(v instanceof File) && !(v instanceof Blob)) {
            const fd = new FormData();
            flattenToFormData(fd, el.getAttribute('name') || '', v);
            internals.setFormValue(fd, s as string | FormData | null);
          } else {
            // Fallback for primitives and binary types.
            internals.setFormValue(
              v as unknown as string | File | FormData | null,
              s as unknown as string | FormData | null
            );
          }
        }

        // Sync Validity
        if (validation) {
          const val = valAtom ? valAtom.value : undefined;
          const res = isAtom(validation)
            ? (validation as ReadonlyAtom<ValidityStateFlags | string>).value
            : (validation as (v: unknown) => ValidityStateFlags | string)(val);

          if (typeof res === 'string') {
            // If it's a string, we treat it as a custom error message.
            internals.setValidity(res ? { customError: true } : {}, res, el);
          } else {
            // Otherwise, we pass the raw ValidityStateFlags.
            internals.setValidity(res, undefined, el);
          }
        }
        return undefined;
      })
    );
  },

  /**
   * Initializes attribute tracking.
   *
   * Optimisation: If `observedAttributes` is defined on the class,
   * we only watch those specific attributes to reduce MutationObserver overhead.
   */
  attributes(host: HTMLElement): {
    atom: ReadonlyAtom<Record<string, string | null>>;
    observer: MutationObserver;
  } {
    const getObserved = () =>
      (host.constructor as typeof HTMLElement & { observedAttributes?: string[] })
        .observedAttributes || [];

    const snapshot = () => {
      const observed = getObserved();
      const res: Record<string, string | null> = {};
      if (observed.length > 0) {
        for (let i = 0; i < observed.length; i++) {
          const name = observed[i]!;
          res[name] = host.getAttribute(name);
        }
      } else {
        // Fallback: watch ALL attributes if no whitelist provided.
        const attrs = host.attributes;
        for (let i = 0; i < attrs.length; i++) {
          const a = attrs[i]!;
          res[a.name] = a.value;
        }
      }
      return res;
    };

    const atom = $.atom(snapshot());

    const observer = new MutationObserver(() => {
      atom.value = snapshot();
    });

    const options: MutationObserverInit = { attributes: true };
    const observed = getObserved();
    if (observed.length > 0) options.attributeFilter = observed;

    observer.observe(host, options);

    return { atom, observer };
  },

  /**
   * Initializes reactive slot tracking.
   * Tracks `assignedNodes` for every slot in the ShadowRoot.
   */
  slots(root: ShadowRoot | null): {
    atom: ReadonlyAtom<Record<string, Node[]>>;
    listener: (e: Event) => void;
  } {
    const snapshot = (targetSr: ShadowRoot | null) => {
      const next: Record<string, Node[]> = {};
      if (targetSr) {
        const slots = targetSr.querySelectorAll('slot');
        for (let i = 0; i < slots.length; i++) {
          const s = slots[i]!;
          next[s.name || ''] = s.assignedNodes();
        }
      }
      return next;
    };

    const atom = $.atom(snapshot(root));

    const listener = (e: Event) => {
      const target = e.target as HTMLSlotElement;
      const current = { ...atom.peek() };
      current[target.name || ''] = target.assignedNodes();
      atom.value = current;
    };

    if (root) {
      atom.value = snapshot(root);
      root.addEventListener('slotchange', listener);
    }

    return { atom, listener };
  },
};
