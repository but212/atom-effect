/**
 * @fileoverview Benchmark setup utilities for jQuery bindings
 * @description Common utilities, DOM helpers, and benchmark options
 */

import $ from 'jquery';
import type { BenchOptions } from 'vitest';

export const REPEATS = 10;

/**
 * Standard benchmark options for micro-benchmarks
 * Reduced iterations vs core since DOM creation/teardown per iteration is expensive in jsdom
 */
export const microBenchOptions: BenchOptions = {
  time: 1000,
  iterations: 200,
  warmupTime: 100,
  warmupIterations: 5,
  throws: true,
};

/**
 * Standard benchmark options for macro-benchmarks
 */
export const macroBenchOptions: BenchOptions = {
  time: 1500,
  iterations: 50,
  warmupTime: 100,
  warmupIterations: 3,
  throws: true,
};

/**
 * Effect options to disable infinite loop detection in benchmarks
 */
export const benchEffectOptions = {
  maxExecutionsPerSecond: Infinity,
  maxExecutionsPerFlush: Infinity,
};

/**
 * Creates a fresh container element attached to document.body.
 */
export function createContainer(): JQuery {
  const $container = $('<div class="bench-root"></div>');
  $(document.body).append($container);
  return $container;
}

/**
 * Cleans up a container: unbinds all atom bindings and removes from DOM.
 */
export function cleanupContainer($container: JQuery): void {
  $container
    .find('*')
    .addBack()
    .each(function () {
      $(this).atomUnbind();
    });
  $container.remove();
}
