/**
 * @fileoverview Realistic-world benchmarks for atom-effect core
 * @description Scenarios simulating real app behavior. Each scenario includes
 * a Vanilla baseline for direct comparison. External API only.
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  generateSearchCorpus,
  keep,
  macroBenchOptions,
  memoryBenchOptions,
  type SizeKey,
} from '../utils/setup.js';

describe('Efficiency: Batching vs Manual Propagation', () => {
  // Scenario 1: Form Reset (20 fields)
  const formFields = Array.from({ length: 20 }, () => atom('initial'));
  const isFormValid = computed(() => formFields.every((f) => f.value.length > 0));
  let _formRuns = 0;
  effect(() => {
    keep(isFormValid.value);
    _formRuns++;
  }, benchEffectOptions);

  bench(
    '[Batch] form reset (20 fields)',
    () => {
      const nextVal = formFields[0]?.value === '' ? 'initial' : '';
      batch(() => {
        for (let i = 0; i < 20; i++) {
          const field = formFields[i];
          if (field) field.value = nextVal;
        }
      });
      keep(_formRuns);
    },
    macroBenchOptions
  );

  bench(
    '[Manual] form reset (20 fields)',
    () => {
      const nextVal = formFields[0]?.value === '' ? 'initial' : '';

      for (let i = 0; i < 20; i++) {
        const field = formFields[i];
        if (field) field.value = nextVal;
      }
      keep(_formRuns);
    },
    macroBenchOptions
  );

  // Scenario 2: Large State Sync (100 atoms)
  const syncAtoms = Array.from({ length: 100 }, () => atom(0));
  const syncHeavy = computed(() => syncAtoms.reduce((s, a) => s + a.value, 0));
  let _syncSink = 0;
  effect(() => {
    _syncSink = syncHeavy.value;
  }, benchEffectOptions);

  bench(
    '[Batch] state sync (100 atoms)',
    () => {
      batch(() => {
        for (let i = 0; i < 100; i++) {
          const a = syncAtoms[i];
          if (a) a.value++;
        }
      });
      keep(_syncSink);
    },
    macroBenchOptions
  );

  bench(
    '[Manual] state sync (100 atoms)',
    () => {
      for (let i = 0; i < 100; i++) {
        const a = syncAtoms[i];
        if (a) a.value++;
      }
      keep(_syncSink);
    },
    macroBenchOptions
  );
});

describe('Stability: Component Churn & Memory', () => {
  bench(
    'heavy component lifecycle (mount → update → unmount)',
    () => {
      const createComponent = (id: number) => {
        const state = atom({ id, data: 'initial' });
        const derived = computed(() => `ID: ${state.value.id} - ${state.value.data.toUpperCase()}`);
        const stop = effect(() => {
          keep(derived.value);
        }, benchEffectOptions);
        return { state, stop };
      };

      const components: any[] = [];
      // Reduce internal count to let framework handle overall iterations
      for (let i = 0; i < 10; i++) components.push(createComponent(i));
      for (let i = 0; i < 10; i++) {
        const comp = components[i];
        if (comp) comp.state.value = { id: i, data: 'updated' };
      }
      for (let i = 0; i < 10; i++) {
        const comp = components[i];
        if (comp) comp.stop.dispose();
      }

      keep(components.length);
    },
    memoryBenchOptions
  );
});

describe('Search-as-you-type (1000 items)', () => {
  const corpus = generateSearchCorpus('large' as SizeKey);

  let vanillaQuery = '';
  bench(
    '[Vanilla] filter 1000 items on query change',
    () => {
      vanillaQuery = vanillaQuery === '' ? 'item 5' : '';
      keep(corpus.filter((s) => s.includes(vanillaQuery)).length);
    },
    macroBenchOptions
  );

  const queryAtom = atom('');

  bench(
    '[Atom] filter 1000 items (Fresh Computed each time)',
    () => {
      queryAtom.value = queryAtom.value === '' ? 'item 5' : '';
      // Creating a new computed forces the filter to run synchronously on .value
      // This measures: Atom update + Computed Creation + Filter execution
      const searchResults = computed(() => corpus.filter((s) => s.includes(queryAtom.value)));
      keep(searchResults.value.length);
    },
    macroBenchOptions
  );

  const sharedSearchResults = computed(() => corpus.filter((s) => s.includes(queryAtom.value)));
  effect(() => keep(sharedSearchResults.value.length), benchEffectOptions);

  bench(
    '[Atom] filter 1000 items (Cached/Subscription overhead)',
    () => {
      queryAtom.value = queryAtom.value === '' ? 'item 5' : '';
      // This measures how fast the library handles a dirty state when a subscription exists
      // If the scheduler hasn't flushed, this might still hit the cache (showing library latency)
      keep(sharedSearchResults.value.length);
    },
    macroBenchOptions
  );
});

describe('Shopping Cart Workflow', () => {
  type CartItem = { id: number; name: string; price: number; qty: number };
  const PRODUCTS: CartItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    name: `Product ${i}`,
    price: 10 + i * 5,
    qty: 0,
  }));

  let vanillaCart: CartItem[] = [];
  let vanillaCoupon = 0;
  bench(
    '[Vanilla] add items → apply coupon → total',
    () => {
      vanillaCart = PRODUCTS.slice(0, 10).map((p) => ({ ...p, qty: 2 }));
      vanillaCoupon = vanillaCoupon === 0 ? 0.1 : 0;
      const subtotal = vanillaCart.reduce((s, item) => s + item.price * item.qty, 0);
      keep(subtotal * (1 - vanillaCoupon));
    },
    macroBenchOptions
  );

  const cartAtom = atom<CartItem[]>([]);
  const couponAtom = atom(0);
  const subtotalComputed = computed(() =>
    cartAtom.value.reduce((s, item) => s + item.price * item.qty, 0)
  );
  const totalComputed = computed(() => subtotalComputed.value * (1 - couponAtom.value));

  effect(() => {
    keep(totalComputed.value);
  }, benchEffectOptions);

  bench(
    '[Atom] add items → apply coupon → total',
    () => {
      cartAtom.value = PRODUCTS.slice(0, 10).map((p) => ({ ...p, qty: 2 }));
      couponAtom.value = couponAtom.value === 0 ? 0.1 : 0;
      // Force sync re-calc of the entire chain
      keep(totalComputed.value);
    },
    macroBenchOptions
  );
});

describe('Dashboard KPI Pipeline (10 sources → 5 KPIs → 1 summary)', () => {
  const vanillaSources = Array.from({ length: 10 }, (_, i) => i * 100);
  bench(
    '[Vanilla] update source → recalc all KPIs',
    () => {
      const v0 = vanillaSources[0];
      if (v0 !== undefined) {
        vanillaSources[0] = (v0 + 1) % 10000;
      }
      const val0 = vanillaSources[0] ?? 0;
      const val1 = vanillaSources[1] ?? 0;
      const val2 = vanillaSources[2] ?? 0;
      const val3 = vanillaSources[3] ?? 0;
      const val4 = vanillaSources[4] ?? 0;
      const val5 = vanillaSources[5] ?? 0;
      const val6 = vanillaSources[6] ?? 0;
      const val7 = vanillaSources[7] ?? 0;
      const val8 = vanillaSources[8] ?? 0;
      const val9 = vanillaSources[9] ?? 0;

      const kpi1 = (val0 + val1) / 2;
      const kpi2 = Math.max(val2, val3);
      const kpi3 = val4 + val5;
      const kpi4 = val6 * val7;
      const kpi5 = val8 - val9;
      keep(kpi1 + kpi2 + kpi3 + kpi4 + kpi5);
    },
    macroBenchOptions
  );

  const dataSources = Array.from({ length: 10 }, (_, i) => atom(i * 100));
  const ds0 = dataSources[0];
  const ds1 = dataSources[1];
  const ds2 = dataSources[2];
  const ds3 = dataSources[3];
  const ds4 = dataSources[4];
  const ds5 = dataSources[5];
  const ds6 = dataSources[6];
  const ds7 = dataSources[7];
  const ds8 = dataSources[8];
  const ds9 = dataSources[9];

  if (!ds0 || !ds1 || !ds2 || !ds3 || !ds4 || !ds5 || !ds6 || !ds7 || !ds8 || !ds9) {
    throw new Error('dataSources initialization failed');
  }

  const kpi1 = computed(() => (ds0.value + ds1.value) / 2);
  const kpi2 = computed(() => Math.max(ds2.value, ds3.value));
  const kpi3 = computed(() => ds4.value + ds5.value);
  const kpi4 = computed(() => ds6.value * ds7.value);
  const kpi5 = computed(() => ds8.value - ds9.value);
  const summary = computed(() => kpi1.value + kpi2.value + kpi3.value + kpi4.value + kpi5.value);

  effect(() => {
    keep(summary.value);
  }, benchEffectOptions);

  bench(
    '[Atom] update source → reactive KPI pipeline',
    () => {
      ds0.value = (ds0.value + 1) % 10000;
      // Force sync re-calc to measure the dependency graph cost
      keep(summary.value);
    },
    macroBenchOptions
  );
});
