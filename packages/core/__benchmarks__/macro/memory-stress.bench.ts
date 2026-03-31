/**
 * @fileoverview Memory stress macro-benchmark
 * @description Memory allocation, GC pressure, and leak detection
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../dist';
import { benchEffectOptions, forceGC, getMemoryUsage, memoryBenchOptions } from '../utils/setup.js';

describe('Memory Allocation', () => {
  bench(
    'create and dispose 1000 atoms',
    () => {
      const atoms = Array.from({ length: 1000 }, (_, i) => atom(i));
      atoms.forEach((a) => a.dispose());
      return atoms as any;
    },
    memoryBenchOptions
  );

  bench(
    'create and dispose 1000 computeds',
    () => {
      const a = atom(0);
      const computeds = Array.from({ length: 1000 }, (_, i) => computed(() => a.value + i));
      computeds.forEach((c) => c.dispose());
      a.dispose();
      return computeds as any;
    },
    memoryBenchOptions
  );

  bench(
    'create and dispose 1000 effects',
    () => {
      const a = atom(0);
      const effects = Array.from({ length: 1000 }, () => {
        let _value = 0;
        return effect(() => {
          _value = a.value;
        }, benchEffectOptions);
      });
      effects.forEach((e) => e.dispose());
      a.dispose();
      return effects as any;
    },
    memoryBenchOptions
  );
});

describe('GC Pressure', () => {
  bench(
    'rapid atom creation/disposal (10K cycles)',
    () => {
      let lastA;
      for (let i = 0; i < 10000; i++) {
        const a = atom(i);
        a.dispose();
        lastA = a;
      }
      return lastA as any;
    },
    memoryBenchOptions
  );

  bench(
    'subscription churn (1K subscribe/unsubscribe)',
    () => {
      let lastUnsub;
      const a = atom(0);
      for (let i = 0; i < 1000; i++) {
        const unsubscribe = a.subscribe(() => {});
        unsubscribe();
        lastUnsub = unsubscribe;
      }
      a.dispose();
      return lastUnsub as any;
    },
    memoryBenchOptions
  );

  bench(
    'object pooling stress (10K objects)',
    () => {
      const atoms = Array.from({ length: 100 }, (_, i) => atom({ id: i, data: [] as number[] }));

      // Rapid updates to trigger object pooling
      for (let cycle = 0; cycle < 100; cycle++) {
        atoms.forEach((a) => {
          a.value = { id: a.value.id, data: Array.from({ length: 100 }, (_, i) => i) };
        });
      }

      atoms.forEach((a) => a.dispose());
      return atoms as any;
    },
    memoryBenchOptions
  );
});

describe('Memory Leak Detection', () => {
  bench(
    'weak reference cleanup (1K atoms)',
    () => {
      // Create atoms with dependencies
      const root = atom(0);
      const computeds = Array.from({ length: 1000 }, (_, i) => computed(() => root.value + i));

      // Dispose computeds (should allow GC)
      computeds.forEach((c) => c.dispose());

      // Force GC if available
      forceGC();

      root.dispose();
      return computeds as any;
    },
    memoryBenchOptions
  );

  bench(
    'effect cleanup (1K effects with cleanup)',
    () => {
      const a = atom(0);
      const effects = Array.from({ length: 1000 }, () => {
        let _resources: number[] = [];
        return effect(() => {
          const _ = a.value;
          _resources = Array.from({ length: 100 }, (_, i) => i);
          return () => {
            _resources = [];
          };
        }, benchEffectOptions);
      });

      // Trigger cleanups
      effects.forEach((e) => e.dispose());
      a.dispose();

      forceGC();
      return effects as any;
    },
    memoryBenchOptions
  );

  bench(
    'circular reference cleanup',
    () => {
      // Create potential circular references
      let lastA, lastB;
      for (let i = 0; i < 100; i++) {
        const a = atom<{ ref: unknown | null }>({ ref: null });
        const b = atom<{ ref: unknown | null }>({ ref: null });

        a.value = { ref: b };
        b.value = { ref: a };

        // Dispose should handle this gracefully
        a.dispose();
        b.dispose();
        lastA = a;
        lastB = b;
      }

      forceGC();
      return [lastA, lastB] as any;
    },
    memoryBenchOptions
  );
});

describe('Large State Management', () => {
  bench(
    'manage 10K atom state tree',
    () => {
      // Simulate large app state
      interface State {
        users: Array<{ id: number; name: string }>;
        posts: Array<{ id: number; userId: number; content: string }>;
        comments: Array<{ id: number; postId: number; text: string }>;
      }

      const state = atom<State>({
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
        })),
        posts: Array.from({ length: 5000 }, (_, i) => ({
          id: i,
          userId: i % 1000,
          content: `Post ${i}`,
        })),
        comments: Array.from({ length: 10000 }, (_, i) => ({
          id: i,
          postId: i % 5000,
          text: `Comment ${i}`,
        })),
      });

      // Derived state
      const userCount = computed(() => state.value.users.length);
      const postCount = computed(() => state.value.posts.length);
      const commentCount = computed(() => state.value.comments.length);

      // Access
      const _ = userCount.value;
      const __ = postCount.value;
      const ___ = commentCount.value;

      // Update
      state.value = {
        ...state.value,
        users: [...state.value.users, { id: 1000, name: 'New User' }],
      };

      // Re-access
      const ____ = userCount.value;

      // Cleanup
      state.dispose();
      userCount.dispose();
      postCount.dispose();
      commentCount.dispose();
      return [_, __, ___, ____] as any;
    },
    memoryBenchOptions
  );

  bench(
    'memory usage monitoring',
    () => {
      const before = getMemoryUsage();

      // Allocate
      const atoms = Array.from({ length: 1000 }, (_, i) =>
        atom(Array.from({ length: 100 }, (_, j) => i * 100 + j))
      );

      const during = getMemoryUsage();

      // Dispose
      atoms.forEach((a) => a.dispose());

      forceGC();

      const after = getMemoryUsage();

      // Track delta for analysis (prevent DCE)
      const diff1 = during.heapUsed - before.heapUsed;
      const diff2 = during.heapUsed - after.heapUsed;
      return [diff1, diff2] as any;
    },
    memoryBenchOptions
  );
});
