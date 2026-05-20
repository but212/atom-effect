/**
 * @fileoverview Micro-benchmarks for input bindings (atomVal / atomChecked).
 * @description Measures standard input events vs. IME composition events (compositionstart/end) overhead.
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

describe('Input Bindings: Event Propagation', () => {
  bench(
    'Standard input event propagation (100 events)',
    () => {
      const $c = createContainer();
      const state = $.atom('initial');
      const $input = $('<input type="text">').appendTo($c).atomVal(state);

      const inputEl = $input[0] as HTMLInputElement;
      for (let i = 0; i < 100; i++) {
        inputEl.value = `char-${i}`;
        // Trigger mock standard input event
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );

  bench(
    'IME Composition input overhead (50 composition cycles)',
    () => {
      const $c = createContainer();
      const state = $.atom('initial');
      const $input = $('<input type="text">').appendTo($c).atomVal(state);

      const inputEl = $input[0] as HTMLInputElement;
      for (let i = 0; i < 50; i++) {
        // 1. compositionstart
        inputEl.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));

        // 2. keystrokes during composition (should not update state immediately)
        inputEl.value = `comp-${i}`;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));

        // 3. compositionend (commits the value)
        const compEndEvent = new CompositionEvent('compositionend', {
          bubbles: true,
          data: `comp-${i}`,
        });
        inputEl.dispatchEvent(compEndEvent);

        // input event is typically dispatched right after compositionend to sync value
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});

describe('Input Bindings: Checkbox and Radio', () => {
  bench(
    'Checkbox change event propagation (100 changes)',
    () => {
      const $c = createContainer();
      const state = $.atom(false);
      const $checkbox = $('<input type="checkbox">').appendTo($c).atomChecked(state);

      const checkboxEl = $checkbox[0] as HTMLInputElement;
      for (let i = 0; i < 100; i++) {
        checkboxEl.checked = !state.value;
        checkboxEl.dispatchEvent(new Event('change', { bubbles: true }));
      }

      cleanupContainer($c);
    },
    microBenchOptions
  );
});
