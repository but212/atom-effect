/**
 * @module AEJComponentSetup
 *
 * Responsibility:
 * Decomposes the complex activation logic for Custom Elements into
 * maintainable features, including event dispatching, style injection,
 * hydration, and form integration.
 *
 * Design Intent:
 * Follows a "feature-based" decomposition strategy where each reactive
 * capability is isolated into a discrete activation function. This simplifies
 * testing and allows for granular optimization of DOM-heavy operations.
 */

import { type Disposable, isAtom } from '@but212/atom-effect';
import type { SlotBuffer } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_COMPONENT } from '@/constants';
import { getOrCreateRootObserver } from '@/core/observer';
import { HYDRATION_MARKER } from '@/core/symbols';
import type { ReactiveValue, ReadonlyAtom } from '@/types';
import { flattenToFormData } from '@/utils';
import { resolveValue } from './utils';

/**
 * Logic: Feature Decomposition
 * A collection of activation strategies for component-specific integrations.
 * Decouples reactive orchestration from the main controller to ensure
 * granular maintainability.
 * @internal
 */
export const SetupFeatures = {
  /**
   * Logic: Reactive Event Dispatching
   * Synchronizes atom values to custom events dispatched from the host.
   *
   * Logic: Payload Wrapping
   * - If the source is a function returning an object, it is used as the event `detail`.
   * - Otherwise, the value is wrapped in `{ value: val }` for a predictable API.
   */
  dispatch(
    el: HTMLElement,
    mappings: Record<string, ReactiveValue<unknown>>,
    effects: SlotBuffer<Disposable>
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
   * Logic: Style Injection
   * Applies constructable stylesheets to a ShadowRoot or Document.
   *
   * Note: This appends to existing sheets rather than replacing them to
   * maintain compatibility with global or inherited styles.
   */
  styles(root: ShadowRoot | Document, sheets: CSSStyleSheet[]) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, ...sheets];
    return sheets;
  },

  /**
   * Logic: Accessibility Synchronization
   * Synchronizes atoms to AriaMixin properties via ElementInternals.
   *
   * When to use:
   * - Managing high-level accessibility state (e.g. `aria-pressed`, `aria-valuenow`)
   *   without manual attribute manipulation.
   */
  aria(
    internals: ElementInternals,
    aria: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<Disposable>
  ) {
    for (const [prop, atom] of Object.entries(aria)) {
      effects.push(
        $.effect(() => {
          const val = atom.value;
          // ElementInternals properties typically expect strings or null to remove the attribute
          (internals as ElementInternals & Record<string, unknown>)[prop] =
            val == null ? null : String(val);
          return undefined;
        })
      );
    }
  },

  /**
   * Logic: Declarative Hydration
   * Performs reactive text synchronization for nodes marked with `data-aej-bind`.
   *
   * Constraint: Idempotency
   * Uses `HYDRATION_MARKER` to ensure a node is only bound once,
   * even if multiple hydration passes occur during DOM moves.
   */
  hydrate(
    root: ParentNode,
    bindings: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<Disposable>
  ) {
    const { BIND, LEGACY_BIND } = SYSTEM_COMPONENT.ATTRS;
    const selector = `[${BIND}],[${LEGACY_BIND}]`;

    const apply = (node: Element) => {
      const target = node as Element & { [HYDRATION_MARKER]?: boolean };
      if (target[HYDRATION_MARKER]) return;

      const key = node.getAttribute(BIND) || node.getAttribute(LEGACY_BIND);
      const atom = key && Object.hasOwn(bindings, key) ? bindings[key] : null;

      if (atom) {
        effects.push(
          $.effect(() => {
            const val = String(atom.value ?? '');
            // Why: Only update DOM if value actually changed to avoid layout thrashing
            // and unnecessary DOM mutations which can trigger further MutationObservers.
            if (node.textContent !== val) node.textContent = val;
            return undefined;
          })
        );
        target[HYDRATION_MARKER] = true;
        effects.push({
          dispose: () => {
            delete target[HYDRATION_MARKER];
          },
        });
      }
    };

    this.observe(root, selector, apply, effects);
  },

  /**
   * Logic: Polymorphic CSS Part Mapping
   * Synchronizes atoms to CSS Parts (`part` attribute) based on `data-aej-part`.
   *
   * Logic: Normalization
   * Supports String ("part1 part2"), Array (["part1", "part2"]), or
   * Object ({ part1: true }) inputs for flexible styling control.
   *
   * Constraint: Shadow DOM Scope
   * `part` attributes are only functional on elements within a ShadowRoot
   * that are explicitly exposed to the outer document.
   */
  parts(
    root: ParentNode,
    parts: Record<string, ReadonlyAtom<unknown>>,
    effects: SlotBuffer<Disposable>
  ) {
    const attr = SYSTEM_COMPONENT.ATTRS.PART;
    const apply = (node: Element) => {
      const key = node.getAttribute(attr);
      const atom = key && Object.hasOwn(parts, key) ? parts[key] : null;

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
              normalized = Object.keys(val)
                .filter((k) => (val as Record<string, boolean>)[k])
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
   * Logic: Hybrid DOM Discovery
   * Shared observer for detecting dynamically added elements matching a selector.
   * Serves as the engine for "late-binding" hydration for dynamically inserted nodes.
   */
  observe(
    root: ParentNode,
    selector: string,
    apply: (n: Element) => void,
    effects: SlotBuffer<Disposable>
  ) {
    // Phase 1: Initial sync for already existing nodes
    if (root instanceof Element && root.matches(selector)) apply(root);
    const initial = root.querySelectorAll(selector);
    for (const node of initial) {
      apply(node);
    }

    // Phase 2: Live monitoring for future nodes via RootObserver
    const observer = getOrCreateRootObserver(root);
    const unsubscribe = observer.onNodeAdded(selector, apply);

    // Disposal: The node addition subscription is unregistered when the component effect scope is disposed.
    effects.push({ dispose: unsubscribe });
  },

  /**
   * Logic: Form-Associated Element Integration
   * Integrates reactive state with Form-Associated Custom Element (FACE) internals.
   *
   * Design Intent:
   * Handles both value state (via `setFormValue`) and validity state
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
    effects: SlotBuffer<Disposable>
  ) {
    const isAtomVal = isAtom(value);
    const valAtom = value && (isAtomVal ? value : (value as { val: ReadonlyAtom<unknown> }).val);
    const stateAtom =
      value && !isAtomVal ? (value as { state?: ReadonlyAtom<unknown> }).state : null;

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
              v as string | File | FormData | null,
              s as string | FormData | null
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
   * Logic: Reactive Attribute Tracking
   * Initializes real-time attribute monitoring.
   *
   * Optimization: Selective Monitoring
   * If `observedAttributes` is defined on the class, only those specific
   * attributes are watched to minimize MutationObserver overhead.
   */
  attributes(host: HTMLElement): {
    atom: ReadonlyAtom<Record<string, string | null>>;
    observer: MutationObserver;
  } {
    const observed =
      (host.constructor as typeof HTMLElement & { observedAttributes?: string[] })
        .observedAttributes || [];

    const snapshot = () => {
      const res: Record<string, string | null> = {};
      if (observed.length > 0) {
        for (const name of observed) {
          res[name] = host.getAttribute(name);
        }
      } else {
        // Fallback: watch ALL attributes if no whitelist provided.
        for (const a of host.attributes) {
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
    if (observed.length > 0) options.attributeFilter = observed;

    observer.observe(host, options);

    return { atom, observer };
  },

  /**
   * Logic: Slot Assignment Tracking
   * Initializes reactive tracking of `assignedNodes` for every slot in
   * the ShadowRoot.
   */
  slots(root: ShadowRoot | null): {
    atom: ReadonlyAtom<Record<string, Node[]>>;
    listener: (e: Event) => void;
  } {
    const snapshot = () => {
      const next: Record<string, Node[]> = {};
      if (root) {
        const slots = root.querySelectorAll('slot');
        for (const s of slots) {
          next[s.name || ''] = s.assignedNodes();
        }
      }
      return next;
    };

    const atom = $.atom(snapshot());

    const listener = (e: Event) => {
      const target = e.target as HTMLSlotElement;
      atom.value = {
        ...atom.peek(),
        [target.name || '']: target.assignedNodes(),
      };
    };

    if (root) {
      root.addEventListener('slotchange', listener);
    }

    return { atom, listener };
  },
};
