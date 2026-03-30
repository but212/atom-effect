import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import {
  type BindingRecord,
  bindingRecordPool,
  cleanupsArrayPool,
  effectsArrayPool,
} from '@/internal/pool';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';

let autoCleanupScheduled = false;

/**
 * Ensures that the MutationObserver for automatic cleanup is active.
 * Lazily triggered on the first reactive binding registration.
 */
function ensureAutoCleanup(): void {
  if (autoCleanupScheduled) return;
  autoCleanupScheduled = true;
  if (typeof document !== 'undefined' && document.body) {
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

  trackEffect(el: Element, fx: EffectObject): void {
    const r = this.getOrCreateRecord(el);
    if (!r.effects) r.effects = effectsArrayPool.acquire();
    r.effects.push(fx);
  }

  trackCleanup(el: Element, fn: () => void): void {
    const r = this.getOrCreateRecord(el);
    if (!r.cleanups) r.cleanups = cleanupsArrayPool.acquire();
    r.cleanups.push(fn);
  }

  setComponentCleanup(el: Element, fn: (() => void) | undefined): void {
    this.getOrCreateRecord(el).componentCleanup = fn;
  }

  hasBind(el: Element): boolean {
    return this.records.has(el);
  }

  cleanup(el: Element | Node): void {
    const record = this.records.get(el as Element);
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);
    if (!record) {
      if (el.nodeType === 1) (el as Element).classList.remove(AES_BOUND);
      return;
    }

    this.records.delete(el as Element);
    if (el.nodeType === 1) (el as Element).classList.remove(AES_BOUND);

    if (debug.enabled)
      debug.cleanup(
        LOG_PREFIXES.BINDING,
        el.nodeType === 1 ? getSelector(el as Element) : el.nodeName || 'Node'
      );

    const selector = el.nodeType === 1 ? getSelector(el as Element) : 'Node';
    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), e);
      }
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
    const descendants =
      'getElementsByClassName' in el && typeof el.getElementsByClassName === 'function'
        ? el.getElementsByClassName(AES_BOUND)
        : el.querySelectorAll(`.${AES_BOUND}`);
    for (let i = descendants.length - 1; i >= 0; i--) {
      const child = descendants[i] as Element;
      if (this.records.has(child)) this.cleanup(child);
      else child.classList.remove(AES_BOUND);
    }
  }

  cleanupTree(el: Element | Node): void {
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
