/**
 * @fileoverview Realistic-world benchmarks for atom-effect core
 * @description Scenarios simulating real app behavior. Each scenario includes
 * a Vanilla baseline for direct comparison. External API only.
 */

import { describe, test } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  generateSearchCorpus,
  keep,
  macroBenchOptions,
  memoryBenchOptions,
} from '../utils/setup.js';

const _keep = keep;

describe('Efficiency: Batching vs Manual Propagation', () => {
  test('form reset comparison', async ({ bench }) => {
    // Scenario 1: Form Reset (20 fields)
    const formFields = Array.from({ length: 20 }, () => atom('initial'));
    const isFormValid = computed(() => formFields.every((f) => f.value.length > 0));
    let formRuns = 0;
    const effectInstance = effect(() => {
      _keep(isFormValid.value);
      formRuns++;
    }, benchEffectOptions);

    try {
      await bench.compare(
        bench('[Batch] form reset (20 fields)', () => {
          const nextVal = formFields[0]?.value === '' ? 'initial' : '';
          batch(() => {
            for (const f of formFields) f.value = nextVal;
          });
          _keep(formRuns);
        }),
        bench('[Manual] form reset (20 fields)', () => {
          const nextVal = formFields[0]?.value === '' ? 'initial' : '';
          for (const f of formFields) f.value = nextVal;
          _keep(formRuns);
        }),
        macroBenchOptions
      );
    } finally {
      effectInstance.dispose();
    }
  });

  test('state sync comparison', async ({ bench }) => {
    // Scenario 2: Large State Sync (100 atoms)
    const syncAtoms = Array.from({ length: 100 }, () => atom(0));
    const syncHeavy = computed(() =>
      syncAtoms.reduce((sum, sourceAtom) => sum + sourceAtom.value, 0)
    );
    let syncSink = 0;
    const effectInstance = effect(() => {
      syncSink = syncHeavy.value;
    }, benchEffectOptions);

    try {
      await bench.compare(
        bench('[Batch] state sync (100 atoms)', () => {
          batch(() => {
            for (const a of syncAtoms) a.value++;
          });
          _keep(syncSink);
        }),
        bench('[Manual] state sync (100 atoms)', () => {
          for (const a of syncAtoms) a.value++;
          _keep(syncSink);
        }),
        macroBenchOptions
      );
    } finally {
      effectInstance.dispose();
    }
  });
});

