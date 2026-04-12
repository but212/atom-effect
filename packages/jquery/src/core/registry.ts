import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';
import {
  type BindingRecord,
  bindingRecordPool,
  cleanupsArrayPool,
  effectsArrayPool,
} from '@/utils/pool';

let autoCleanupScheduled = false;

/**
 * Ensures that the MutationObserver for automatic cleanup is active.
 * Lazily triggered on the first reactive binding registration.
 */
function ensureAutoCleanup(): void {
  if (autoCleanupScheduled) return;
  if (typeof document !== 'undefined' && document.body) {
    autoCleanupScheduled = true;
    enableAutoCleanup(document.body);
  }
}

/**
 * CSS class added to every element that has at least one active binding.
 * Used by `querySelectorAll` in `cleanupDescendants` for efficient subtree traversal.
 * Internal use only.
 */
const AES_BOUND = '_aes-bound';

// BindingRecord type is defined in @/internal/pool to co-locate with its ObjectPool.

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
  private preservedNodes = new WeakSet<Node>();
  private ignoredNodes = new WeakSet<Node>();

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

  private getOrCreateRecord(el: Element): BindingRecord {
    ensureAutoCleanup();
    let res = this.records.get(el);
    if (!res) {
      res = bindingRecordPool.acquire();
      this.records.set(el, res);
      el.classList.add(AES_BOUND);
    }
    return res;
  }

  /**
   * Registers a reactive effect with an element's record.
   * Effects are automatically disposed when the element is removed from the DOM.
   *
   * @param el - The DOM element to bind the effect to.
   * @param fx - The reactive effect instance.
   */
  trackEffect(el: Element, fx: EffectObject): void {
    const record = this.getOrCreateRecord(el);
    if (!record.effects) {
      record.effects = effectsArrayPool.acquire();
    }
    record.effects.push(fx);
  }

  /**
   * Registers an arbitrary cleanup function with an element's record.
   * Cleanups are executed when the element is removed from the DOM.
   *
   * @param el - The DOM element to bind the cleanup to.
   * @param fn - The cleanup function (e.g., event unbinding, timer clear).
   */
  trackCleanup(el: Element, fn: () => void): void {
    const record = this.getOrCreateRecord(el);
    if (!record.cleanups) {
      record.cleanups = cleanupsArrayPool.acquire();
    }
    record.cleanups.push(fn);
  }

  /**
   * Assigns a component-level cleanup function (e.g., from atomMount).
   * Unlike generic cleanups, there can only be one component cleanup per element.
   */
  setComponentCleanup(el: Element, fn: (() => void) | undefined): void {
    this.getOrCreateRecord(el).componentCleanup = fn;
  }

  hasBind(el: Element): boolean {
    return this.records.has(el);
  }

  cleanup(el: Node): void {
    // Shared deletions for all node types
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    if (el.nodeType !== 1) return; // Only Elements can have bindings

    const element = el as Element;
    const record = this.records.get(element);

    if (!record) {
      element.classList.remove(AES_BOUND);
      return;
    }

    this.records.delete(element);
    element.classList.remove(AES_BOUND);

    const selector = getSelector(element);
    debug.cleanup(LOG_PREFIXES.BINDING, selector);

    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), e);
      }
      record.componentCleanup = undefined;
    }

    if (record.effects) {
      for (const fx of record.effects) {
        try {
          fx.dispose();
        } catch (e) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector), e);
        }
      }
      effectsArrayPool.release(record.effects);
      record.effects = undefined;
    }

    if (record.cleanups) {
      for (const fn of record.cleanups) {
        try {
          fn();
        } catch (e) {
          debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.CLEANUP_ERROR(selector), e);
        }
      }
      cleanupsArrayPool.release(record.cleanups);
      record.cleanups = undefined;
    }
    bindingRecordPool.release(record);
  }

  cleanupDescendants(el: Element | DocumentFragment | ShadowRoot): void {
    // Fast path: getElementsByClassName is significantly faster than querySelectorAll
    const live =
      'getElementsByClassName' in el
        ? (el as Element).getElementsByClassName(AES_BOUND)
        : el.querySelectorAll(`.${AES_BOUND}`);

    const len = live.length;
    if (len === 0) return;

    // Snapshot to avoid issues with live collection changing during cleanup
    const snapshot = new Array<Element>(len);
    for (let i = 0; i < len; i++) snapshot[i] = live[i]!;

    for (let i = len - 1; i >= 0; i--) {
      const child = snapshot[i]!;
      if (this.records.has(child)) {
        this.cleanup(child);
      } else {
        child.classList.remove(AES_BOUND);
      }
    }
  }

  cleanupTree(el: Node): void {
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

const observers = new Map<Node, MutationObserver>();

/**
 * Starts observing `root` for removed elements and automatically disposes
 * their reactive bindings when they leave the DOM.
 *
 * Supports Element, ShadowRoot, and DocumentFragment roots.
 * Multiple roots can be observed concurrently (e.g. for Micro-Frontends).
 */
export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  // Idempotent: calling more than once with the same root has no effect.
  if (observers.has(root)) {
    return;
  }

  const observer = new MutationObserver((mutations) => {
    const reg = registry;
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, rLen = removedNodes.length; j < rLen; j++) {
        const node = removedNodes[j]!;

        // Performance: skip non-element nodes early
        if (node.nodeType !== 1) continue;

        // Skip nodes that were moved (still connected elsewhere)
        if ((node as Element).isConnected) continue;

        const el = node as Element;
        if (reg.isKept(el) || reg.isIgnored(el)) continue;

        reg.cleanupTree(el);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
}

/**
 * Marks the auto-cleanup as scheduled or already running.
 * Used internally and by reset helpers in tests.
 */
export function setAutoCleanupScheduled(scheduled: boolean): void {
  autoCleanupScheduled = scheduled;
}

/**
 * Stops all MutationObservers started by `enableAutoCleanup`.
 */
export function disableAutoCleanup(): void {
  observers.forEach((obs) => obs.disconnect());
  observers.clear();
}
