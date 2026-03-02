import { ERROR_MESSAGES, LOG_PREFIXES } from '../constants';
import { debug } from '../utils/debug';
import type { EffectObject } from '../types';
import { getSelector } from '../utils';

/**
 * CSS class added to every element that has at least one active binding.
 * Used by `querySelectorAll` in `cleanupDescendants` for efficient subtree traversal.
 * Internal use only.
 */
const AES_BOUND = '_aes-bound';

/**
 * Per-element record of all reactive resources that must be released on cleanup.
 * Fields are optional to avoid allocating arrays for the common case where only
 * one resource type is used.
 */
interface BindingRecord {
  effects?: EffectObject[] | undefined;
  cleanups?: Array<() => void> | undefined;
  componentCleanup?: (() => void) | undefined;
}

// ============================================================================
// BindingRegistry
// ============================================================================

/**
 * Central registry mapping DOM elements to their reactive binding records.
 *
 * Design goals:
 * - Zero memory leaks: all collections use WeakMap/WeakSet keyed by Element.
 * - Minimal allocations in the hot tracking path.
 * - O(bound-descendants) cleanup via a single querySelectorAll pass.
 */
class BindingRegistry {
  private records = new WeakMap<Element, BindingRecord>();

  // boundElements removed: records is now the Single Source of Truth.
  // WeakMap.has() provides the existence check.

  private preservedNodes = new WeakSet<Node>();
  private ignoredNodes = new WeakSet<Node>();

  // --------------------------------------------------------------------------
  // Lifecycle flags
  // --------------------------------------------------------------------------

  keep(node: Node): void {
    this.preservedNodes.add(node);
  }

  isKept(node: Node): boolean {
    return this.preservedNodes.has(node);
  }

  markIgnored(node: Node): void {
    this.ignoredNodes.add(node);
  }

  isIgnored(node: Node): boolean {
    return this.ignoredNodes.has(node);
  }

  // --------------------------------------------------------------------------
  // Tracking
  // --------------------------------------------------------------------------

  private getOrCreateRecord(el: Element): BindingRecord {
    let res = this.records.get(el);
    if (!res) {
      // V8 Optimization: Enforce monomorphic object shape from creation time.
      res = { effects: undefined, cleanups: undefined, componentCleanup: undefined };
      this.records.set(el, res);
      el.classList.add(AES_BOUND);
    }
    return res;
  }

  trackEffect(el: Element, fx: EffectObject): void {
    const record = this.getOrCreateRecord(el);
    record.effects ??= [];
    record.effects.push(fx);
  }

  trackCleanup(el: Element, fn: () => void): void {
    const record = this.getOrCreateRecord(el);
    record.cleanups ??= [];
    record.cleanups.push(fn);
  }

  setComponentCleanup(el: Element, fn: (() => void) | undefined): void {
    const record = this.getOrCreateRecord(el);
    record.componentCleanup = fn;
  }

