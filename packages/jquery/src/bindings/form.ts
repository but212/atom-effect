/**
 * @module Form Binding
 *
 * Responsibility:
 * Orchestrates two-way reactive synchronization between complex state objects
 * and HTML Form elements, including nested property access and native validation.
 *
 * Design Intent:
 * Uses a centralized 'FormBinder' to manage the lifecycle of reactive lenses
 * and DOM observers, ensuring memory safety through integrated cleanup
 * registration and reference counting for shared fields.
 */

import { effect, lensFor, untracked, type WritableAtom } from '@but212/atom-effect';
import { Result, shallowEqual } from '@but212/atom-effect-utils';
import $ from 'jquery';
import { SYSTEM_BINDING } from '@/constants';
import { getOrCreateRootObserver, rootObserversMap } from '@/core/observer';
import { registry } from '@/core/registry';
import { markInternal } from '@/core/symbols';
import type { FormOptions, ValOptions } from '@/types';
import { formNameToPath, getSelector } from '@/utils';
import { debug } from '@/utils/debug';
import { MultiSourceField, type NonEmptySources } from './form-field-atoms';
import { createInputBinding, type FieldAccess } from './input-binding';

type FieldAtom = Pick<WritableAtom<unknown>, 'value' | 'peek' | 'dispose'>;

/**
 * Role: Internal registry entry for form fields.
 *
 * Logic: Reference Counting
 * Tracks multiple form controls (e.g., multiple radios for one name) bound
 * to the same property path to ensure lens atoms are only disposed when
 * the last associated control is removed from the DOM.
 *
 * @internal
 */
interface FieldEntry {
  /** The reactive model for a specific nested property. */
  atom: FieldAtom;
  /** Reference count for lifecycle management. */
  refCount: number;
}

/**
 * Role: Selector used for identifying form-associated elements and custom elements.
 * @internal
 */
const SELECTOR = 'input, select, textarea, [name]';
const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const { getRootNode } = Node.prototype;
// Named forms and controls can shadow inherited DOM properties.
const getNodeType = Object.getOwnPropertyDescriptor(Node.prototype, 'nodeType')?.get as (
  this: Node
) => number;
const getLocalName = Object.getOwnPropertyDescriptor(Element.prototype, 'localName')?.get as (
  this: Element
) => string;
const getNamespaceURI = Object.getOwnPropertyDescriptor(Element.prototype, 'namespaceURI')?.get as (
  this: Element
) => string | null;
const getOwnerDocument = Object.getOwnPropertyDescriptor(Node.prototype, 'ownerDocument')?.get as (
  this: Node
) => Document;
const getParent = Object.getOwnPropertyDescriptor(Node.prototype, 'parentNode')?.get as (
  this: Node
) => Node | null;
const isConnected = Object.getOwnPropertyDescriptor(Node.prototype, 'isConnected')?.get as (
  this: Node
) => boolean;
const getFormElements = Object.getOwnPropertyDescriptor(HTMLFormElement.prototype, 'elements')
  ?.get as (this: HTMLFormElement) => HTMLFormControlsCollection;

function isShadowRoot(node: Node): node is ShadowRoot {
  return getNodeType.call(node) === Node.DOCUMENT_FRAGMENT_NODE && 'host' in node;
}

function isHtmlElement<K extends keyof HTMLElementTagNameMap>(
  element: Element | null,
  name: K
): element is HTMLElementTagNameMap[K] {
  return (
    element !== null &&
    getLocalName.call(element) === name &&
    getNamespaceURI.call(element) === HTML_NAMESPACE
  );
}

interface FormBinding {
  readonly form: HTMLFormElement;
  readonly watchesShadow: boolean;
  detachedFrom: FormOwnerRoot | undefined;
  bindField(element: Element, observed?: boolean): void;
  refresh(checkRoot?: boolean): void;
}

interface ControlBinding {
  readonly owner: FormBinding;
  readonly element: HTMLElement;
  readonly name: string;
  replay(): void;
  dispose(): void;
}

type FormOwnerRoot = Document | ShadowRoot;
type ValueSync = Pick<NonNullable<ReturnType<typeof createInputBinding>>, 'replay' | 'dispose'>;

type FieldSlot =
  | { kind: 'bound'; binding: ControlBinding }
  | { kind: 'explicitlyUnbound'; association: ReturnType<typeof getControlAssociation> };

const fieldSlots = new WeakMap<Element, FieldSlot>();

function getControlBinding(control: Element): ControlBinding | undefined {
  const slot = fieldSlots.get(control);
  return slot?.kind === 'bound' ? slot.binding : undefined;
}

const formBindings = new WeakMap<HTMLFormElement, FormBinding>();

/** Reconciles an existing binding after a form or its shadow host enters an unobserved root. */
export function refreshFormBinding(form: HTMLFormElement): void {
  formBindings.get(form)?.refresh();
}
const formOwnerObservers = new WeakMap<
  FormOwnerRoot,
  { unsubscribe: () => void; forms: Set<WeakRef<HTMLFormElement>> }
>();

/** Finds bound forms across the shadow boundaries of moved hosts, including closed roots. */
function collectMovedShadowForms(
  documentRoot: Document,
  moved: ReadonlySet<Node>,
  forms: Set<HTMLFormElement>
): void {
  const { createTreeWalker } = Document.prototype;
  const shadows = new Set<ShadowRoot>();
  const collectShadow = (element: Element) => {
    const shadow = registry.getShadow(element);
    if (shadow && isShadowRoot(shadow)) shadows.add(shadow);
  };
  for (const node of moved) collectShadow(node as Element);
  for (const shadow of shadows) {
    const walker = createTreeWalker.call(documentRoot, shadow, NodeFilter.SHOW_ELEMENT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node as Element;
      if (isHtmlElement(element, 'form') && formBindings.has(element)) forms.add(element);
      collectShadow(element);
    }
  }
}

