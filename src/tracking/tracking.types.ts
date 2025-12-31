/**
 * Interface for listeners that can track dependencies
 */
export interface DependencyTracker {
  addDependency?: (dep: unknown) => void;
  execute?: () => void;
}

/**
 * Listener type
 */
export type Listener = DependencyTracker | (() => void);
