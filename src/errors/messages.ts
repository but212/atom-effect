/**
 * @fileoverview Centralized error messages for better maintainability
 * @description All error messages in English for international accessibility
 */

export const ERROR_MESSAGES = {
  // Computed errors
  COMPUTED_MUST_BE_FUNCTION: 'Computed function must be a function',
  COMPUTED_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscriber listener must be a function',
  COMPUTED_ASYNC_PENDING_NO_DEFAULT: 'Async computation is pending. No default value provided',
  COMPUTED_COMPUTATION_FAILED: 'Computed computation failed',
  COMPUTED_ASYNC_COMPUTATION_FAILED: 'Async computed computation failed',
  COMPUTED_DEPENDENCY_SUBSCRIPTION_FAILED: 'Failed to subscribe to dependency',

  // Atom errors
  ATOM_SUBSCRIBER_MUST_BE_FUNCTION: 'Subscription listener must be a function',
  ATOM_SUBSCRIBER_EXECUTION_FAILED: 'Error occurred while executing atom subscribers',
  ATOM_INDIVIDUAL_SUBSCRIBER_FAILED: 'Error during individual atom subscriber execution',

  // Effect errors
  EFFECT_MUST_BE_FUNCTION: 'Effect function must be a function',
  EFFECT_EXECUTION_FAILED: 'Effect execution failed',
  EFFECT_CLEANUP_FAILED: 'Effect cleanup function execution failed',

  // Debug warnings
  LARGE_DEPENDENCY_GRAPH: (count: number) =>
    `Large dependency graph detected: ${count} dependencies`,
  UNSUBSCRIBE_NON_EXISTENT: 'Attempted to unsubscribe a non-existent listener',
  CALLBACK_ERROR_IN_ERROR_HANDLER: 'Error occurred during onError callback execution',
} as const;
