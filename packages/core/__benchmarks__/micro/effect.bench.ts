/**
 * @fileoverview Effect micro-benchmarks
 * @description Benchmarks for effect operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '../../src/index.js';
import { microBenchOptions } from '../utils/setup.js';

const benchEffectOptions = {
  maxExecutionsPerSecond: Infinity,
  maxExecutionsPerFlush: Infinity,
};

describe('Effect Creation', () => {
  bench(
    'create effect (single dependency)',
    () => {
      const a = atom(0);
      let _value = 0;
      const e = effect(() => {
        _value = a.value;
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
      let _sum = 0;
      const e = effect(() => {
        _sum = a.value + b.value + c.value;
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
        let _value = 0;
        return effect(() => {
          _value = a.value;
        });
      });
      effects.forEach((e) => e.dispose());
    },
    microBenchOptions
  );
});

describe('Effect Execution', () => {
  const a = atom(0);
  let _count = 0;
  // Persistent effect for execution testing
  effect(() => {
    _count = a.value;
  }, benchEffectOptions);

  const aMulti = atom(1);
  const bMulti = atom(2);
  let _sum = 0;
  effect(() => {
    _sum = aMulti.value + bMulti.value;
  }, benchEffectOptions);

  const aComp = atom(1);
  const doubled = computed(() => aComp.value * 2);
  let _valComp = 0;
  effect(() => {
    _valComp = doubled.value;
  }, benchEffectOptions);

  bench(
    'effect runs on dependency change',
    () => {
      a.value += 1;
    },
    microBenchOptions
  );

  bench(
    'effect runs on multiple dependency changes',
    () => {
      aMulti.value += 1;
      bMulti.value += 1;
    },
    microBenchOptions
  );

  bench(
    'effect with computed dependency',
    () => {
      aComp.value += 1;
    },
    microBenchOptions
  );
});

describe('Effect Re-execution', () => {
  const a = atom(0);
  let _count = 0;
  effect(() => {
    _count = a.value;
  }, benchEffectOptions);

  const aMultiEff = atom(0);
  let _c1 = 0,
    _c2 = 0,
    _c3 = 0;
  effect(() => {
    _c1 = aMultiEff.value;
  }, benchEffectOptions);
  effect(() => {
    _c2 = aMultiEff.value;
  }, benchEffectOptions);
  effect(() => {
    _c3 = aMultiEff.value;
  }, benchEffectOptions);

  bench(
    'effect re-runs 10 times',
    () => {
      for (let i = 0; i < 10; i++) {
        a.value += 1;
      }
    },
    microBenchOptions
  );

  bench(
    'multiple effects on same dependency',
    () => {
      aMultiEff.value += 1;
    },
    microBenchOptions
  );
});

describe('Effect Cleanup', () => {
  // We need to create an effect that has cleanup, then trigger it.
  // This might involve creating/disposing or relying on triggers.
  // "effect cleanup on dependency change" -> we can reuse a stable effect.

  const aCleanup = atom(0);
  let _cleanupCount = 0;
  effect(() => {
    void aCleanup.value;
    return () => {
      _cleanupCount++;
    };
  }, benchEffectOptions);

  bench(
    'effect with cleanup function (creation/disposal)',
    () => {
      const a = atom(0);
      let _cleaned = false;
      const e = effect(() => {
        const _ = a.value;
        return () => {
          _cleaned = true;
        };
      });
      a.value = 1; // Triggers cleanup
      e.dispose(); // Triggers final cleanup
    },
    microBenchOptions
  );

  bench(
    'effect cleanup on dependency change',
    () => {
      aCleanup.value += 1;
    },
    microBenchOptions
  );
});

describe('Effect Disposal', () => {
  bench(
    'dispose effect',
    () => {
      const a = atom(0);
      let _value = 0;
      const e = effect(() => {
        _value = a.value;
      });
      e.dispose();
    },
    microBenchOptions
  );

  bench(
    'dispose effect with cleanup',
    () => {
      const a = atom(0);
      let _cleaned = false;
      const e = effect(() => {
        const _ = a.value;
        return () => {
          _cleaned = true;
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
        let _value = 0;
        return effect(() => {
          _value = a.value;
        });
      });
      effects.forEach((e) => e.dispose());
    },
    microBenchOptions
  );
});