function watchFormOwners(root: FormOwnerRoot, form: HTMLFormElement): () => void {
  let entry = formOwnerObservers.get(root);
  if (!entry) {
    // A document-level observer must not retain forms that never get attached.
    const forms = new Set<WeakRef<HTMLFormElement>>();
    const { getAttribute } = Element.prototype;
    const { createTreeWalker } = Document.prototype;
    const isDocumentRoot = getNodeType.call(root) === Node.DOCUMENT_NODE;
    const { querySelectorAll } = isDocumentRoot ? Document.prototype : DocumentFragment.prototype;
    const reconcile = (records: readonly MutationRecord[]): void => {
      const documentRoot = isDocumentRoot ? (root as Document) : getOwnerDocument.call(root);
      const ids = new Set<string>();
      const controls = new Set<Element>();
      const moved = new Set<Element>();
      const removals = new Map<Node, MutationRecord>();
      for (const record of records) {
        if (record.type === 'childList') {
          for (const node of record.addedNodes) {
            if (getNodeType.call(node) === 1) moved.add(node as Element);
          }
          for (const node of record.removedNodes) {
            if (getNodeType.call(node) !== 1) continue;
            const element = node as Element;
            moved.add(element);
            if (!registry.isPreservedRemoval(element, record)) removals.set(element, record);
          }
          continue;
        }
        if (record.type !== 'attributes') continue;
        const { target, attributeName, oldValue } = record;
        const element = target as Element;
        if (attributeName === 'id') {
          const id = getAttribute.call(element, 'id');
          if (oldValue === id) continue;
          if (oldValue) ids.add(oldValue);
          if (id) ids.add(id);
        } else if (
          attributeName === 'form' ||
          (attributeName === 'name' && getAttribute.call(element, 'form') !== null)
        ) {
          controls.add(element);
        }
      }

      const movedForms = new Set<HTMLFormElement>();
      const collectMoved = (element: Element): void => {
        if (fieldSlots.has(element) || getAttribute.call(element, 'form') !== null) {
          controls.add(element);
        }
        if (isHtmlElement(element, 'form') && formBindings.has(element)) {
          movedForms.add(element);
        }
        // Any first match for a form attribute's ID can affect native ownership.
        const id = getAttribute.call(element, 'id');
        if (id) ids.add(id);
      };
      // Mutation records can cover nested subtrees in either order. Prune a visited branch,
      // but still walk removed subtrees that no longer belong to the observed root.
      const visited = new Set<Node>();
      const skipVisited = (node: Node) =>
        visited.has(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      const removedControls = new Map<Element, Node>();
      const visit = (subtrees: Iterable<Node>, removed: boolean): void => {
        for (const subtree of subtrees) {
          if (visited.has(subtree)) continue;
          const walker = createTreeWalker.call(
            documentRoot,
            subtree,
            NodeFilter.SHOW_ELEMENT,
            skipVisited
          );
          for (let node: Node | null = subtree; node; node = walker.nextNode()) {
            visited.add(node);
            const element = node as Element;
            if (removed && getControlBinding(element)) removedControls.set(element, subtree);
            collectMoved(element);
          }
        }
      };
      // Visit native removal subtrees first so overlapping additions cannot hide a removal.
      visit(removals.keys(), true);
      visit(moved, false);

      const wasRemoved = (control: Element): boolean => {
        const subtree = removedControls.get(control);
        const record = subtree && removals.get(subtree);
        if (!record) return false;
        if (!registry.isPreservedRemoval(subtree, record)) return true;
        // An earlier teardown can preserve the original record; another removed ancestor may remain.
        for (let node: Node | null = control; node; node = getParent.call(node)) {
          const other = removals.get(node);
          if (other && !registry.isPreservedRemoval(node, other)) return true;
        }
        return false;
      };

      if (ids.size > 0) {
        for (const control of querySelectorAll.call(root, '[form]')) {
          const id = getAttribute.call(control, 'form');
          if (id && ids.has(id)) controls.add(control);
        }
      }
      for (const control of controls) {
        try {
          if (isUnboundAtCurrentAssociation(control)) continue;
          const previous = getControlBinding(control);
          const owner = getFormOwner(control);
          if (owner === undefined) continue;
          const binding = owner && formBindings.get(owner);
          // A connected/observed destination can take ownership. Otherwise release only a
          // field that lost its owner on an unpreserved removal, leaving other bindings alone.
          if (
            !Node.prototype.contains.call(root, control) &&
            !(previous && (isConnected.call(control) || registry.isInObservedTree(control)))
          ) {
            if (previous && previous.owner !== binding && wasRemoved(control)) {
              previous.dispose();
            } else if (previous && owner === null) {
              previous.replay();
            }
            continue;
          }
          if (binding) binding.bindField(control, true);
          else if (previous) {
            if (owner === null && isSuspendedExternalField(previous)) previous.replay();
            else previous.dispose();
          }
        } catch (error) {
          console.error('Error reconciling form owner:', error);
        }
      }
      // Connecting a shadow host can establish form ownership without mutating its shadow tree.
      if (moved.size > 0) {
        for (const reference of forms) {
          const form = reference.deref();
          if (!form) forms.delete(reference);
          else if (isDocumentRoot && formBindings.get(form)?.watchesShadow) movedForms.add(form);
        }
        // A move inside a shadow root is invisible to the document observer.
        collectMovedShadowForms(documentRoot, visited, movedForms);
      }
      for (const form of movedForms) formBindings.get(form)?.refresh(true);
      if (forms.size === 0 && formOwnerObservers.get(root)?.unsubscribe === unsubscribe) {
        unsubscribe();
        formOwnerObservers.delete(root);
      }
    };
    const unsubscribe = getOrCreateRootObserver(root).onMutationBatch(
      ['id', 'form', 'name'],
      reconcile
    );
    entry = { unsubscribe, forms };
    formOwnerObservers.set(root, entry);
  }
  const { forms, unsubscribe } = entry;
  const reference = new WeakRef(form);
  forms.add(reference);
  return () => {
    if (!forms.delete(reference) || forms.size !== 0) return;
    unsubscribe();
    formOwnerObservers.delete(root);
  };
}

/**
 * Logic: Multi-checkbox Array Sync
 * Optimization: Uses an imperative loop to populate the Set in a single pass,
 * avoiding memory overhead and GC pressure from intermediate array allocations.
 *
 * @internal
 */
function getNextToggleValue(
  current: unknown,
  checked: boolean,
  toggleValue: string,
  isCheck: boolean
): boolean | string | string[] {
  if (!isCheck) return toggleValue;
  if (!Array.isArray(current)) return checked;

  const toggledValueSet = new Set(current.map(String));
  if (checked) toggledValueSet.add(toggleValue);
  else toggledValueSet.delete(toggleValue);
  return Array.from(toggledValueSet);
}

/**
 * Logic: Toggle State Resolution
 * Optimization: Replaces functional iteration with an imperative loop to allow
 * for early termination, reducing unnecessary string conversions.
 *
 * @internal
 */
function isToggleChecked(currentValue: unknown, targetValue: string, isCheck: boolean): boolean {
  if (!isCheck) return String(currentValue) === targetValue;
  return Array.isArray(currentValue)
    ? currentValue.some((toggledItem) => String(toggledItem) === targetValue)
    : !!currentValue;
}

function observeValidationEligibility(field: Element, observer: MutationObserver): void {
  observer.observe(field, { attributeFilter: ['disabled', 'readonly', 'type'] });
  // Direct child-list observations detect moves and changes to a fieldset's first legend
  // without checking unrelated subtrees. The ancestor chain is refreshed after moves.
  for (let node = getParent.call(field); node; node = getParent.call(node)) {
    observer.observe(
      node,
      node.nodeType === Node.ELEMENT_NODE && isHtmlElement(node as Element, 'fieldset')
        ? { childList: true, attributeFilter: ['disabled'] }
        : { childList: true }
    );
  }
}

function getValidationSetterDescriptor(field: Element): PropertyDescriptor | undefined {
  for (let target: object | null = field; target; target = Reflect.getPrototypeOf(target)) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, 'setCustomValidity');
    if (descriptor) return descriptor;
  }
}