describe('Stability: Component Churn & Memory', () => {
  test('component lifecycle', async ({ bench }) => {
    await bench('heavy component lifecycle (mount → update → unmount)', () => {
      const createComponent = (id: number) => {
        const state = atom({ id, data: 'initial' });
        const derived = computed(() => `ID: ${state.value.id} - ${state.value.data.toUpperCase()}`);
        const stop = effect(() => {
          _keep(derived.value);
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

      _keep(components.length);
    }).run(memoryBenchOptions);
  });
});

describe('Search-as-you-type (1000 items)', () => {
  test('search filter comparison', async ({ bench }) => {
    const corpus = generateSearchCorpus('large');
    let vanillaQuery = '';
    const queryAtom = atom('');
    const sharedSearchResults = computed(() =>
      corpus.filter((item) => item.includes(queryAtom.value))
    );
    const stopEffect = effect(() => _keep(sharedSearchResults.value.length), benchEffectOptions);

    try {
      await bench.compare(
        bench('[Vanilla] filter 1000 items on query change', () => {
          vanillaQuery = vanillaQuery === '' ? 'item 5' : '';
          _keep(corpus.filter((item) => item.includes(vanillaQuery)).length);
        }),
        bench('[Atom] filter 1000 items (Fresh Computed each time)', () => {
          queryAtom.value = queryAtom.value === '' ? 'item 5' : '';
          const searchResults = computed(() =>
            corpus.filter((item) => item.includes(queryAtom.value))
          );
          _keep(searchResults.value.length);
        }),
        bench('[Atom] filter 1000 items (Cached/Subscription overhead)', () => {
          queryAtom.value = queryAtom.value === '' ? 'item 5' : '';
          _keep(sharedSearchResults.value.length);
        }),
        macroBenchOptions
      );
    } finally {
      stopEffect.dispose();
    }
  });
});

describe('Shopping Cart Workflow', () => {
  test('shopping cart comparison', async ({ bench }) => {
    type CartItem = { id: number; name: string; price: number; qty: number };
    const PRODUCTS: CartItem[] = Array.from({ length: 20 }, (_, index) => ({
      id: index,
      name: `Product ${index}`,
      price: 10 + index * 5,
      qty: 0,
    }));

    function calculateSubtotal(cart: CartItem[]): number {
      return cart.reduce((sum, item) => sum + item.price * item.qty, 0);
    }

    let vanillaCart: CartItem[] = [];
    let vanillaCoupon = 0;
    const cartAtom = atom<CartItem[]>([]);
    const couponAtom = atom(0);
    const subtotalComputed = computed(() => calculateSubtotal(cartAtom.value));
    const totalComputed = computed(() => subtotalComputed.value * (1 - couponAtom.value));

    const stopEffect = effect(() => {
      _keep(totalComputed.value);
    }, benchEffectOptions);

    try {
      await bench.compare(
        bench('[Vanilla] add items → apply coupon → total', () => {
          vanillaCart = PRODUCTS.slice(0, 10).map((product) => ({ ...product, qty: 2 }));
          vanillaCoupon = vanillaCoupon === 0 ? 0.1 : 0;
          _keep(calculateSubtotal(vanillaCart) * (1 - vanillaCoupon));
        }),
        bench('[Atom] add items → apply coupon → total', () => {
          cartAtom.value = PRODUCTS.slice(0, 10).map((product) => ({ ...product, qty: 2 }));
          couponAtom.value = couponAtom.value === 0 ? 0.1 : 0;
          _keep(totalComputed.value);
        }),
        macroBenchOptions
      );
    } finally {
      stopEffect.dispose();
    }
  });
});

describe('Dashboard KPI Pipeline (10 sources → 5 KPIs → 1 summary)', () => {
  test('dashboard KPI comparison', async ({ bench }) => {
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

    const dataSources = Array.from({ length: 10 }, (_, i) => atom(i * 100));
    const [ds0, ds1, ds2, ds3, ds4, ds5, ds6, ds7, ds8, ds9] = dataSources as [
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
      (typeof dataSources)[number],
    ];

    const kpi1 = computed(() => (ds0.value + ds1.value) / 2);
    const kpi2 = computed(() => Math.max(ds2.value, ds3.value));
    const kpi3 = computed(() => ds4.value + ds5.value);
    const kpi4 = computed(() => ds6.value * ds7.value);
    const kpi5 = computed(() => ds8.value - ds9.value);
    const summary = computed(() => kpi1.value + kpi2.value + kpi3.value + kpi4.value + kpi5.value);

    const stopEffect = effect(() => {
      _keep(summary.value);
    }, benchEffectOptions);

    try {
      await bench.compare(
        bench('[Vanilla] update source → recalc all KPIs', () => {
          vanillaSources[0] = (vanillaSources[0] + 1) % 10000;
          const [v0, v1, v2, v3, v4, v5, v6, v7, v8, v9] = vanillaSources;

          const k1 = (v0 + v1) / 2;
          const k2 = Math.max(v2, v3);
          const k3 = v4 + v5;
          const k4 = v6 * v7;
          const k5 = v8 - v9;
          _keep(k1 + k2 + k3 + k4 + k5);
        }),
        bench('[Atom] update source → reactive KPI pipeline', () => {
          ds0.value = (ds0.value + 1) % 10000;
          _keep(summary.value);
        }),
        macroBenchOptions
      );
    } finally {
      stopEffect.dispose();
    }
  });
});
