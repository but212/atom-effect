/**
 * Global setup for benchmarks.
 * Must run before any src/index import to ensure debug is disabled.
 */

// Disable debug logging before any module loads (highest priority flag)
(window as Window & { __ATOM_DEBUG__?: boolean }).__ATOM_DEBUG__ = false;

// Register jQuery globals (same as __tests__/setup.ts)
import $ from 'jquery';

const g = globalThis as unknown as { $: JQueryStatic; jQuery: JQueryStatic };
g.$ = $;
g.jQuery = $;
