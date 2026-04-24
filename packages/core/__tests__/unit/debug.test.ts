import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { atom, computed, runtimeDebug as debug, effect } from '@/index';

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
      expect(spy).toHaveBeenCalled();

      // 2. Computed Dirty Check (propagation)
      const src = atom(0);
      const c = computed(() => src.value * 2);
      void c.value; // prime
      spy.mockClear();
      src.value = 2;
      expect(spy).toHaveBeenCalled();

      // 3. Effect Execution
      const fx = effect(() => {
        void src.value;
      });
      spy.mockClear();
      src.value = 3;
      expect(spy).toHaveBeenCalled();

      a.dispose();
      src.dispose();
      c.dispose();
      fx.dispose();
    });
  });

  describe('Global Inspection (DevTools Registry)', () => {
    it('captures the graph state and handles disposed nodes gracefully', () => {
      debug.enabled = true;
      const a = atom(1, { name: 'Active_Node' });
      const b = atom(2, { name: 'Disposed_Node' });

      // @ts-expect-error: Internal method for instrumentation
      debug.registerNode(a);
      // @ts-expect-error: Internal method for instrumentation
      debug.registerNode(b);
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
  });
});
