/**
 * @fileoverview Micro-benchmarks for input bindings (atomVal / atomChecked).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

describe('Input Bindings: Event Propagation', () => {
  const run = (name: string, fn: ($c: JQuery) => void) =>
    bench(name, withContainer(fn), microBenchOptions);

  run('Standard input event propagation (100 events)', ($c) => {
    const state = $.atom('initial');
    const inputEl = $('<input type="text">').appendTo($c).atomVal(state)[0] as HTMLInputElement;

    for (let i = 0; i < 100; i++) {
      inputEl.value = `char-${i}`;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  run('IME Composition input overhead (50 composition cycles)', ($c) => {
    const state = $.atom('initial');
    const inputEl = $('<input type="text">').appendTo($c).atomVal(state)[0] as HTMLInputElement;

    for (let i = 0; i < 50; i++) {
      inputEl.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
      inputEl.value = `comp-${i}`;
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      inputEl.dispatchEvent(
        new CompositionEvent('compositionend', { bubbles: true, data: `comp-${i}` })
      );
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  run('Checkbox change event propagation (100 changes)', ($c) => {
    const state = $.atom(false);
    const checkboxEl = $('<input type="checkbox">')
      .appendTo($c)
      .atomChecked(state)[0] as HTMLInputElement;

    for (let i = 0; i < 100; i++) {
      checkboxEl.checked = !state.value;
      checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
});
