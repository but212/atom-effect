import { ERROR_MESSAGES, LOG_PREFIXES } from '@/constants';
import type { EffectObject } from '@/types';
import { getSelector } from '@/utils';
import { debug } from '@/utils/debug';

let autoCleanupScheduled = false;

const AES_BOUND = '_aes-bound';

export interface BindingRecord {
  cleanups?: Array<() => void>;
  componentCleanup?: (() => void) | undefined;
}

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
    if (!autoCleanupScheduled && typeof document !== 'undefined' && document.body) {
      autoCleanupScheduled = true;
      enableAutoCleanup(document.body);
    }
    let res = this.records.get(el);
    if (!res) {
      res = {};
      this.records.set(el, res);
      el.classList.add(AES_BOUND);
    }
    return res;
  }

  private addCleanup(el: Element, fn: () => void): void {
    const record = this.getOrCreateRecord(el);
    if (!record.cleanups) record.cleanups = [];
    record.cleanups.push(fn);
  }

  trackEffect(el: Element, fx: EffectObject): void {
    const selector = getSelector(el);
    this.addCleanup(el, () => {
      try {
        fx.dispose();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.CORE.EFFECT_DISPOSE_ERROR(selector), e);
      }
    });
  }

  trackCleanup(el: Element, fn: () => void): void {
    const selector = getSelector(el);
    this.addCleanup(el, () => {
      try {
        fn();
      } catch (e) {
        debug.error(LOG_PREFIXES.BINDING, ERROR_MESSAGES.BINDING.CLEANUP_ERROR(selector), e);
      }
    });
  }

  setComponentCleanup(el: Element, fn: (() => void) | undefined): void {
    this.getOrCreateRecord(el).componentCleanup = fn;
  }

  hasBind(el: Element): boolean {
    return this.records.has(el);
  }

  cleanup(el: Node): void {
    this.preservedNodes.delete(el);
    this.ignoredNodes.delete(el);

    if (el.nodeType !== 1) return;
    const element = el as Element;
    const record = this.records.get(element);

    this.records.delete(element);
    element.classList.remove(AES_BOUND);

    if (!record) return;

    if (record.componentCleanup) {
      try {
        record.componentCleanup();
      } catch (e) {
        const selector = getSelector(element);
        debug.error(LOG_PREFIXES.MOUNT, ERROR_MESSAGES.MOUNT.CLEANUP_ERROR(selector), e);
      }
    }

    if (record.cleanups) {
      for (const fn of record.cleanups) fn();
    }
  }

  cleanupDescendants(el: Element | DocumentFragment | ShadowRoot): void {
    const nodes =
      'getElementsByClassName' in el
        ? (el as Element).getElementsByClassName(AES_BOUND)
        : el.querySelectorAll(`.${AES_BOUND}`);

    for (let i = nodes.length - 1; i >= 0; i--) {
      this.cleanup(nodes[i]!);
    }
  }

  cleanupTree(el: Node): void {
    if (el.nodeType === 1 || el.nodeType === 11) {
      this.cleanupDescendants(el as Element | DocumentFragment | ShadowRoot);
    }
    this.cleanup(el);
  }
}

export const registry = new BindingRegistry();

const observers = new Map<Node, MutationObserver>();

export function enableAutoCleanup(root: Element | ShadowRoot | DocumentFragment): void {
  if (observers.has(root)) return;

  const observer = new MutationObserver((mutations) => {
    for (let i = 0, mLen = mutations.length; i < mLen; i++) {
      const removedNodes = mutations[i]!.removedNodes;
      for (let j = 0, rLen = removedNodes.length; j < rLen; j++) {
        const node = removedNodes[j]!;

        if (node.nodeType !== 1 || (node as Element).isConnected) continue;

        const el = node as Element;

        if (registry.isKept(el) || registry.isIgnored(el)) continue;

        registry.cleanupTree(el);
      }
    }
  });

  observer.observe(root, { childList: true, subtree: true });
  observers.set(root, observer);
}

export function setAutoCleanupScheduled(scheduled: boolean): void {
  autoCleanupScheduled = scheduled;
}

export function disableAutoCleanup(): void {
  observers.forEach((obs) => obs.disconnect());
  observers.clear();
}