function observeValidationSetter(
  field: HTMLInputElement,
  canInstall: () => boolean,
  writeExternally: (write: () => void, isCurrent: () => boolean) => void
) {
  const descriptor = Object.getOwnPropertyDescriptor(field, 'setCustomValidity');
  const setter = field.setCustomValidity;
  if (!canInstall() || typeof setter !== 'function') return;

  function observeValidityWrite(this: HTMLInputElement, ...args: Parameters<typeof setter>) {
    if (this !== field || !isObserving()) return setter.apply(this, args);
    return writeExternally(() => setter.apply(this, args), isObserving);
  }
  const observing =
    (!descriptor || ('value' in descriptor && (descriptor.configurable || descriptor.writable))) &&
    Reflect.defineProperty(field, 'setCustomValidity', {
      ...(descriptor ?? { configurable: true, writable: true }),
      value: observeValidityWrite,
    });
  const isObserving = () =>
    observing === true &&
    Object.getOwnPropertyDescriptor(field, 'setCustomValidity')?.value === observeValidityWrite;
  const unwrapped = observing ? undefined : (descriptor ?? getValidationSetterDescriptor(field));

  return {
    isCurrent() {
      if (observing) return isObserving();
      // An accessor can return a fresh bound function without being replaced.
      if (unwrapped && 'get' in unwrapped) {
        return shallowEqual(unwrapped, getValidationSetterDescriptor(field));
      }
      return field.setCustomValidity === setter;
    },
    restore() {
      if (!isObserving()) return;
      if (descriptor) Reflect.defineProperty(field, 'setCustomValidity', descriptor);
      else Reflect.deleteProperty(field, 'setCustomValidity');
    },
    write(message: string) {
      setter.call(field, message);
    },
  };
}

type ValidationLease = Readonly<{ binding: ControlBinding; id: symbol; defer(): void }>;
type ValidationWrite = Readonly<{
  lease: ValidationLease;
  access: Exclude<FieldAccess, 'blocked'>;
  message: string;
}>;
type SetterTurn = { kind: 'idle' } | { kind: 'calling'; next: ValidationWrite | null };
// A deferred error must not retain the old binding (and therefore its form and model).
type OwnedError = Readonly<{ kind: 'owned'; owner: symbol; message: string }>;
type ErrorClaim =
  | { kind: 'none' }
  | OwnedError
  | { kind: 'awaitingEligibility'; error: OwnedError; observer: MutationObserver };

