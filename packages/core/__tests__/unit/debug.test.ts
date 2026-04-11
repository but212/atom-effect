import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEBUG_CONFIG } from '@/constants';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import type { Dependency } from '@/types';
import { debug, generateId, NO_DEFAULT_VALUE } from '@/utils/debug';

describe('Debug System', () => {
  let originalEnabled: boolean;
  let originalWarnLoop: boolean;

  beforeEach(() => {
    originalEnabled = debug.enabled;
    originalWarnLoop = debug.warnInfiniteLoop;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    debug.enabled = originalEnabled;
    debug.warnInfiniteLoop = originalWarnLoop;
    vi.restoreAllMocks();
  });

  describe('Core Naming & Metadata', () => {
    it('correctly attaches and retrieves non-enumerable debug metadata', () => {
      debug.enabled = true;
      const node = atom(0, { name: 'Store_User_Email' });

      expect(debug.getDebugName(node)).toBe('Store_User_Email');
      expect(debug.getDebugType(node)).toBe('atom');

      // Verification: Metadata should not pollute Object.keys or JSON.stringify
      expect(Object.keys(node)).not.toContain('Store_User_Email');
      expect(JSON.stringify(node)).not.toContain('Store_User_Email');

      node.dispose();
    });

    it('falls back to "type_id" pattern for unnamed nodes', () => {
      debug.enabled = true;
      const a = atom(0);
      expect(debug.getDebugName(a)).toMatch(/^atom_\d+$/);
      a.dispose();
    });

    it('remains inert when debugging is disabled or input is invalid', () => {
      debug.enabled = false;
      const node = atom(100);
      expect(debug.getDebugName(node)).toBeUndefined();

      debug.enabled = true;
      expect(debug.getDebugName(null)).toBeUndefined();
      expect(debug.getDebugName({})).toBeUndefined();

      node.dispose();
    });
  });

  describe('Auto-Instrumentation (Engine Integration)', () => {
    it('tracks updates automatically for Atom, Computed, and Effect', () => {
      const spy = vi.spyOn(debug, 'trackUpdate');

      // 1. Atom Write
      const a = atom(0);
      a.value = 1;
      expect(spy).toHaveBeenCalledWith(expect.any(Number), expect.stringContaining('atom'));

      // 2. Computed Dirty Check (propagation)
      const src = atom(0);
      const c = computed(() => src.value * 2);
      void c.value; // prime
      spy.mockClear();
      src.value = 2;
      expect(spy).toHaveBeenCalled(); // triggered via compute invalidation

      // 3. Effect Execution
      const fx = effect(() => {
        void src.value;
      });
      spy.mockClear();
      src.value = 3;
      expect(spy).toHaveBeenCalled(); // triggered via effect re-run

      a.dispose();
      src.dispose();
      c.dispose();
      fx.dispose();
    });
  });

  describe('Infinite Loop Protection', () => {
    it('triggers warning exactly when count exceeds threshold with the node name', () => {
      debug.enabled = true;
      debug.warnInfiniteLoop = true;

      const threshold = DEBUG_CONFIG.LOOP_THRESHOLD;
      const nodeName = 'Infinite_Loop_Node';
      const fakeId = 9999;

      // Below threshold: Silent
      for (let i = 0; i < threshold; i++) debug.trackUpdate(fakeId, nodeName);
      expect(console.warn).not.toHaveBeenCalled();

      // Exceed threshold: Warn with Name context
      debug.trackUpdate(fakeId, nodeName);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(`Infinite loop detected for ${nodeName}`)
      );
    });

    it('stays silent when disabled regardless of threshold', () => {
      debug.enabled = true;
      debug.warnInfiniteLoop = false;
      for (let i = 0; i < 200; i++) debug.trackUpdate(1);
      expect(console.warn).not.toHaveBeenCalled();
    });
  });

  describe('Global Inspection (DevTools Registry)', () => {
    it('captures the graph state and handles disposed nodes gracefully', () => {
      debug.enabled = true;
      const a = atom(1, { name: 'Active_Node' });
      const b = atom(2, { name: 'Disposed_Node' });

      debug.registerNode(a as unknown as Dependency);
      debug.registerNode(b as unknown as Dependency);
      b.dispose();

      const graph = debug.dumpGraph();
      // Active node must be present
      expect(graph.some((e) => (e as { name: string }).name === 'Active_Node')).toBe(true);

      // WeakRef behavior (dumpGraph should not throw if node is GCed/Disposed)
      expect(() => debug.dumpGraph()).not.toThrow();

      a.dispose();
    });
  });

  describe('Internal Diagnostics', () => {
    it('debug.warn outputs prefixed logs only when enabled', () => {
      debug.enabled = true;
      debug.warn(true, 'Hello');
      expect(console.warn).toHaveBeenCalledWith('[Atom Effect] Hello');

      vi.mocked(console.warn).mockClear();
      debug.enabled = false;
      debug.warn(true, 'Silent');
      expect(console.warn).not.toHaveBeenCalled();
    });

    it('generateId and constants provide unique identities', () => {
      expect(typeof NO_DEFAULT_VALUE).toBe('symbol');

      const id1 = generateId();
      const id2 = generateId();
      expect(id2).toBeGreaterThan(id1);
    });
  });
});
