/**
 * @module TypeUtilities
 *
 * Responsibility:
 * Provides internal helper types for manipulating and extracting data from
 * reactive structures.
 */

import type { Merge } from '@but212/atom-effect-utils';
import type { Dependency } from './reactive';

/**
 * Extracts the underlying value type from a Dependency container.
 *
 * Why: Enables type-safe access to the wrapped values of atoms and
 * computed nodes within internal reactive formulas and engine logic.
 *
 * @internal
 */
export type UnboxDependency<D> = D extends Dependency<infer V> ? V : never;

/**
 * Aggregates and merges the value types from an array of dependencies into
 * a single object type.
 *
 * Why: Provides a unified type for consumers (such as multi-atom effects
 * or aggregate lenses) that operate on multiple dependencies simultaneously.
 */
export type MergedDependencyValue<T extends readonly unknown[]> = Merge<UnboxDependency<T[number]>>;
