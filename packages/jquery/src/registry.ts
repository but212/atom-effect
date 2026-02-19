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

  /**
   * Dual-purpose set:
   * 1. `hasBind()` membership check — O(1).
   * 2. Cleanup guard in `cleanup()` — atomically deleted to prevent re-entry.
   *
   * Invariant: an element is in `boundElements` if and only if it has a record
   * in `records`. The two collections are always mutated together.
   */
  private boundElements = new WeakSet<Element>();

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
      // boundElements and records are always in sync (see invariant above),
      // so no membership check is needed here — if records had no entry,
      // boundElements has no entry either.
      this.boundElements.add(el);
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
    return this.boundElements.has(el);
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  cleanup(el: Element): void {
    // Atomic delete doubles as a re-entry guard and an existence check.
    if (!this.boundElements.delete(el)) return;

    const record = this.records.get(el);
    if (!record) {
      // boundElements and records must always be in sync (see invariant).
      // Reaching here indicates a state desync — surface it for debugging.
      debug.warn(
        LOG_PREFIXES.BINDING,
        'registry desync: boundElements had entry but records did not for',
        el
      );
      el.classList.remove(AES_BOUND);
      this.preservedNodes.delete(el);
      this.ignoredNodes.delete(el);
      return;
    }

    this.records.delete(el);
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    // Avoid a classList write for elements that are already leaving the DOM —
    // the browser will discard the class along with the node.
    if (el.isConnected) {
      el.classList.remove(AES_BOUND);
    }

    if (debug.enabled) {
      debug.cleanup(getSelector(el));
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
    record.effects?.forEach((fx) => {
      try {
        fx.dispose();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.EFFECT_DISPOSE_ERROR(), e);
      }
    });

    // Step 2 — Run general-purpose cleanup callbacks.
    record.cleanups?.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING_CLEANUP_ERROR(), e);
      }
    });
  }

  cleanupDescendants(el: Element): void {
    // querySelectorAll returns a static NodeList — safe to iterate even though
    // cleanup() mutates boundElements and may trigger further DOM changes.
    el.querySelectorAll(`.${AES_BOUND}`).forEach((child) => {
      if (this.boundElements.has(child)) {
        this.cleanup(child);
      } else {
        // The AES_BOUND class is present but the registry has no record.
        // This indicates a state desync — the class was not removed when the
        // element was last cleaned up (e.g. a non-connected cleanup path).
        // Remove the stale class and warn so it surfaces in debug mode.
        child.classList.remove(AES_BOUND);
        debug.warn(
          LOG_PREFIXES.BINDING,
          `${AES_BOUND} class found on unregistered element:`,
          child
        );
      }
    });
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
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        // Only Element nodes can carry AES_BOUND bindings.
        // 1 === Node.ELEMENT_NODE; the global `Node` is not available in all
        // MutationObserver callback contexts (e.g. jsdom in some test setups).
        if (node.nodeType !== 1) return;

        // isConnected handles the move case: when a node is removed from one
        // parent and inserted into another in the same microtask, the
        // MutationObserver fires after both operations, so the node is already
        // reconnected. Skipping it here preserves its bindings correctly.
        //
        // isKept handles explicit .detach() — the element is temporarily out
        // of the DOM but should retain its bindings for re-attachment.
        //
        // isIgnored handles .remove() — the jquery-patch marks the element
        // before cleanupTree runs, preventing a redundant second cleanup here.
        if (node.isConnected || registry.isKept(node) || registry.isIgnored(node)) {
          return;
        }

        registry.cleanupTree(node as Element);
      });
    });
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
