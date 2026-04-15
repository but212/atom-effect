/**
 * @fileoverview Consolidated realistic-world benchmarks for atom-effect core
 * @description Scenarios simulating real app behavior: Batching efficiency, UI latency, and memory stability.
 */

import { beforeEach, bench, describe } from 'vitest';
import { aeNextTick, atom, batch, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  forceGC,
  keep,
  macroBenchOptions,
  memoryBenchOptions,
  microBenchOptions,
} from '../utils/setup.js';

const REPEATS = 100;

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
    `[Batch] form reset (20 fields, x${REPEATS})`,
    () => {
      for (let j = 0; j < REPEATS; j++) {
        const nextVal = formFields[0]!.value === '' ? 'initial' : '';
        batch(() => {
          for (let i = 0; i < 20; i++) formFields[i]!.value = nextVal;
        });
      }
      keep(_formRuns);
    },
    microBenchOptions
  );

  bench(
    `[Manual] form reset (20 fields, x${REPEATS})`,
    () => {
      for (let j = 0; j < REPEATS; j++) {
        const nextVal = formFields[0]!.value === '' ? 'initial' : '';
        for (let i = 0; i < 20; i++) formFields[i]!.value = nextVal;
      }
      keep(_formRuns);
    },
    microBenchOptions
  );

  // Scenario 2: Large State Sync (100 atoms)
  const syncAtoms = Array.from({ length: 100 }, () => atom(0));
  const syncHeavy = computed(() => syncAtoms.reduce((s, a) => s + a.value, 0));
  let _syncSink = 0;
  effect(() => {
    _syncSink = syncHeavy.value;
  }, benchEffectOptions);

  bench(
    `[Batch] state sync (100 atoms)`,
    () => {
      batch(() => {
        for (let i = 0; i < 100; i++) syncAtoms[i]!.value++;
      });
      keep(_syncSink);
    },
    macroBenchOptions
  );

  bench(
    `[Manual] state sync (100 atoms)`,
    () => {
      for (let i = 0; i < 100; i++) syncAtoms[i]!.value++;
      keep(_syncSink);
    },
    macroBenchOptions
  );
});

describe('UX: Input & UI Latency', () => {
  const mockData = Array.from({ length: 1000 }, (_, i) => `Item ${i}`);
  const searchQuery = atom('');
  const results = computed(() => mockData.filter((item) => item.includes(searchQuery.value)));
  const displayResults = computed(() =>
    results.value.slice(0, 20).map((item: string) => `<div class="item">${item}</div>`)
  );

  let _lastRender = '';
  effect(() => {
    _lastRender = displayResults.value.join('');
  }, benchEffectOptions);

  beforeEach(() => {
    searchQuery.value = '';
  });

  bench(
    `input-to-render latency (async typing simulation)`,
    async () => {
      const input = 'Item 1';
      for (const char of input) {
        searchQuery.value += char;
        await aeNextTick();
      }
      keep(_lastRender);
    },
    { ...microBenchOptions, iterations: 10 }
  );
});

describe('Stability: Component Churn & Memory', () => {
  bench(
    `heavy component lifecycle (mount → update → unmount, x${REPEATS})`,
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
      // 1. Mount
      for (let i = 0; i < REPEATS; i++) components.push(createComponent(i));
      // 2. Update
      for (let i = 0; i < REPEATS; i++) components[i]!.state.value = { id: i, data: 'updated' };
      // 3. Unmount
      for (let i = 0; i < REPEATS; i++) components[i]!.stop.dispose();

      forceGC();
      keep(components.length);
    },
    memoryBenchOptions
  );
});
