/**
 * @fileoverview Effect micro-benchmarks
 * @description Benchmarks for effect operations
 */

import { bench, describe } from 'vitest';
import { atom, computed, effect } from '@/index';
import { benchEffectOptions, microBenchOptions } from '../utils/setup.js';

const REPEATS = 1000;

describe('Effect Creation', () => {
  bench(
    `create effect (single dependency) (x${REPEATS})`,
    () => {
      let _value = 0;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        const effectHandle = effect(() => {
          _value = a.value;
        });
        effectHandle.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `create effect (multiple dependencies) (x${REPEATS})`,
    () => {
      let _sum = 0;
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(1);
        const b = atom(2);
        const c = atom(3);
        const effectHandle = effect(() => {
          _sum = a.value + b.value + c.value;
        });
        effectHandle.dispose();
      }
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
    `effect runs on dependency change (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        a.value += 1;
      }
    },
    microBenchOptions
  );

  bench(
    `effect runs on multiple dependency changes (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        aMulti.value += 1;
        bMulti.value += 1;
      }
    },
    microBenchOptions
  );

  bench(
    `effect with computed dependency (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        aComp.value += 1;
      }
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
    `effect re-runs 10 times (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (let j = 0; j < 10; j++) {
          a.value += 1;
        }
      }
    },
    microBenchOptions
  );

  bench(
    `multiple effects on same dependency (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        aMultiEff.value += 1;
      }
    },
    microBenchOptions
  );
});

describe('Effect Cleanup', () => {
  const aCleanup = atom(0);
  let _cleanupCount = 0;
  effect(() => {
    void aCleanup.value;
    return () => {
      _cleanupCount++;
    };
  }, benchEffectOptions);

  bench(
    `effect with cleanup function (creation/disposal) (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        let _cleaned = false;
        const effectHandle = effect(() => {
          const _ = a.value;
          return () => {
            _cleaned = true;
          };
        });
        a.value = 1; // Triggers cleanup
        effectHandle.dispose(); // Triggers final cleanup
      }
    },
    microBenchOptions
  );

  bench(
    `effect cleanup on dependency change (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        aCleanup.value += 1;
      }
    },
    microBenchOptions
  );
});

describe('Effect Disposal', () => {
  bench(
    `dispose effect (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        let _value = 0;
        const effectHandle = effect(() => {
          _value = a.value;
        });
        effectHandle.dispose();
      }
    },
    microBenchOptions
  );

  bench(
    `dispose effect with cleanup (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const a = atom(0);
        let _cleaned = false;
        const effectHandle = effect(() => {
          const _ = a.value;
          return () => {
            _cleaned = true;
          };
        });
        effectHandle.dispose();
      }
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