const validationChannels = new WeakMap<Element, ReturnType<typeof createValidationChannel>>();

function createValidationChannel(field: HTMLInputElement) {
  let active: ValidationLease | undefined;
  let setter: ReturnType<typeof observeValidationSetter>;
  let turn: SetterTurn = { kind: 'idle' };
  let claim: ErrorClaim = { kind: 'none' };
  let externalWrites = 0;

  const reportError = (error: unknown) => {
    debug.error(
      SYSTEM_BINDING.PREFIX,
      SYSTEM_BINDING.ERRORS.CLEANUP_ERROR(getSelector(field)),
      error
    );
  };

  const dropClaim = () => {
    if (claim.kind === 'awaitingEligibility') claim.observer.disconnect();
    claim = { kind: 'none' };
  };

  const stopIfIdle = () => {
    if (turn.kind !== 'idle' || active || claim.kind !== 'none') return;
    validationChannels.delete(field);
    setter?.restore();
    setter = undefined;
  };

  const writeExternally = (write: () => void, isCurrent: () => boolean) =>
    transact(() => {
      const result = write();
      // Relinquish ownership only on success, before applying any queued reactive write.
      if (isCurrent()) {
        externalWrites++;
        dropClaim();
      }
      return result;
    });

  const ensureSetter = (lease: ValidationLease) => {
    if (active !== lease) return;
    const previous = setter;
    const stillCurrent = previous?.isCurrent();
    if (stillCurrent || active !== lease) return;
    dropClaim();
    const observed = observeValidationSetter(field, () => active === lease, writeExternally);
    if (active === lease) setter = observed;
  };

  const canApply = ({ lease, access }: ValidationWrite) => {
    if (active !== lease) return false;
    if (resolveFieldAccess(lease.binding) === access) return true;
    lease.defer();
    return false;
  };
  const apply = (write: ValidationWrite) => {
    if (!canApply(write)) return;
    ensureSetter(write.lease);
    const current = setter;
    if (!current || !canApply(write)) return;
    const revision = externalWrites;
    current.write(write.message);
    if (setter === current && revision === externalWrites) {
      claim = write.message
        ? { kind: 'owned', owner: write.lease.id, message: write.message }
        : { kind: 'none' };
    }
  };

  const waitUntilEligible = (error: OwnedError) => {
    // A barred control hides the message; never change its eligibility to read it.
    const observer = new MutationObserver(() => {
      if (claim !== waiting) return;
      try {
        const settled = !setter?.isCurrent() || !field.validity?.customError || field.willValidate;
        if (claim !== waiting) return;
        observer.disconnect();
        if (settled) {
          claim = waiting.error;
          transact();
        } else {
          observeValidationEligibility(field, observer);
        }
      } catch (error) {
        if (claim === waiting) dropClaim();
        stopIfIdle();
        reportError(error);
      }
    });
    const waiting = { kind: 'awaitingEligibility', error, observer } as const;
    claim = waiting;
    try {
      observeValidationEligibility(field, observer);
    } catch (error) {
      if (claim === waiting) dropClaim();
      throw error;
    }
  };

  const releaseError = (owned: OwnedError) => {
    const current = setter;
    const canCompare = current?.isCurrent() && field.validity?.customError;
    const eligible = field.willValidate;
    if (claim !== owned) return;
    if (!current || !canCompare) {
      dropClaim();
      return;
    }
    if (!eligible) {
      waitUntilEligible(owned);
      return;
    }

    const { message } = owned;
    const displayed = field.validationMessage;
    if (claim !== owned) return;
    dropClaim();
    // Browsers can normalize line endings in the native validation message.
    if (displayed !== message && displayed !== message.replace(/\r\n?/g, '\n')) return;
    if (!active) {
      current.restore();
      setter = undefined;
    }
    current.write('');
  };

  function transact<T>(run?: () => T): T | undefined {
    // Nested external calls still invoke the setter synchronously; only the outer call drains.
    if (turn.kind === 'calling') return run?.();
    const calling: Extract<SetterTurn, { kind: 'calling' }> = { kind: 'calling', next: null };
    turn = calling;
    try {
      return run?.();
    } finally {
      try {
        for (;;) {
          const next = calling.next;
          if (next) {
            calling.next = null;
            const result = Result.tryCatch(() => untracked(() => apply(next)));
            if (Result.isErr(result)) reportError(result.error);
          } else if (claim.kind === 'owned' && active?.id !== claim.owner) {
            const owned = claim;
            const result = Result.tryCatch(() => releaseError(owned));
            if (Result.isErr(result)) {
              if (claim === owned) dropClaim();
              reportError(result.error);
            }
          } else {
            break;
          }
        }
      } finally {
        turn = { kind: 'idle' };
        stopIfIdle();
      }
    }
  }

  return {
    attach(lease: ValidationLease) {
      if (claim.kind === 'awaitingEligibility') dropClaim();
      active = lease;
      ensureSetter(lease);
    },
    isAttached: (lease: ValidationLease) => active === lease,
    write(write: ValidationWrite) {
      if (active !== write.lease) return;
      if (turn.kind === 'calling') turn.next = write;
      else transact(() => apply(write));
    },
    release(lease: ValidationLease) {
      if (active !== lease) return;
      active = undefined;
      if (turn.kind === 'idle') transact();
    },
  };
}

