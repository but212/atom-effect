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
        for (const f of formFields) f.value = nextVal;
      });
      keep(_formRuns);
    },
    macroBenchOptions
  );

  bench(
    '[Manual] form reset (20 fields)',
    () => {
      const nextVal = formFields[0]?.value === '' ? 'initial' : '';
      for (const f of formFields) f.value = nextVal;
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
        for (const a of syncAtoms) a.value++;
      });
      keep(_syncSink);
    },
    macroBenchOptions
  );

  bench(
    '[Manual] state sync (100 atoms)',
    () => {
      for (const a of syncAtoms) a.value++;
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

      const components = Array.from({ length: 10 }, (_, i) => createComponent(i));
      for (let i = 0; i < 10; i++) {
        const comp = components[i];
        if (comp) {
          comp.state.value = { id: i, data: 'updated' };
        }
      }
      for (const comp of components) {
        comp.stop.dispose();
      }

      keep(components.length);
    },
    memoryBenchOptions
  );
});

describe('Search-as-you-type (1000 items)', () => {
  const corpus = generateSearchCorpus('large');

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

  function calculateSubtotal(cart: CartItem[]): number {
    return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  }

  let vanillaCart: CartItem[] = [];
  let vanillaCoupon = 0;
  bench(
    '[Vanilla] add items → apply coupon → total',
    () => {
      vanillaCart = PRODUCTS.slice(0, 10).map((p) => ({ ...p, qty: 2 }));
      vanillaCoupon = vanillaCoupon === 0 ? 0.1 : 0;
      keep(calculateSubtotal(vanillaCart) * (1 - vanillaCoupon));
    },
    macroBenchOptions
  );

  const cartAtom = atom<CartItem[]>([]);
  const couponAtom = atom(0);
  const subtotalComputed = computed(() => calculateSubtotal(cartAtom.value));
  const totalComputed = computed(() => subtotalComputed.value * (1 - couponAtom.value));

  effect(() => {
    keep(totalComputed.value);
  }, benchEffectOptions);

  bench(
    '[Atom] add items → apply coupon → total',
    () => {
      cartAtom.value = PRODUCTS.slice(0, 10).map((p) => ({ ...p, qty: 2 }));
      couponAtom.value = couponAtom.value === 0 ? 0.1 : 0;
      keep(totalComputed.value);
    },
    macroBenchOptions
  );
});

describe('Dashboard KPI Pipeline (10 sources → 5 KPIs → 1 summary)', () => {
  const vanillaSources: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ] = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];

  bench(
    '[Vanilla] update source → recalc all KPIs',
    () => {
      vanillaSources[0] = (vanillaSources[0] + 1) % 10000;
      const [v0, v1, v2, v3, v4, v5, v6, v7, v8, v9] = vanillaSources;

      const kpi1 = (v0 + v1) / 2;
      const kpi2 = Math.max(v2, v3);
      const kpi3 = v4 + v5;
      const kpi4 = v6 * v7;
      const kpi5 = v8 - v9;
      keep(kpi1 + kpi2 + kpi3 + kpi4 + kpi5);
    },
    macroBenchOptions
  );

  const dataSources = Array.from({ length: 10 }, (_, i) => atom(i * 100));
  const [ds0, ds1, ds2, ds3, ds4, ds5, ds6, ds7, ds8, ds9] = dataSources as any;

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
      keep(summary.value);
    },
    macroBenchOptions
  );
});
