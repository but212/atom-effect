import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../dist';
import { benchEffectOptions } from '../utils/setup.js';

describe('Batch Efficiency', () => {
  // Setup shared state - batch case
  const formFieldsBatch = Array.from({ length: 20 }, () => atom('initial'));
  const isValidBatch = computed(() => formFieldsBatch.every((f) => f.value.length > 0));
  let _effectRunsBatch = 0;
  effect(() => {
    const _ = isValidBatch.value;
    _effectRunsBatch++;
  }, benchEffectOptions);

  bench('form reset overhead (batch)', () => {
    const nextVal = formFieldsBatch[0]!.value === '' ? 'initial' : '';

    batch(() => {
      for (let i = 0; i < 20; i++) {
        formFieldsBatch[i]!.value = nextVal;
      }
    });
  });

  // Setup shared state - no batch case
  const formFieldsNoBatch = Array.from({ length: 20 }, () => atom('initial'));
  const isValidNoBatch = computed(() => formFieldsNoBatch.every((f) => f.value.length > 0));
  let _effectRunsNoBatch = 0;
  effect(() => {
    const _ = isValidNoBatch.value;
    _effectRunsNoBatch++;
  }, benchEffectOptions);

  bench('form reset overhead (no batch)', () => {
    const nextVal = formFieldsNoBatch[0]!.value === '' ? 'initial' : '';

    for (let i = 0; i < 20; i++) {
      formFieldsNoBatch[i]!.value = nextVal;
    }
  });
});
