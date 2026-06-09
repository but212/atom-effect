/**
 * Global setup for benchmarks.
 * Must run before any src/index import to ensure debug is disabled.
 */

import $ from 'jquery';

// Disable debug logging and register jQuery globals
Object.assign(globalThis, {
  __ATOM_DEBUG__: false,
  $: $,
  jQuery: $,
});
