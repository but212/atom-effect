import { bench, describe } from 'vitest';
import { atom, batch, computed, effect } from '../../src/index.js';

describe('Batch Efficiency', () => {
  bench('form reset overhead (batch)', () => {
    const formFields = Array.from({ length: 20 }, () => atom('initial'));

    const isValid = computed(() => formFields.every((f) => f.value.length > 0));

    let _effectRuns = 0;
    effect(() => {
      const _ = isValid.value;
      _effectRuns++;
    });

    // Reset form
    batch(() => {
      formFields.forEach((f) => {
        f.value = '';
      });
    });
  });

  bench('form reset overhead (no batch)', () => {
    const formFields = Array.from({ length: 20 }, () => atom('initial'));

    const isValid = computed(() => formFields.every((f) => f.value.length > 0));

    let _effectRuns = 0;
    effect(() => {
      const _ = isValid.value;
      _effectRuns++;
    });

    // Reset form
    formFields.forEach((f) => {
      f.value = '';
    });
  });
});
