import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, runtimeDebug as debug, effect } from '@/index';

type DebugNode = Parameters<typeof debug.registerNode>[0];

const createMockNode = (id: number): DebugNode => ({
  id: id,
});

describe('Debug System', () => {
  const originalState = {
    enabled: debug.enabled,
    warnInfiniteLoop: debug.warnInfiniteLoop,
    trackGraph: debug.trackGraph,
  };

  const activeNodes: { dispose?: () => void }[] = [];

  const track = <T extends { dispose?: () => void }>(node: T): T => {
    activeNodes.push(node);
    return node;
  };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.enabled = true;
    debug.warnInfiniteLoop = true;
    debug.trackGraph = false;
  });

  afterEach(() => {
    Object.assign(debug, originalState);

    while (activeNodes.length > 0) {
      const node = activeNodes.pop();
      if (node && typeof node.dispose === 'function') {
        node.dispose();
      }
    }
  });

  describe('getDebugName() / getDebugType() / attachDebugInfo()', () => {
    it('should correctly attach and retrieve non-enumerable debug metadata', () => {
      const node = track(atom(0, { name: 'Store_User_Email' }));

      expect(debug.getDebugName(node)).toBe('Store_User_Email');
      expect(debug.getDebugType(node)).toBe('atom');

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

    it('should handle registering invalid nodes without id gracefully without throwing TypeError', () => {
      expect(() => {
        debug.registerNode({} as DebugNode);
      }).not.toThrow();
    });

    it('should update fallback name when attachDebugInfo updates type without customName', () => {
      const mockNode = createMockNode(999);
      debug.registerNode(mockNode);
      expect(debug.getDebugName(mockNode)).toBe('unknown_999');

      debug.attachDebugInfo(mockNode, 'atom', 999);
      expect(debug.getDebugName(mockNode)).toBe('atom_999');
    });
  });

  describe('trackUpdate()', () => {
    it('should track updates automatically for Atom, Computed, and Effect', () => {
      const spy = vi.spyOn(debug, 'trackUpdate');

      const a = track(atom(0));
      a.value = 1;
      expect(spy).toHaveBeenCalled();

      const src = track(atom(0));
      const c = track(computed(() => src.value * 2));
      void c.value;
      spy.mockClear();
      src.value = 2;
      expect(spy).toHaveBeenCalled();

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

  describe('registerNode() / dumpGraph()', () => {
    it('should capture the graph state and handle disposed nodes gracefully', () => {
      const a = track(atom(1, { name: 'Active_Node' }));
      const b = track(atom(2, { name: 'Disposed_Node' }));

      debug.registerNode(a);
      debug.registerNode(b);
      b.dispose();

      const graph = debug.dumpGraph();
      expect(graph.some((e) => e.name === 'Active_Node')).toBe(true);

      expect(() => debug.dumpGraph()).not.toThrow();
    });

    it('should maintain consistent dumpGraph results when toggling trackGraph', () => {
      debug.trackGraph = false;
      track(atom(0, { name: 'persistent-node' }));

      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);

      debug.trackGraph = true;
      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);
    });

    it('should register named nodes for finalization even if trackGraph is false', () => {
      const spy = vi.spyOn(debug, 'registerNode');
      debug.trackGraph = false;

      track(atom(0, { name: 'named-atom' }));

      expect(spy).toHaveBeenCalled();
    });

    it('should not include garbage-collected nodes in dumpGraph even when trackGraph is false', () => {
      debug.trackGraph = false;
      const node = track(atom(1, { name: 'GCed_Node' }));
      debug.registerNode(node);

      expect(debug.dumpGraph().some((e) => e.name === 'GCed_Node')).toBe(true);

      const derefSpy = vi.spyOn(WeakRef.prototype, 'deref').mockReturnValue(undefined);
      try {
        const graph = debug.dumpGraph();
        expect(graph.some((e) => e.name === 'GCed_Node')).toBe(false);
      } finally {
        derefSpy.mockRestore();
      }
    });

    it('should return empty graph if debug is disabled', () => {
      const node = track(atom(1, { name: 'Active_Node' }));
      debug.registerNode(node);

      debug.enabled = false;
      expect(debug.dumpGraph()).toEqual([]);
    });

    it('should not register nodes when debug is disabled', () => {
      debug.enabled = false;
      const node = track(atom(1, { name: 'Ignored_Node' }));
      const id = node.id;
      debug.registerNode(node);

      debug.enabled = true;
      expect(debug.dumpGraph().some((e) => e.id === id)).toBe(false);
    });
  });

  describe('warn()', () => {
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
