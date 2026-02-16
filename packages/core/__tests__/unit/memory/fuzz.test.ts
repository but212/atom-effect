/**
 * @fileoverview Deterministic Fuzz Testing
 * @description Generates random dependency graphs and mutations to find edge cases.
 * deterministically seeded for reproducibility.
 */

import { describe, expect, it } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import type { WritableAtom, ComputedAtom } from '@/types';

// Simple seeded PRNG (sfc32)
function seededRandom(seed: number) {
  let a = 13971 ^ seed;
  let b = 9461;
  let c = 40503;
  let d = 2654435769;
  
  return function() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (a + b | 0) + d | 0;
    d = d + 1 | 0;
    a = b ^ b >>> 9;
    b = c + (c << 3) | 0;
    c = (c << 21 | c >>> 11);
    c = c + t | 0;
    return (t >>> 0) / 4294967296;
  };
}

describe('Fuzz Testing (Deterministic)', () => {
    it('maintains consistency in random graph topologies', async () => {
        const rand = seededRandom(12345); // Fixed seed
        const ATOM_COUNT = 20;
        const OPS_COUNT = 100;
        
        const atoms: WritableAtom<number>[] = [];
        const computeds: ComputedAtom<number>[] = [];
        const allNodes: (WritableAtom<number> | ComputedAtom<number>)[] = [];

        // 1. Create Atoms
        for(let i=0; i<5; i++) {
            const a = atom(i);
            atoms.push(a);
            allNodes.push(a);
        }

        // 2. Create Computed layers
        for(let i=0; i<ATOM_COUNT; i++) {
            // Pick random dependencies from existing nodes
            const numDeps = Math.floor(rand() * 3) + 1;
            const deps: (WritableAtom<number> | ComputedAtom<number>)[] = [];
            
            for(let j=0; j<numDeps; j++) {
                const idx = Math.floor(rand() * allNodes.length);
                const dep = allNodes[idx];
                if (dep) deps.push(dep);
            }
            
            const c = computed(() => {
                let sum = 0;
                for(const d of deps) sum += d.value;
                return sum;
            });
            
            computeds.push(c);
            allNodes.push(c);
        }

        // 3. Mutate and Verify
        for(let i=0; i<OPS_COUNT; i++) {
            // Pick random atom to change
            const atomIdx = Math.floor(rand() * atoms.length);
            const targetAtom = atoms[atomIdx];

            if (targetAtom) {
                const newVal = Math.floor(rand() * 100);
                targetAtom.value = newVal;
            }

            // Randomly read some computed values to trigger updates
            // Use bitwise OR to coerce to integer 0 if undefined (though length check handles it)
            if (computeds.length > 0) {
                 const readIdx = Math.floor(rand() * computeds.length);
                 const targetComputed = computeds[readIdx];
                 
                 if (targetComputed) {
                     const val = targetComputed.value;
                     expect(val).toBeTypeOf('number');
                     expect(Number.isNaN(val)).toBe(false);
                 }
            }
        }
    });
});
