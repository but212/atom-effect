/**
 * Interface for objects that can track dependencies via addDependency method
 */
export interface DependencySubscriber {
  addDependency: (dep: unknown) => void;
}

/**
 * Interface for objects that can be notified via execute method
 */
export interface ExecutableSubscriber {
  execute: () => void;
}

/**
 * Combined tracker interface (partial - both properties optional)
 */
export interface DependencyTracker {
  addDependency?: (dep: unknown) => void;
  execute?: () => void;
}

/**
 * Function with optional addDependency property
 */
export type TrackableFunction = (() => void) & Partial<DependencySubscriber>;

/**
 * Listener type - can be a function or object-based tracker
 */
export type Listener = DependencyTracker | (() => void);

// ============================================================
// Type Guards - Safe runtime type validation
// ============================================================

/**
 * Checks if value is a non-null object (excludes functions)
 */
function isNonNullObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Type guard: Checks if value has addDependency method
 */
export function hasDependencyMethod(value: unknown): value is DependencySubscriber {
  if (isNonNullObject(value)) {
    return typeof value.addDependency === 'function';
  }
  if (typeof value === 'function') {
    return typeof (value as TrackableFunction).addDependency === 'function';
  }
  return false;
}

/**
 * Type guard: Checks if value is a function with addDependency
 */
export function isTrackableFunction(value: unknown): value is TrackableFunction & DependencySubscriber {
  return typeof value === 'function' && typeof (value as TrackableFunction).addDependency === 'function';
}

/**
 * Type guard: Checks if value is a plain function (no addDependency)
 */
export function isPlainListener(value: unknown): value is () => void {
  return typeof value === 'function' && typeof (value as TrackableFunction).addDependency !== 'function';
}

/**
 * Type guard: Checks if value has execute method (Subscriber pattern)
 */
export function hasExecuteMethod(value: unknown): value is ExecutableSubscriber {
  return isNonNullObject(value) && typeof value.execute === 'function';
}
