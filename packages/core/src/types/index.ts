/**
 * @module Types_Index
 *
 * Responsibility:
 * Central entry point for all type definitions in the core reactive engine.
 *
 * Categories:
 * - API: Public configuration and function types.
 * - Base: Fundamental primitives and lifecycle interfaces.
 * - Reactive: Core graph structures (Atoms, Computed, Effects).
 * - Internal: Engine-private state and metadata schemas.
 * - Scheduler: Job contracts and state buffers for the update loop.
 */

/**
 * Re-exports frequently used structural utility types for developer convenience.
 */
export type { Equal, If, Merge, Prettify } from '@but212/atom-effect-utils';

export * from './api';
export * from './base';
export * from './debug';
export * from './errors';
export * from './internal';
export * from './reactive';
export * from './scheduler';
export * from './utils';