/** Prepares validation so the binding owns its teardown before the first effect run. */
function createValidationEffect(
  binding: ControlBinding,
  atom: FieldAtom,
  validate: (v: unknown) => string | boolean | undefined
) {
  const field = binding.element as HTMLInputElement;
  let pendingSync = false;
  const lease: ValidationLease = {
    binding,
    id: Symbol(),
    defer() {
      pendingSync = true;
    },
  };
  let channel: ReturnType<typeof createValidationChannel> | undefined;
  let validationEffect: ReturnType<typeof effect> | undefined;
  const start = () => {
    if (resolveFieldAccess(binding) === 'blocked') {
      lease.defer();
      return;
    }
    const current = validationChannels.get(field) ?? createValidationChannel(field);
    channel = current;
    validationChannels.set(field, current);
    current.attach(lease);
    if (!current.isAttached(lease)) return;
    const runningEffect = effect(() => {
      pendingSync = false;
      // Still observe the model when a temporary move blocks DOM writes.
      const value = Result.tryCatch(() => atom.value);
      const access = untracked(() => resolveFieldAccess(binding));
      if (access === 'blocked') {
        lease.defer();
        return;
      }
      const validationResult = Result.isErr(value)
        ? value
        : Result.tryCatch(() => validate(value.value));
      let message: string;
      if (Result.isErr(validationResult)) {
        console.error(`Validation error in field "${binding.name}":`, validationResult.error);
        message = 'Validation failed';
      } else {
        const value = validationResult.value;
        message = typeof value === 'string' ? value : value === false ? 'Invalid' : '';
      }
      untracked(() => current.write({ lease, access, message }));
    });
    // effect() runs immediately, so its first call can dispose the binding before it returns.
    if (current.isAttached(lease)) validationEffect = runningEffect;
    else runningEffect.dispose();
  };
  return {
    start,
    replay() {
      if (!pendingSync || resolveFieldAccess(binding) === 'blocked') return;
      if (validationEffect) validationEffect.run();
      else if (!channel) start();
    },
    dispose() {
      try {
        validationEffect?.dispose();
      } finally {
        channel?.release(lease);
      }
    },
  };
}

function getControlName(element: HTMLElement): string | undefined {
  const attribute = element.getAttribute('name');
  if (attribute) return attribute;
  if ('name' in element) {
    const nameValue = (element as Record<string, unknown>).name;
    return nameValue == null ? undefined : String(nameValue);
  }
  return undefined;
}

// Once confirmed by the browser, FACE status does not depend on the mutable constructor flag.
const confirmedCustomControls = new WeakSet<Element>();

function getFormOwner(element: Element): HTMLFormElement | null | undefined {
  if (
    Element.prototype.matches.call(
      element,
      'button, fieldset, input, object, output, select, textarea'
    )
  ) {
    const owner = (element as HTMLInputElement).form;
    return isHtmlElement(owner, 'form') ? owner : null;
  }
  // A custom control need not expose ElementInternals.form, and its .form may be unrelated.
  if (!getLocalName.call(element).includes('-')) return;
  const id = Element.prototype.getAttribute.call(element, 'form');
  const root = getRootNode.call(element);
  const rootType = getNodeType.call(root);
  let explicit: Element | null = null;
  if (id !== null) {
    if (rootType === Node.DOCUMENT_NODE) {
      explicit = Document.prototype.getElementById.call(root, id);
    } else if (rootType === Node.DOCUMENT_FRAGMENT_NODE) {
      explicit = DocumentFragment.prototype.getElementById.call(root, id);
    }
  }
  const confirmOwner = (form: Element | null): form is HTMLFormElement => {
    if (
      !isHtmlElement(form, 'form') ||
      !Array.prototype.includes.call(getFormElements.call(form), element)
    ) {
      return false;
    }
    confirmedCustomControls.add(element);
    return true;
  };
  if (confirmOwner(explicit)) return explicit;
  const ancestor = Element.prototype.closest.call(element, 'form');
  if (confirmOwner(ancestor)) return ancestor;
  if (
    confirmedCustomControls.has(element) ||
    (element.constructor as { formAssociated?: unknown }).formAssociated
  ) {
    return null;
  }
}

// Remember identity without letting a live external control pin its former form.
const associationIds = new WeakMap<Node, object>();

function associationId(node: Node | null | undefined): object | null | undefined {
  if (!node) return node;
  let id = associationIds.get(node);
  if (!id) {
    id = {};
    associationIds.set(node, id);
  }
  return id;
}

function getControlAssociation(control: HTMLElement, name: string | undefined) {
  const owner = getFormOwner(control);
  return {
    name,
    owner: associationId(
      owner === undefined ? Element.prototype.closest.call(control, 'form') : owner
    ),
  };
}

function isUnboundAtCurrentAssociation(element: Element, name?: string): boolean {
  const slot = fieldSlots.get(element);
  if (slot?.kind !== 'explicitlyUnbound') return false;
  const control = element as HTMLElement;
  const association = getControlAssociation(control, name ?? getControlName(control));
  if (fieldSlots.get(element) !== slot) return false;
  if (shallowEqual(slot.association, association)) return true;
  fieldSlots.delete(element);
  return false;
}

function belongsToForm(
  control: Element,
  form: HTMLFormElement,
  owner: HTMLFormElement | null | undefined
): boolean {
  return owner === undefined ? Node.prototype.contains.call(form, control) : owner === form;
}

