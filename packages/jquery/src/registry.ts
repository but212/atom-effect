import { ERROR_MESSAGES, LOG_PREFIXES } from './constants';
import { debug } from './debug';
import type { EffectObject } from './types';
import { getSelector } from './utils';

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
      res = {};
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

  cleanup(el: Element): void {
    // Optimization: Single lookup + delete.
    const record = this.records.get(el);
    if (!record) {
      // Already cleaned up or never bound.
      // Ensure specific class is removed just in case of stale DOM state.
      if (el.isConnected) el.classList.remove(AES_BOUND);
      this.preservedNodes.delete(el);
      this.ignoredNodes.delete(el);
      return;
    }

    // Atomic deletion doubles as a re-entry guard.
    this.records.delete(el);
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    // Avoid a classList write for elements that are already leaving the DOM —
    // the browser will discard the class along with the node.
    if (el.isConnected) {
      el.classList.remove(AES_BOUND);
    }

    if (debug.enabled) {
      debug.cleanup(LOG_PREFIXES.BINDING, getSelector(el));
    }

    // Step 0 — Component cleanup runs first so the component can unmount
    // gracefully before its reactive effects are severed.
    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT_CLEANUP_ERROR(), e);
      }
    }

    // Step 1 — Sever atom → effect subscriptions.
    if (record.effects) {
      const effects = record.effects;
      for (let i = 0, len = effects.length; i < len; i++) {
        try {
          effects[i]!.dispose();
        } catch (e) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.EFFECT_DISPOSE_ERROR(), e);
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
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING_CLEANUP_ERROR(), e);
        }
      }
    }
  }

  cleanupDescendants(el: Element): void {
    // getElementsByClassName is significantly faster than querySelectorAll as it
    // avoids the CSS selector parsing engine and returns a live HTMLCollection.
    // Iterating backwards handles live collection mutations gracefully, though
    // cleanup() doesn't immediately remove elements from the tree.
    const descendants = el.getElementsByClassName(AES_BOUND);
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

  cleanupTree(el: Element): void {
    this.cleanupDescendants(el);
    this.cleanup(el);
  }
}

// ============================================================================
// Singleton + auto-cleanup
// ============================================================================

export const registry = new BindingRegistry();

let observer: MutationObserver | null = null;
let observedRoot: Element | null = null;

/**
 * Starts observing `root` for removed elements and automatically disposes
 * their reactive bindings when they leave the DOM.
 *
 * The `root` parameter is required (no default) to make the caller explicit
 * about which subtree is being observed — `document.body` can be null if the
 * script runs before the body is parsed.
 *
 * Idempotent: calling more than once with the same root before
 * `disableAutoCleanup` has no effect. Calling with a different root while
 * already active emits a warning and returns without re-observing.
 */
export function enableAutoCleanup(root: Element): void {
  if (observer !== null) {
    if (observedRoot !== root) {
      debug.warn(
        LOG_PREFIXES.BINDING,
        'enableAutoCleanup() called with a different root while already active. Observation was NOT switched — call disableAutoCleanup() first.',
        { current: observedRoot, requested: root }
      );
    }
    return;
  }

  observedRoot = root;
  observer = new MutationObserver((mutations) => {
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
}

/**
 * Stops the MutationObserver started by `enableAutoCleanup`.
 */
export function disableAutoCleanup(): void {
  observer?.disconnect();
  observer = null;
  observedRoot = null;
}
