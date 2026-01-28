/** Centralized error message constants. */
export const ERROR_MESSAGES = {
  // Computed
  COMPUTED_MUST_BE_FUNCTION: 'Computed function must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation is pending. No default value provided',
  COMPUTED_COMPUTATION_FAILED: 'Computed computation failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computed computation failed',
  COMPUTED_CIRCULAR_DEPENDENCY: 'Circular dependency detected during computation',
  COMPUTED_DISPOSED: 'Cannot access a disposed computed',

  // Atom
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscription listener must be a function or Subscriber object',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Error during individual atom subscriber execution',

  // Effect
  EFFECT_MUST_BE_FUNCTION: 'Effect function must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup function execution failed',
  EFFECT_DISPOSED: 'Cannot run a disposed effect',

  // Debug / Misc
  LARGE_DEPENDENCY_GRAPH: (count: number): string =>
    `Large dependency graph detected: ${count} dependencies`,
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Error occurred during onError callback execution',
} as const;
