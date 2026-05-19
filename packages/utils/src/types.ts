/**
 * Logic: Strict Equality
 * Checks if two types are exactly identical, distinguish between `any`, `unknown`,
 * and handling `readonly` modifiers which standard `extends` might fail to isolate.
 *
 * When to use:
 * - In type-level unit tests to ensure exact type matches.
 * - When you need to protect against `any` leaking into generic logic.
 *
 * @example
 * type Case1 = Equal<any, unknown>; // false
 * type Case2 = Equal<{ readonly a: 1 }, { a: 1 }>; // false
 */
export type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;

/**
 * Utility type that merges a union of object types into a single flattened object type.
 * It combines {@link UnionToIntersection} and {@link Prettify} for a clean, readable result.
 *
 * When to use:
 * - When an API accepts a union of configurations but returns a single merged state.
 *
 * @example
 * type Merged = Merge<{ a: string } | { b: number }>;
 * // result: { a: string; b: number }
 */
export type Merge<U> = Prettify<UnionToIntersection<U>>;

/**
 * Logic: Tooltip Optimization
 * Expands complex types (like intersections) into a single object type mapping.
 *
 * Why:
 * - Standard intersections (`A & B`) appear as-is in IDE tooltips, which is hard to read.
 * - This "identity mapping" forces TS to resolve the intersection into a flat object.
 *
 * @example
 * type Pretty = Prettify<{ a: string } & { b: number }>;
 * // result: { a: string; b: number }
 */
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

/**
 * Logic: Contravariant Inference
 * Converts a union of types into an intersection using the "contravariant position" trick.
 *
 * Reason:
 * - Functions are contravariant in their parameter positions. When multiple functions
 *   are inferred against a single signature, the candidate types must be intersected
 *   to satisfy all possible inputs.
 *
 * @example
 * type Intersected = UnionToIntersection<{ a: string } | { b: number }>;
 * // result: { a: string } & { b: number }
 */
export type UnionToIntersection<U> = (U extends unknown ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;
