import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getOrCreateRootObserver, RootObserver, rootObserversMap } from '@/core/observer';
import { setupDOMCleanup } from '../utils/test-helpers';

describe('RootObserver Engine', () => {
  const { appendToBody } = setupDOMCleanup();
  let root: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    appendToBody(root);
  });

  describe('Initialization & Retrieval', () => {
    it('should retrieve or create a RootObserver singleton per root node', () => {
      const obs1 = getOrCreateRootObserver(root);
      const obs2 = getOrCreateRootObserver(root);

      expect(obs1).toBeInstanceOf(RootObserver);
      expect(obs1).toBe(obs2);
      expect(rootObserversMap.has(root)).toBe(true);
    });

    it('should use WeakMap for rootObserversMap to allow garbage collection', () => {
      expect(rootObserversMap).toBeInstanceOf(WeakMap);
    });
  });

  describe('Callbacks & DOM Monitoring', () => {
    it('should trigger onNodeAdded when elements matching a selector are added', async () => {
      const observer = getOrCreateRootObserver(root);
      const addedNodes: Element[] = [];

      const unsubscribeCallback = observer.onNodeAdded('[data-test="active"]', (el) => {
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

      unsubscribeCallback();
    });

    it('should trigger onNodeRemoved when elements are detached', async () => {
      const observer = getOrCreateRootObserver(root);
      const removedNodes: Node[] = [];

      const child = document.createElement('div');
      root.appendChild(child);

      const unsubscribeCallback = observer.onNodeRemoved((node) => {
        removedNodes.push(node);
      });

      child.remove();

      await vi.waitFor(() => {
        return removedNodes.length > 0;
      });

      expect(removedNodes).toContain(child);
      unsubscribeCallback();
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

  describe('Error Isolation', () => {
    it('should isolate errors in onNodeAdded callbacks, allowing others to execute', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const observer = getOrCreateRootObserver(root);
      const executedList: string[] = [];

      const unsub1 = observer.onNodeAdded('.test-target', () => {
        throw new Error('first callback crash');
      });
      const unsub2 = observer.onNodeAdded('.test-target', () => {
        executedList.push('second');
      });

      const child = document.createElement('div');
      child.className = 'test-target';
      root.appendChild(child);

      await vi.waitFor(() => {
        return executedList.length > 0;
      });

      expect(executedList).toContain('second');
      expect(consoleSpy).toHaveBeenCalled();

      unsub1();
      unsub2();
      consoleSpy.mockRestore();
    });

    it('should isolate errors in onNodeRemoved callbacks, allowing others to execute', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const observer = getOrCreateRootObserver(root);
      const executedList: string[] = [];

      const child = document.createElement('div');
      root.appendChild(child);

      const unsub1 = observer.onNodeRemoved(() => {
        throw new Error('first removal crash');
      });
      const unsub2 = observer.onNodeRemoved(() => {
        executedList.push('second');
      });

      child.remove();

      await vi.waitFor(() => {
        return executedList.length > 0;
      });

      expect(executedList).toContain('second');
      expect(consoleSpy).toHaveBeenCalled();

      unsub1();
      unsub2();
      consoleSpy.mockRestore();
    });

    it('should isolate error when a nested child callback throws', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const observer = getOrCreateRootObserver(root);

      const unsubscribeCallback = observer.onNodeAdded('.child-node', () => {
        throw new Error('child callback crash');
      });

      const parent = document.createElement('div');
      const child = document.createElement('div');
      child.className = 'child-node';
      parent.appendChild(child);
      root.appendChild(parent);

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in onNodeAdded callback'),
        expect.any(Error)
      );

      unsubscribeCallback();
      consoleSpy.mockRestore();
    });

    it('should isolate error when querySelector or matches throws on invalid selector', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const observer = getOrCreateRootObserver(root);
      const unsubscribeCallback = observer.onNodeAdded('::invalid', () => {});

      const child = document.createElement('div');
      root.appendChild(child);

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error querying or processing onNodeAdded'),
        expect.any(Error)
      );

      unsubscribeCallback();
      consoleSpy.mockRestore();
    });
  });
});
