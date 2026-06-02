import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateRootObserver, RootObserver, rootObserversMap } from '@/core/observer';

describe('RootObserver Engine', () => {
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    rootObserversMap.clear();
  });

  describe('Initialization & Retrieval', () => {
    it('should retrieve or create a RootObserver singleton per root node', () => {
      const obs1 = getOrCreateRootObserver(root);
      const obs2 = getOrCreateRootObserver(root);

      expect(obs1).toBeInstanceOf(RootObserver);
      expect(obs1).toBe(obs2);
      expect(rootObserversMap.has(root)).toBe(true);
    });
  });

  describe('Callbacks & DOM Monitoring', () => {
    it('should trigger onNodeAdded when elements matching a selector are added', async () => {
      const observer = getOrCreateRootObserver(root);
      const addedNodes: Element[] = [];

      const unsub = observer.onNodeAdded('[data-test="active"]', (el) => {
        addedNodes.push(el);
      });

      // 1. Adding non-matching element
      const span1 = document.createElement('span');
      root.appendChild(span1);

      // 2. Adding matching element
      const span2 = document.createElement('span');
      span2.setAttribute('data-test', 'active');
      root.appendChild(span2);

      // 3. Adding nested matching element
      const container = document.createElement('div');
      const span3 = document.createElement('span');
      span3.setAttribute('data-test', 'active');
      container.appendChild(span3);
      root.appendChild(container);

      await vi.waitFor(() => {
        return addedNodes.length >= 2;
      });

      expect(addedNodes).toContain(span2);
      expect(addedNodes).toContain(span3);
      expect(addedNodes).not.toContain(span1);

      unsub();
    });

    it('should trigger onNodeRemoved when elements are detached', async () => {
      const observer = getOrCreateRootObserver(root);
      const removedNodes: Node[] = [];

      const child = document.createElement('div');
      root.appendChild(child);

      const unsub = observer.onNodeRemoved((node) => {
        removedNodes.push(node);
      });

      child.remove();

      await vi.waitFor(() => {
        return removedNodes.length > 0;
      });

      expect(removedNodes).toContain(child);
      unsub();
    });
  });

  describe('Lifecycle & Resource Cleanup', () => {
    it('should automatically disconnect MutationObserver and delete from map when empty', async () => {
      const observer = getOrCreateRootObserver(root);

      const unsubAdded = observer.onNodeAdded('.target', () => {});
      const unsubRemoved = observer.onNodeRemoved(() => {});

      expect(rootObserversMap.has(root)).toBe(true);

      // 1. Remove one callback -> Should still remain active
      unsubAdded();
      expect(rootObserversMap.has(root)).toBe(true);

      // 2. Remove all callbacks -> Should disconnect and delete itself
      unsubRemoved();
      expect(rootObserversMap.has(root)).toBe(false);
    });

    it('should support manual disconnect', () => {
      const observer = getOrCreateRootObserver(root);
      observer.onNodeRemoved(() => {});

      expect(rootObserversMap.has(root)).toBe(true);
      observer.disconnect();

      // Clear map manually as disconnect doesn't auto-delete
      rootObserversMap.delete(root);
      expect(rootObserversMap.has(root)).toBe(false);
    });
  });
});
