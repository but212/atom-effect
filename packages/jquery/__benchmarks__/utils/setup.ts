/**
 * @fileoverview Benchmark setup utilities for jQuery bindings
 * @description Common utilities, DOM helpers, and benchmark options
 */

import $ from 'jquery';
import type { BenchOptions } from 'vitest';

export const REPEATS = 10;

const baseOptions: BenchOptions = {
  warmupTime: 100,
  throws: true,
};

/**
 * Standard benchmark options for micro-benchmarks
 * Reduced iterations vs core since DOM creation/teardown per iteration is expensive in jsdom
 */
export const microBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1000,
  iterations: 200,
  warmupIterations: 5,
};

/**
 * Standard benchmark options for macro-benchmarks
 */
export const macroBenchOptions: BenchOptions = {
  ...baseOptions,
  time: 1500,
  iterations: 50,
  warmupIterations: 3,
};

/**
 * Creates a fresh container element attached to document.body.
 */
export const createContainer = (): JQuery => {
  const el = document.createElement('div');
  el.className = 'bench-root';
  document.body.appendChild(el);
  return $(el);
};

/**
 * Cleans up a container: unbinds all atom bindings and removes from DOM.
 */
export const cleanupContainer = ($container: JQuery): void => {
  $container.atomUnbind().remove();
};

/**
 * Wraps a benchmark function to automatically handle container creation and cleanup.
 */
export const withContainer = (fn: ($container: JQuery) => void | Promise<void>) => {
  return () => {
    const $c = createContainer();
    try {
      const result = fn($c);
      if (result instanceof Promise) {
        return result.finally(() => cleanupContainer($c));
      }
      cleanupContainer($c);
    } catch (error) {
      cleanupContainer($c);
      throw error;
    }
  };
};