function lastFormRemoval(form: HTMLFormElement, records: readonly MutationRecord[] | undefined) {
  if (!records) return;
  const { contains } = Node.prototype;
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (!record) continue;
    for (const node of record.removedNodes) {
      if (contains.call(node, form)) return { node, record };
    }
  }
}

function isSuspendedExternalField({ element, name, owner }: ControlBinding): boolean {
  const { form } = owner;
  if (isConnected.call(form)) return false;
  const { getAttribute } = Element.prototype;
  const targetId = getAttribute.call(element, 'form');
  if (!targetId || targetId !== getAttribute.call(form, 'id') || getControlName(element) !== name) {
    return false;
  }
  const tree = getRootNode.call(element);
  const root = isShadowRoot(tree)
    ? tree
    : getNodeType.call(tree) === Node.DOCUMENT_NODE
      ? (tree as Document)
      : undefined;
  if (!root) return false;
  const observer = rootObserversMap.get(root);
  // Model effects and an explicit refresh may run before the observer delivers the detach.
  const removal =
    lastFormRemoval(form, observer?.collectPendingRecords()) ??
    lastFormRemoval(form, observer?.activeRemovalDelivery);
  if (removal) {
    owner.detachedFrom = registry.isPreservedRemoval(removal.node, removal.record)
      ? root
      : undefined;
  }
  return owner.detachedFrom === root;
}

function resolveFieldAccess(binding: ControlBinding): FieldAccess {
  const { element, name, owner } = binding;
  if (getControlBinding(element) !== binding || getControlName(element) !== name) {
    return 'blocked';
  }
  const nativeOwner = getFormOwner(element);
  if (getControlBinding(element) !== binding || formBindings.get(owner.form) !== owner) {
    return 'blocked';
  }
  if (belongsToForm(element, owner.form, nativeOwner)) return 'owned';
  // Only removal evidence can distinguish a preserved detach from a pending native removal.
  return !nativeOwner && (!isConnected.call(element) || isSuspendedExternalField(binding))
    ? 'suspended'
    : 'blocked';
}

function snapshotSources(sources: readonly WritableAtom<unknown>[]): NonEmptySources {
  const [first, ...rest] = sources;
  if (!first) throw new Error(SYSTEM_BINDING.ERRORS.EMPTY_SOURCES('bindForm'));
  return [first, ...rest];
}

/**
 * Synchronizes an HTML `<form>` with a reactive state object.
 *
 * When to use:
 * - Recommended for synchronizing standard HTML forms with complex, nested
 *   reactive state objects.
 * - Suitable for scenarios requiring declarative validation integrated with
 *   browser-native APIs.
 *
 * Logic: Polymorphic Input
 * For a single atom, field lenses are rooted at that atom. For an array of atoms, each field reads
 * through the merged view of every source — so the bound value follows the field if ownership moves
 * after mount — while each write mutates only the source that currently owns the field path (the
 * last source defining it, falling back to the first source).
 *
 * @param form The target form element to bind.
 * @param atom A writable atom or a non-empty array of atoms providing the state.
 * @param options Configuration for transformations, change callbacks, and validation.
 * @throws If `atom` is an empty array: a form with no source can never synchronize.
 *
 * @example
 * ```typescript
 * const user = $.atom({ profile: { name: 'Alice' }, items: [] });
 *
 * $.bindForm($('form')[0], user, {
 *   validation: {
 *     'profile.name': (v) => v ? true : 'Name is required'
 *   },
 *   onChange: (path, value) => console.log(`${path} changed to ${value}`)
 * });
 * ```
 */
