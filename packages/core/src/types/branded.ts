/**
 * Generic Branded Type helper.
 * T: The base type (e.g., number, string)
 * Brand: The unique brand tag
 */
export type Branded<T, Brand> = T & { readonly __brand: Brand };

/**
 * Unique identifier for reactive dependencies (Atoms, Computed, Effects).
 * Base type is number.
 */
export type DependencyId = Branded<number, 'DependencyId'>;
