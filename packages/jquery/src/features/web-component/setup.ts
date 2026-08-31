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
   * - Otherwise, the value is wrapped in `{ value: value }` for a predictable API.
   */
  dispatch(
    hostElement: HTMLElement,
    mappings: Record<string, ReactiveValue<unknown>>,
    effects: SlotBuffer<Disposable>
  ) {
    for (const [name, source] of Object.entries(mappings)) {
      effects.push(
        $.effect(() => {
          const value = resolveValue(source);

          const detail =
            typeof source === 'function' && typeof value === 'object' && value !== null
              ? value
              : { value: value };
          hostElement.dispatchEvent(
            new CustomEvent(name, { detail, bubbles: true, composed: true })
          );
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
          const value = atom.value;
          // ElementInternals properties typically expect strings or null to remove the attribute
          (internals as ElementInternals & Record<string, unknown>)[prop] =
            value == null ? null : String(value);
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
            const value = String(atom.value ?? '');
            // Why: Only update DOM if value actually changed to avoid layout thrashing
            // and unnecessary DOM mutations which can trigger further MutationObservers.
            if (node.textContent !== value) node.textContent = value;
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
            const value = atom.value;
            let normalized: string;

            if (typeof value === 'string') {
              normalized = value;
            } else if (Array.isArray(value)) {
              normalized = value.join(' ');
            } else if (typeof value === 'object' && value !== null) {
              normalized = Object.keys(value)
                .filter((k) => (value as Record<string, boolean>)[k])
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
    apply: (node: Element) => void,
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
    element: HTMLElement,
    internals: ElementInternals,
    value:
      | ReadonlyAtom<unknown>
      | { value: ReadonlyAtom<unknown>; state?: ReadonlyAtom<unknown> }
      | undefined,
    validation:
      | ReadonlyAtom<ValidityStateFlags | string>
      | ((value: unknown) => ValidityStateFlags | string)
      | undefined,
    effects: SlotBuffer<Disposable>
  ) {
    const isAtomValue = isAtom(value);
    const valueAtom =
      value && (isAtomValue ? value : (value as { value: ReadonlyAtom<unknown> }).value);
    const stateAtom =
      value && !isAtomValue ? (value as { state?: ReadonlyAtom<unknown> }).state : null;

    effects.push(
      $.effect(() => {
        // Sync Value
        if (valueAtom) {
          const formValue = valueAtom.value;
          const formState = stateAtom ? stateAtom.value : null;

          // Reason: Complex objects are flattened to FormData to support multi-value field synchronization.
          if (
            typeof formValue === 'object' &&
            formValue !== null &&
            !(formValue instanceof File) &&
            !(formValue instanceof Blob)
          ) {
            const formData = new FormData();
            flattenToFormData(formData, element.getAttribute('name') || '', formValue);
            internals.setFormValue(formData, formState as string | FormData | null);
          } else {
            // Fallback for primitives and binary types.
            internals.setFormValue(
              formValue as string | File | FormData | null,
              formState as string | FormData | null
            );
          }
        }

        // Sync Validity
        if (validation) {
          const formValue = valueAtom ? valueAtom.value : undefined;
          const validationResult = isAtom(validation)
            ? (validation as ReadonlyAtom<ValidityStateFlags | string>).value
            : (validation as (value: unknown) => ValidityStateFlags | string)(formValue);

          if (typeof validationResult === 'string') {
            // If it's a string, we treat it as a custom error message.
            internals.setValidity(
              validationResult ? { customError: true } : {},
              validationResult,
              element
            );
          } else {
            // ElementInternals requires a message whenever a validity flag is set.
            const hasInvalidFlag = Object.values(validationResult).some(Boolean);
            internals.setValidity(validationResult, hasInvalidFlag ? 'Invalid value' : '', element);
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
      const attributesSnapshot: Record<string, string | null> = {};
      if (observed.length > 0) {
        for (const name of observed) {
          attributesSnapshot[name] = host.getAttribute(name);
        }
      } else {
        // Fallback: watch ALL attributes if no whitelist provided.
        for (const attribute of host.attributes) {
          attributesSnapshot[attribute.name] = attribute.value;
        }
      }
      return attributesSnapshot;
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
    listener: (event: Event) => void;
  } {
    const snapshot = () => {
      const next: Record<string, Node[]> = {};
      if (root) {
        const slots = root.querySelectorAll('slot');
        for (const slotElement of slots) {
          next[slotElement.name || ''] = slotElement.assignedNodes();
        }
      }
      return next;
    };

    const atom = $.atom(snapshot());

    const listener = (event: Event) => {
      const target = event.target as HTMLSlotElement;
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