  hasBind(el: Element): boolean {
    return this.records.has(el);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  cleanup(el: Element | Node): void {
    // Optimization: Single lookup + delete.
    const record = this.records.get(el as Element);
    if (!record) {
      // Already cleaned up or never bound.
      // Ensure specific class is removed unconditionally just in case of stale DOM state
      // (e.g. detached node being re-inserted).
      if (el.nodeType === 1) (el as Element).classList.remove(AES_BOUND);
      this.preservedNodes.delete(el);
      this.ignoredNodes.delete(el);
      return;
    }

    // Atomic deletion doubles as a re-entry guard.
    this.records.delete(el as Element);
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    // Unconditionally remove the class to prevent "zombie markers".
    // If a detached node is cached by the user and re-inserted into the DOM later,
    // leaving the class would cause false-positive lookups during subtree cleanups.
    // (classList.remove on detached nodes is virtually free).
    if (el.nodeType === 1) (el as Element).classList.remove(AES_BOUND);

    if (debug.enabled) {
      const info = el.nodeType === 1 ? getSelector(el as Element) : el.nodeName || 'Node';
      debug.cleanup(LOG_PREFIXES.BINDING, info);
    }

    // Step 0 — Component cleanup runs first so the component can unmount
    // gracefully before its reactive effects are severed.
    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        const selector = el.nodeType === 1 ? getSelector(el as Element) : 'Node';
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), e);
      }
    }

    // Step 1 — Sever atom → effect subscriptions.
    if (record.effects) {
      const effects = record.effects;
      for (let i = 0, len = effects.length; i < len; i++) {
        try {
          effects[i]!.dispose();
        } catch (e) {
          const selector = el.nodeType === 1 ? getSelector(el as Element) : 'Node';
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector), e);
        }
      }
    }

    // Step 2 — Run general-purpose cleanup callbacks.
    if (record.cleanups) {
      const cleanups = record.cleanups;
      for (let i = 0, len = cleanups.length; i < len; i++) {
        try {
          cleanups[i]!();
        } catch (e) {
          const selector = el.nodeType === 1 ? getSelector(el as Element) : 'Node';
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.CLEANUP_ERROR(selector), e);
        }
      }
    }
  }

  cleanupDescendants(el: Element | DocumentFragment | ShadowRoot): void {
    // ⚠ Blind Spot Notice: Web Components & Shadow DOM
    // getElementsByClassName only traverses the Light DOM. If reactive elements
    // are placed inside a ShadowRoot, they will NOT be discovered or cleaned up
    // automatically by a parent's removal. Users must explicitly track and call
    // `registry.cleanupTree(shadowRoot)` to avoid memory leaks in Shadow DOMs.

    // is not available on ShadowRoot.
    const descendants =
      'getElementsByClassName' in el && typeof el.getElementsByClassName === 'function'
        ? el.getElementsByClassName(AES_BOUND)
        : el.querySelectorAll(`.${AES_BOUND}`);
    for (let i = descendants.length - 1; i >= 0; i--) {
      const child = descendants[i];
      if (!child) continue;

      if (this.records.has(child)) {
        this.cleanup(child);
      } else {
        // The AES_BOUND class is present but the registry has no record.
        // Remove the stale class and warn so it surfaces in debug mode.
        child.classList.remove(AES_BOUND);
        if (debug.enabled) {
          debug.warn(
            LOG_PREFIXES.BINDING,
            `${AES_BOUND} class found on unregistered element:`,
            child
          );
        }
      }
    }
  }

  cleanupTree(el: Element | Node): void {
    // 1: Element, 11: DocumentFragment or ShadowRoot
    if (el.nodeType === 1 || el.nodeType === 11) {
      this.cleanupDescendants(el as Element | DocumentFragment | ShadowRoot);
    }
    this.cleanup(el);
  }
}

// ============================================================================
// Singleton + auto-cleanup
// ============================================================================

export const registry = new BindingRegistry();

const observers = new Map<Element, MutationObserver>();

/**
 * Starts observing `root` for removed elements and automatically disposes
 * their reactive bindings when they leave the DOM.
 *
 * Multiple roots can be observed concurrently (e.g. for Micro-Frontends).
 * The `root` parameter is required (no default) to make the caller explicit
 * about which subtree is being observed.
 *
 * Idempotent: calling more than once with the same root has no effect.
 */
export function enableAutoCleanup(root: Element): void {
  // Support independent multiple roots for Micro-Frontend architectures.
  if (observers.has(root)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    // Optimization: raw for-loop avoids iterator allocations.
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, rLen = removedNodes.length; j < rLen; j++) {
        const node = removedNodes[j]!;

        // Only Element nodes can carry AES_BOUND bindings.
        // 1 === Node.ELEMENT_NODE
        if (node.nodeType !== 1) continue;

        // isConnected handles the move case.
        // isKept handles explicit .detach().
        // isIgnored handles .remove().
        if (node.isConnected || registry.isKept(node) || registry.isIgnored(node)) {
          continue;
        }

        registry.cleanupTree(node as Element);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
}

/**
 * Stops all MutationObservers started by `enableAutoCleanup`.
 */
export function disableAutoCleanup(): void {
  observers.forEach((obs) => obs.disconnect());
  observers.clear();
}
