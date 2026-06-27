import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, runtimeDebug as debug, effect } from '@/index';
import type { DependencyId } from '@/types';
import { attachDebugInfo as wrapperAttachDebugInfo } from '@/utils/debug';

type DebugNode = Parameters<typeof debug.registerNode>[0];

const createMockNode = (id: number): DebugNode => ({
  id: id,
});

describe('Debug System', () => {
  const originalState = {
    isEnabled: debug.isEnabled,
    shouldWarnInfiniteLoop: debug.shouldWarnInfiniteLoop,
    shouldTrackGraph: debug.shouldTrackGraph,
  };

  const activeNodes: { dispose?: () => void }[] = [];

  const track = <T extends { dispose?: () => void }>(node: T): T => {
    activeNodes.push(node);
    return node;
  };

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    debug.isEnabled = true;
    debug.shouldWarnInfiniteLoop = true;
    debug.shouldTrackGraph = false;
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
      debug.isEnabled = false;
      const node = track(atom(100));
      expect(debug.getDebugName(node)).toBeUndefined();

      debug.isEnabled = true;
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

      const source = track(atom(0));
      const c = track(computed(() => source.value * 2));
      void c.value;
      spy.mockClear();
      source.value = 2;
      expect(spy).toHaveBeenCalled();

      track(
        effect(() => {
          void source.value;
        })
      );
      spy.mockClear();
      source.value = 3;
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
      debug.shouldTrackGraph = false;
      track(atom(0, { name: 'persistent-node' }));

      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);

      debug.shouldTrackGraph = true;
      expect(debug.dumpGraph().some((n) => n.name === 'persistent-node')).toBe(true);
    });

    it('should register named nodes for finalization even if trackGraph is false', () => {
      const spy = vi.spyOn(debug, 'registerNode');
      debug.shouldTrackGraph = false;

      track(atom(0, { name: 'named-atom' }));

      expect(spy).toHaveBeenCalled();
    });

    it('should not include garbage-collected nodes in dumpGraph even when trackGraph is false', () => {
      debug.shouldTrackGraph = false;
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

      debug.isEnabled = false;
      expect(debug.dumpGraph()).toEqual([]);
    });

    it('should not register nodes when debug is disabled', () => {
      debug.isEnabled = false;
      const node = track(atom(1, { name: 'Ignored_Node' }));
      const id = node.id;
      debug.registerNode(node);

      debug.isEnabled = true;
      expect(debug.dumpGraph().some((e) => e.id === id)).toBe(false);
    });
  });

  describe('isWarningCondition()', () => {
    it('should output prefixed logs only when enabled', () => {
      debug.isEnabled = true;
      debug.isWarningCondition(true, 'Hello');
      expect(console.warn).toHaveBeenCalledWith('[Atom Effect] Hello');

      vi.mocked(console.warn).mockClear();
      debug.isEnabled = false;
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('diagnostic controller modes', () => {
    it('registerNode and attachDebugInfo edge cases', () => {
      // Disabled mode
      debug.isEnabled = false;
      expect(debug.registerNode(createMockNode(1))).toBeUndefined();
      expect(debug.attachDebugInfo(createMockNode(1), 'atom', 1)).toBeUndefined();

      debug.isEnabled = true;
      // Null / non-objects / undefined id
      expect(debug.registerNode(null as unknown as DebugNode)).toBeUndefined();
      expect(debug.registerNode({} as unknown as DebugNode)).toBeUndefined();
      expect(debug.registerNode(123 as unknown as DebugNode)).toBeUndefined();
      expect(debug.attachDebugInfo(null as unknown as DebugNode, 'atom', 1)).toBeUndefined();
      expect(
        debug.attachDebugInfo(createMockNode(1), 'atom', undefined as unknown as DependencyId)
      ).toBeUndefined();
      expect(debug.attachDebugInfo(123 as unknown as DebugNode, 'atom', 1)).toBeUndefined();

      // customName === undefined && !this.trackGraph
      debug.shouldTrackGraph = false;
      const node = createMockNode(1001);
      expect(debug.attachDebugInfo(node, 'atom', 1001, undefined)).toBeUndefined();

      // resolveIdentity with non-object primitive
      expect(debug.getDebugName('hello' as unknown as object)).toBeUndefined();

      // attachDebugInfo customName update on existing entry (lines 137-138)
      const node2 = createMockNode(1002);
      debug.attachDebugInfo(node2, 'atom', 1002);
      debug.attachDebugInfo(node2, 'atom', 1002, 'custom-name');
      expect(debug.getDebugName(node2)).toBe('custom-name');
    });

    it('wrapper functions call underlying methods', () => {
      const spy = vi.spyOn(debug, 'attachDebugInfo');
      wrapperAttachDebugInfo(null as unknown as DebugNode, 'atom', 1);
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('ProdDebugController behaves as expected when dev mode is production', async () => {
      vi.doMock('@/constants', async () => {
        const actual = await vi.importActual<Record<string, unknown>>('@/constants');
        return {
          ...actual,
          IS_DEV: false,
        };
      });

      try {
        // @ts-expect-error
        const mod = await import('@/utils/debug?prod=2');
        const prodDebug = mod.debug;

        expect(prodDebug.isEnabled).toBe(false);
        expect(prodDebug.shouldWarnInfiniteLoop).toBe(false);
        expect(prodDebug.shouldTrackGraph).toBe(false);
        expect(prodDebug.dumpGraph()).toEqual([]);
        expect(prodDebug.getDebugName(null)).toBeUndefined();
        expect(prodDebug.getDebugType(null)).toBeUndefined();

        // No-ops
        expect(prodDebug.isWarningCondition(true, 'msg')).toBeUndefined();
        expect(prodDebug.registerNode(null as unknown as DebugNode)).toBeUndefined();
        expect(prodDebug.attachDebugInfo(null as unknown as DebugNode, 'atom', 1)).toBeUndefined();
        expect(prodDebug.trackUpdate(1)).toBeUndefined();
        expect(prodDebug.trackEvaluationFailure(1)).toBeUndefined();
      } finally {
        vi.doUnmock('@/constants');
      }
    });
  });
});
