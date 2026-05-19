import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, runtimeDebug as debug, effect } from '@/index';

describe('Debug System', () => {
  // Store original state to restore after tests to prevent cross-test contamination
  const originalState = {
    enabled: debug.enabled,
    warnInfiniteLoop: debug.warnInfiniteLoop,
    trackGraph: debug.trackGraph,
  };

  // Tracking array for automatic cleanup of reactive nodes
  const activeNodes: { dispose?: () => void }[] = [];

  const track = <T extends { dispose?: () => void }>(node: T): T => {
    activeNodes.push(node);
    return node;
  };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Set a predictable baseline for each test
    debug.enabled = true;
    debug.warnInfiniteLoop = true;
    debug.trackGraph = false;
  });

  afterEach(() => {
    // Restore original global state
    Object.assign(debug, originalState);

    // Cleanup all registered nodes
    while (activeNodes.length > 0) {
      const node = activeNodes.pop();
      if (node && typeof node.dispose === 'function') {
        node.dispose();
      }
    }

    vi.restoreAllMocks();
  });

  describe('Metadata Management', () => {
    it('should correctly attach and retrieve non-enumerable debug metadata', () => {
      const node = track(atom(0, { name: 'Store_User_Email' }));

      expect(debug.getDebugName(node)).toBe('Store_User_Email');
      expect(debug.getDebugType(node)).toBe('atom');

      // Verification: Metadata should not pollute Object.keys or JSON.stringify
      expect(Object.keys(node)).not.toContain('Store_User_Email');
      expect(JSON.stringify(node)).not.toContain('Store_User_Email');
    });

    it('should fall back to "type_id" pattern for unnamed nodes', () => {
      const a = track(atom(0));
      expect(debug.getDebugName(a)).toMatch(/^atom_\d+$/);

      const c = track(computed(() => 0));
      expect(debug.getDebugName(c)).toMatch(/^calc_\d+$/);
      expect(debug.getDebugType(c)).toBe('computed');
    });

    it('should remain inert when debugging is disabled or input is invalid', () => {
      debug.enabled = false;
      const node = track(atom(100));
      expect(debug.getDebugName(node)).toBeUndefined();

      debug.enabled = true;
      expect(debug.getDebugName(null)).toBeUndefined();
      expect(debug.getDebugName({})).toBeUndefined();
    });
  });

  describe('Instrumentation', () => {
    it('should track updates automatically for Atom, Computed, and Effect', () => {
      const spy = vi.spyOn(debug, 'trackUpdate');

      // 1. Atom Write
      const a = track(atom(0));
      a.value = 1;
      expect(spy).toHaveBeenCalled();

      // 2. Computed Dirty Check (propagation)
      const src = track(atom(0));
      const c = track(computed(() => src.value * 2));
      void c.value; // prime the computed
      spy.mockClear();
      src.value = 2;
      expect(spy).toHaveBeenCalled();

      // 3. Effect Execution
      track(
        effect(() => {
          void src.value;
        })
      );
      spy.mockClear();
      src.value = 3;
      expect(spy).toHaveBeenCalled();
    });
  });

  describe('DevTools Integration', () => {
    it('should capture the graph state and handle disposed nodes gracefully', () => {
      const a = track(atom(1, { name: 'Active_Node' }));
      const b = track(atom(2, { name: 'Disposed_Node' }));

      debug.registerNode(a);
      debug.registerNode(b);
      b.dispose(); // Manually dispose for test case

      const graph = debug.dumpGraph();
      // Active node must be present
      expect(graph.some((e) => e.name === 'Active_Node')).toBe(true);

      // WeakRef behavior (dumpGraph should not throw if node is GCed/Disposed)
      expect(() => debug.dumpGraph()).not.toThrow();
    });

    it('should maintain consistent dumpGraph results when toggling trackGraph', () => {
      // Regression test: Ensures that nodes created while trackGraph is false
      // are still visible when trackGraph is enabled.
      debug.trackGraph = false;
      track(atom(0, { name: 'persistent-node' }));

      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);

      debug.trackGraph = true;
      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);
    });

    it('should register named nodes for finalization even if trackGraph is false', () => {
      // Regression test: Named nodes must always be registered for cleanup
      // regardless of the trackGraph setting to prevent memory leaks.
      const spy = vi.spyOn(debug, 'registerNode');
      debug.trackGraph = false;

      track(atom(0, { name: 'named-atom' }));

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('Diagnostics', () => {
    it('should output prefixed logs only when enabled', () => {
      debug.enabled = true;
      debug.warn(true, 'Hello');
      expect(console.warn).toHaveBeenCalledWith('[Atom Effect] Hello');

      vi.mocked(console.warn).mockClear();
      debug.enabled = false;
      debug.warn(true, 'Silent');
      expect(console.warn).not.toHaveBeenCalled();
    });
  });
});
