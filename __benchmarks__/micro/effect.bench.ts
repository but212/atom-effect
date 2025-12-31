/**
 * @fileoverview Effect micro-benchmarks
 * @description Benchmarks for effect operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

describe('Effect Creation', () => {
  bench(
    'create effect (single dependency)',
    () => {
      const a = atom(0);
      let value = 0;
      const e = effect(() => {
        value = a.value;
      });
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'create effect (multiple dependencies)',
    () => {
      const a = atom(1);
      const b = atom(2);
      const c = atom(3);
      let sum = 0;
      const e = effect(() => {
        sum = a.value + b.value + c.value;
      });
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'create 10 effects',
    () => {
      const a = atom(0);
      const effects = Array.from({ length: 10 }, () => {
        let value = 0;
        return effect(() => {
          value = a.value;
        });
      });
      effects.forEach((e) => e.dispose());
    },
    microBenchOptions
  );
});

describe('Effect Execution', () => {
  bench(
    'effect runs on dependency change',
    () => {
      const a = atom(0);
      let count = 0;
      const e = effect(() => {
        count = a.value;
      });
      a.value = 1;
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'effect runs on multiple dependency changes',
    () => {
      const a = atom(1);
      const b = atom(2);
      let sum = 0;
      const e = effect(() => {
        sum = a.value + b.value;
      });
      a.value = 10;
      b.value = 20;
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'effect with computed dependency',
    () => {
      const a = atom(1);
      const doubled = computed(() => a.value * 2);
      let value = 0;
      const e = effect(() => {
        value = doubled.value;
      });
      a.value = 2;
      e.dispose();
    },
    microBenchOptions
  );
});

describe('Effect Re-execution', () => {
  bench(
    'effect re-runs 10 times',
    () => {
      const a = atom(0);
      let count = 0;
      const e = effect(() => {
        count = a.value;
      });
      for (let i = 0; i < 10; i++) {
        a.value = i;
      }
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'multiple effects on same dependency',
    () => {
      const a = atom(0);
      let c1 = 0;
      let c2 = 0;
      let c3 = 0;
      const e1 = effect(() => {
        c1 = a.value;
      });
      const e2 = effect(() => {
        c2 = a.value;
      });
      const e3 = effect(() => {
        c3 = a.value;
      });
      a.value = 1;
      e1.dispose();
      e2.dispose();
      e3.dispose();
    },
    microBenchOptions
  );
});

describe('Effect Cleanup', () => {
  bench(
    'effect with cleanup function',
    () => {
      const a = atom(0);
      let cleaned = false;
      const e = effect(() => {
        const _ = a.value;
        return () => {
          cleaned = true;
        };
      });
      a.value = 1; // Triggers cleanup
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'effect cleanup on dependency change',
    () => {
      const a = atom(0);
      let cleanupCount = 0;
      const e = effect(() => {
        const _ = a.value;
        return () => {
          cleanupCount++;
        };
      });
      for (let i = 0; i < 5; i++) {
        a.value = i;
      }
      e.dispose();
    },
    microBenchOptions
  );
});

describe('Effect Disposal', () => {
  bench(
    'dispose effect',
    () => {
      const a = atom(0);
      let value = 0;
      const e = effect(() => {
        value = a.value;
      });
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'dispose effect with cleanup',
    () => {
      const a = atom(0);
      let cleaned = false;
      const e = effect(() => {
        const _ = a.value;
        return () => {
          cleaned = true;
        };
      });
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'dispose 10 effects',
    () => {
      const a = atom(0);
      const effects = Array.from({ length: 10 }, () => {
        let value = 0;
        return effect(() => {
          value = a.value;
        });
      });
      effects.forEach((e) => e.dispose());
    },
    microBenchOptions
  );
});
