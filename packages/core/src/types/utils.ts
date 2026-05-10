import type { Merge } from '@but212/atom-effect-utils';
import type { Dependency } from './reactive';

/**
 * Logic: Dependency Value Extraction
 * Extracts the inner value type `V` from a `Dependency<V>`.
 * @internal
 */
export type UnboxDependency<D> = D extends Dependency<infer V> ? V : never;

/**
 * Logic: Safe Object Merging
 * Merges a union of dependency values into a single object.
 * @internal
 */
export type MergedDependencyValue<T extends readonly unknown[]> = Merge<UnboxDependency<T[number]>>;
