import { describe, expect, it, vi } from 'vitest';
import { computed } from '../../../src/core/computed';
import { atom } from '../../../src/core/atom';
import { debug } from '../../../src/utils/debug';

describe('Computed - Extra Coverage', () => {
  it('covers debug fields in ComputedAtomImpl', () => {
    const wasEnabled = debug.enabled;
    debug.enabled = true;
    
    const c = computed(() => 1);
    const debugObj = c as any;
    
    expect(debugObj.subscriberCount()).toBe(0);
    expect(debugObj.isDirty()).toBe(true);
    expect(debugObj.dependencies).toBeDefined();
    expect(typeof debugObj.stateFlags).toBe('string');
    
    debug.enabled = wasEnabled;
  });

  it('covers nextDeps growth in collector', () => {
    // We need more than 16 (default pool size?) dependencies
    // Actually depArrayPool.acquire() returns an empty array usually.
    // If it's already full of large arrays?
    // Let's just access many atoms.
    const atoms = Array.from({ length: 300 }, (_, i) => atom(i));
    const c = computed(() => {
      let sum = 0;
      for (const a of atoms) sum += a.value;
      return sum;
    });
    expect(c.value).toBe(44850);
  });

  it('covers syncDependencies unsubpath', async () => {
    const a = atom(0);
    const b = atom(0);
    const cond = atom(true);
    
    const c = computed(() => {
      if (cond.value) return a.value;
      return b.value;
    });
    
    c.value; // Initial access
    expect((a as any).subscriberCount()).toBe(1);
    expect((b as any).subscriberCount()).toBe(0);

    cond.value = false;
    // Wait for async notification from cond to c
    await new Promise(resolve => setTimeout(resolve, 0));
    
    c.value; // recompute!
    
    expect((a as any).subscriberCount()).toBe(0);
    expect((b as any).subscriberCount()).toBe(1);
  });

});
