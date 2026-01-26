import { debug } from './debug';
import type { EffectObject } from './types';
import { getSelector } from './utils';

/**
 * Marker class for bound elements to optimize selector engines.
 */
const AES_BOUND = '_aes-bound';

/**
 * Binding Registry
 *
 * Highly optimized for performance:
 * - Uses WeakMap for zero-leak DOM associations.
 * - Minimal allocations in the tracking path.
 * - Efficient tree traversal for cleanup.
 */
/**
 * Internal metadata for an element to improve cache locality.
 */
interface NodeMetadata {
  effects?: EffectObject[] | undefined;
  cleanups?: Array<() => void> | undefined;
  flags: number;
}

const FLAG_BOUND = 1 << 0;
const FLAG_PRESERVED = 1 << 1;
const FLAG_IGNORED = 1 << 2;

/**
 * Binding Registry
 *
 * Highly optimized for performance:
 * - Uses a single WeakMap to maximize cache hits and minimize lookups.
 * - Bitwise flags for various node states (bound, preserved, ignored).
 */
class BindingRegistry {
  private metadata = new WeakMap<Node, NodeMetadata>();

  private getOrInit(node: Node): NodeMetadata {
    let data = this.metadata.get(node);
    if (!data) {
      data = { flags: 0 };
      this.metadata.set(node, data);
    }
    return data;
  }

  keep(node: Node): void {
    const data = this.getOrInit(node);
    data.flags |= FLAG_PRESERVED;
  }

  isKept(node: Node): boolean {
    return !!((this.metadata.get(node)?.flags ?? 0) & FLAG_PRESERVED);
  }

  markIgnored(node: Node): void {
    const data = this.getOrInit(node);
    data.flags |= FLAG_IGNORED;
  }

  isIgnored(node: Node): boolean {
    return !!((this.metadata.get(node)?.flags ?? 0) & FLAG_IGNORED);
  }

  trackEffect(el: Element, fx: EffectObject): void {
    const data = this.getOrInit(el);
    if (!data.effects) data.effects = [];

    if (!(data.flags & FLAG_BOUND)) {
      data.flags |= FLAG_BOUND;
      el.classList.add(AES_BOUND);
    }
    data.effects.push(fx);
  }

  trackCleanup(el: Element, fn: () => void): void {
    const data = this.getOrInit(el);
    if (!data.cleanups) data.cleanups = [];

    if (!(data.flags & FLAG_BOUND)) {
      data.flags |= FLAG_BOUND;
      el.classList.add(AES_BOUND);
    }
    data.cleanups.push(fn);
  }

  hasBind(el: Element): boolean {
    return !!((this.metadata.get(el)?.flags ?? 0) & FLAG_BOUND);
  }

  cleanup(el: Element): void {
    const data = this.metadata.get(el);
    if (!data || !(data.flags & FLAG_BOUND)) return;

    // Reset flags and markers
    data.flags &= ~(FLAG_BOUND | FLAG_PRESERVED | FLAG_IGNORED);
    el.classList.remove(AES_BOUND);

    debug.cleanup(getSelector(el));

    // 1. Dispose Effects
    if (data.effects) {
      const effects = data.effects;
      for (let i = 0, len = effects.length; i < len; i++) {
        try {
          effects[i]?.dispose();
        } catch (e) {
          debug.warn('Effect dispose error:', e);
        }
      }
      data.effects = undefined;
    }

    // 2. Execute custom cleanups
    if (data.cleanups) {
      const cleanups = data.cleanups;
      for (let i = 0, len = cleanups.length; i < len; i++) {
        try {
          cleanups[i]?.();
        } catch (e) {
          debug.warn('Cleanup error:', e);
        }
      }
      data.cleanups = undefined;
    }

    // Fully remove from WeakMap if no flags remain
    if (data.flags === 0) {
      this.metadata.delete(el);
    }
  }

  cleanupDescendants(el: Element): void {
    const children = el.querySelectorAll(`.${AES_BOUND}`);
    for (let i = 0, len = children.length; i < len; i++) {
      const child = children[i] as Element;
      if (!child) continue;

      const data = this.metadata.get(child);
      if (data && data.flags & FLAG_BOUND) {
        this.cleanup(child);
      } else {
        child.classList.remove(AES_BOUND);
      }
    }
  }

  cleanupTree(el: Element): void {
    this.cleanupDescendants(el);
    this.cleanup(el);
  }
}

export const registry = new BindingRegistry();

let observer: MutationObserver | null = null;

export function enableAutoCleanup(root: Element = document.body): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (let i = 0, len = mutations.length; i < len; i++) {
      const mutation = mutations[i];
      if (!mutation) continue;
      const removed = mutation.removedNodes;
      for (let j = 0, rLen = removed.length; j < rLen; j++) {
        const node = removed[j];
        if (!node) continue;

        // Skip if kept (detached), explicitly ignored, or still connected
        if (registry.isKept(node) || registry.isIgnored(node) || node.isConnected) continue;

        if (node.nodeType === 1) {
          // Node.ELEMENT_NODE
          registry.cleanupTree(node as Element);
        }
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
}

export function disableAutoCleanup(): void {
  observer?.disconnect();
  observer = null;
}