export function bindForm<T extends object, U = unknown>(
  form: HTMLFormElement,
  atom: WritableAtom<T> | WritableAtom<unknown>[],
  options: FormOptions<U> = {}
): void {
  const createFieldAtom = (() => {
    if (!Array.isArray(atom)) {
      const createLens = lensFor(atom as WritableAtom<object>);
      // Field paths are supplied by the DOM, not known at compile time.
      return (path: string): FieldAtom => createLens(path as never);
    }
    const sources = snapshotSources(atom);
    return (path: string): FieldAtom => new MultiSourceField(sources, path);
  })();
  registry.cleanup(form);
  // Teardown (e.g. clearing custom validity) can synchronously bind a newer model.
  if (formBindings.has(form)) return;

  const entries = new Map<string, FieldEntry>();
  const boundControls = new Set<ControlBinding>();

  const ensureField = (name: string): FieldEntry => {
    const entry = entries.get(name);
    if (entry) {
      entry.refCount++;
      return entry;
    }

    const newEntry: FieldEntry = { atom: createFieldAtom(formNameToPath(name)), refCount: 1 };
    entries.set(name, newEntry);
    return newEntry;
  };

  const bindToggle = (
    element: HTMLInputElement,
    atom: FieldAtom,
    value: string,
    isCheck: boolean,
    getAccess: () => FieldAccess,
    commit: (value: unknown) => void
  ): ValueSync => {
    let pendingSync = false;
    const handler = () => {
      if (getAccess() === 'owned') {
        commit(getNextToggleValue(atom.peek(), element.checked, value, isCheck));
      }
    };

    markInternal(handler);
    const $element = $(element).on('change', handler);
    const toggleEffect = effect(() => {
      pendingSync = false;
      const current = atom.value;
      untracked(() => {
        const access = getAccess();
        if (access === 'blocked') {
          pendingSync = true;
          return;
        }
        const checked = isToggleChecked(current, value, isCheck);
        if (element.checked === checked) return;
        if (getAccess() === access) element.checked = checked;
        else pendingSync = true;
      });
    });
    return {
      replay(force = false) {
        if ((force || pendingSync) && getAccess() !== 'blocked') toggleEffect.run();
      },
      dispose() {
        try {
          $element.off('change', handler);
        } finally {
          toggleEffect.dispose();
        }
      },
    };
  };

  const getRemovalRoots = () =>
    ownerShadow ? [form, ownerDocument, ownerShadow] : [form, ownerDocument];

  const bindField = (element: Element, observed = false): void => {
    if (element.namespaceURI !== HTML_NAMESPACE) return;
    const control = element as HTMLElement;
    const initialName = getControlName(control);
    if (observed && isUnboundAtCurrentAssociation(control, initialName)) return;

    const previous = getControlBinding(control);
    if (formBindings.get(form) !== formBinding) return;
    if (previous?.owner === formBinding && previous.name === initialName) {
      // A transient rename or owner change can block an effect before the observer delivers.
      previous.replay();
      return;
    }
    previous?.dispose();
    // Teardown can change the control's name or form synchronously.
    const name = previous ? getControlName(control) : initialName;
    if (
      !name ||
      !belongsToForm(control, form, getFormOwner(control)) ||
      formBindings.get(form) !== formBinding ||
      getControlBinding(control)
    ) {
      return;
    }
    if (observed && isUnboundAtCurrentAssociation(control, name)) return;

    const entry = ensureField(name);
    let valueSync: ValueSync | undefined;
    let validation: ReturnType<typeof createValidationEffect> | undefined;
    let wasSuspended = false;
    const disposeResources = () => {
      const result = Result.tryCatch(() => {
        try {
          valueSync?.dispose();
        } finally {
          try {
            validation?.dispose();
          } finally {
            if (--entry.refCount === 0) {
              entries.delete(name);
              entry.atom.dispose();
            }
          }
        }
      });
      if (Result.isErr(result)) {
        debug.error(
          SYSTEM_BINDING.PREFIX,
          SYSTEM_BINDING.ERRORS.CLEANUP_ERROR(getSelector(control)),
          result.error
        );
      }
    };
    let unregister: (() => void) | undefined;
    const binding: ControlBinding = {
      owner: formBinding,
      element: control,
      name,
      replay() {
        const access = getAccess();
        if (access === 'blocked') return;
        const resumed = access === 'owned' && wasSuspended;
        wasSuspended = access === 'suspended';
        // An edit made while suspended did not update the model.
        valueSync?.replay(resumed);
        validation?.replay();
      },
      dispose() {
        if (!boundControls.delete(binding)) return;
        if (getControlBinding(control) === binding) fieldSlots.delete(control);
        try {
          unregister?.();
        } finally {
          disposeResources();
        }
      },
    };

    const getAccess = () => {
      const access = resolveFieldAccess(binding);
      if (access === 'suspended') wasSuspended = true;
      return access;
    };
    const isCurrent = () => getAccess() === 'owned';
    const { transform, onChange } = options;
    const commit = (targetValue: unknown): void => {
      if (!isCurrent()) return;
      let value = targetValue;
      if (transform) {
        const result = Result.tryCatch(() => transform(name, targetValue));
        if (Result.isErr(result)) {
          console.error(`[bindForm] Transform error in field "${name}":`, result.error);
        } else {
          value = result.value;
        }
        // Application callbacks can move, rename, or unbind the control synchronously.
        if (!isCurrent()) return;
      }
      entry.atom.value = value;
      if (onChange) {
        const result = Result.tryCatch(() => untracked(() => onChange(name, value)));
        if (Result.isErr(result)) {
          console.error(`[bindForm] onChange error in field "${name}":`, result.error);
        }
      }
    };

    boundControls.add(binding);
    fieldSlots.set(control, { kind: 'bound', binding });
    try {
      unregister = registry.onCleanup(
        control,
        (reason) => {
          try {
            if (reason === 'unbind' && getControlBinding(control) === binding) {
              const association = getControlAssociation(control, getControlName(control));
              if (getControlBinding(control) === binding) {
                fieldSlots.set(control, { kind: 'explicitlyUnbound', association });
              }
            }
          } finally {
            binding.dispose();
          }
        },
        getRemovalRoots
      );
      if (!boundControls.has(binding)) {
        unregister();
        return;
      }
      const input = control.localName === 'input' ? (control as HTMLInputElement) : undefined;
      if (input && (input.type === 'radio' || input.type === 'checkbox')) {
        const toggle = bindToggle(
          input,
          entry.atom,
          input.value,
          input.type === 'checkbox',
          getAccess,
          commit
        );
        if (!boundControls.has(binding)) {
          toggle.dispose();
          return;
        }
        valueSync = toggle;
      } else {
        const valueOptions: ValOptions<unknown> = {};
        if (options.debounce !== undefined) valueOptions.debounce = options.debounce;
        if (options.event !== undefined) valueOptions.event = options.event;
        if (options.parse !== undefined) valueOptions.parse = options.parse;
        if (options.format !== undefined) {
          valueOptions.format = (value) => options.format?.(value as U) ?? String(value ?? '');
        }
        if (options.equal !== undefined) {
          valueOptions.equal = (first, second) => options.equal?.(first as U, second as U) ?? false;
        }
        const valueBinding = createInputBinding(control, entry.atom, valueOptions, {
          getAccess,
          commit,
        });
        if (!boundControls.has(binding)) return;
        valueSync = valueBinding;
        valueBinding?.start();
      }

      if (!boundControls.has(binding)) return;
      const validate =
        options.validation && Object.hasOwn(options.validation, name)
          ? options.validation[name]
          : undefined;
      // These elements are always barred; no change can make their custom error readable.
      const tag = control.localName;
      if (
        validate &&
        tag !== 'fieldset' &&
        tag !== 'output' &&
        tag !== 'object' &&
        boundControls.has(binding)
      ) {
        validation = createValidationEffect(binding, entry.atom, validate);
        validation.start();
      }
    } catch (error) {
      binding.dispose();
      throw error;
    }
  };

  const bindCurrentFields = (onError?: (error: unknown) => void, observed = false): void => {
    // A formatter or validator may modify the live collection during initialization.
    for (const control of Array.from(getFormElements.call(form))) {
      if (formBindings.get(form) !== formBinding) break;
      try {
        bindField(control, observed);
      } catch (error) {
        if (!onError) throw error;
        onError(error);
      }
    }
  };

  const rootObserver = getOrCreateRootObserver(form);
  const reconcileObservedField = (element: Element, ownerChanged = false) => {
    if (
      element === form ||
      !Node.prototype.contains.call(form, element) ||
      isUnboundAtCurrentAssociation(element)
    ) {
      return;
    }
    const owner = getFormOwner(element);
    if (owner === undefined && ownerChanged) return;
    const binding = owner === undefined ? formBinding : owner && formBindings.get(owner);
    if (binding) binding.bindField(element, true);
    else {
      const previous = getControlBinding(element);
      if (previous && owner === null && isSuspendedExternalField(previous)) previous.replay();
      else previous?.dispose();
    }
  };
  const releaseDepartedControl = (element: Element): void => {
    isUnboundAtCurrentAssociation(element);
    const binding = getControlBinding(element);
    if (binding?.owner === formBinding && resolveFieldAccess(binding) !== 'owned') {
      binding.dispose();
    }
  };
  const unsubscribeNodeRemoved = rootObserver.onNodeRemoved((node, record) => {
    if (getNodeType.call(node) !== Node.ELEMENT_NODE || registry.isPreservedRemoval(node, record))
      return;
    releaseDepartedControl(node as Element);
    for (const child of Element.prototype.querySelectorAll.call(node, '*')) {
      releaseDepartedControl(child);
    }
  });
  const unsubscribeNodeAdded = rootObserver.onNodeAdded(SELECTOR, reconcileObservedField);
  const unsubscribeNameChanged = rootObserver.onAttributeChanged('name', reconcileObservedField);
  const unsubscribeFormChanged = rootObserver.onAttributeChanged('form', (element) => {
    reconcileObservedField(element, true);
  });
  const initialRoot = getRootNode.call(form);
  let ownerDocument = getOwnerDocument.call(form);
  let ownerShadow = isShadowRoot(initialRoot) ? initialRoot : undefined;
  let wasConnected = isConnected.call(form);
  let unwatchDocument = watchFormOwners(ownerDocument, form);
  let unwatchShadow = ownerShadow && watchFormOwners(ownerShadow, form);
  const formBinding: FormBinding = {
    form,
    get watchesShadow() {
      return ownerShadow !== undefined;
    },
    detachedFrom: undefined,
    bindField,
    refresh(checkRoot = false): void {
      const root = getRootNode.call(form);
      const connected = isConnected.call(form);
      if (connected) formBinding.detachedFrom = undefined;
      const becameConnected = connected && !wasConnected;
      wasConnected = connected;
      // Retain the last shadow subscription during a detach. Also watch the document as a
      // destination: its insertion may arrive after the shadow root delivered the removal.
      const shadow = isShadowRoot(root) ? root : undefined;
      if (getNodeType.call(root) === Node.DOCUMENT_NODE || shadow) {
        const currentDocument = getOwnerDocument.call(form);
        if (ownerDocument !== currentDocument) {
          unwatchDocument();
          ownerDocument = currentDocument;
          unwatchDocument = watchFormOwners(ownerDocument, form);
        } else if (checkRoot && ownerShadow === shadow && !becameConnected) {
          return;
        }
        if (ownerShadow !== shadow) {
          unwatchShadow?.();
          ownerShadow = shadow;
          unwatchShadow = shadow && watchFormOwners(shadow, form);
        }
        if (shadow) registry.registerShadowAncestors(form);
      } else if (checkRoot) {
        return;
      }

      const reportError = (error: unknown) => console.error('Error reconciling form owner:', error);
      for (const binding of boundControls) {
        if (formBindings.get(form) !== formBinding) return;
        try {
          if (resolveFieldAccess(binding) === 'blocked') binding.dispose();
        } catch (error) {
          reportError(error);
        }
      }
      // Controls already in the destination may never have produced an observed record.
      bindCurrentFields(reportError, checkRoot);
    },
  };

  registry.onCleanup(
    form,
    () => {
      if (formBindings.get(form) === formBinding) formBindings.delete(form);
      unsubscribeNodeRemoved();
      unsubscribeNodeAdded();
      unsubscribeNameChanged();
      unsubscribeFormChanged();
      unwatchDocument();
      unwatchShadow?.();
      for (const binding of boundControls) binding.dispose();
    },
    getRemovalRoots
  );
  formBindings.set(form, formBinding);
  try {
    bindCurrentFields();
  } catch (error) {
    if (formBindings.get(form) === formBinding) registry.cleanup(form);
    throw error;
  }
}
