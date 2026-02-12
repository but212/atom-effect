import { computed } from '@but212/atom-effect';
import $ from 'jquery';
import type { ComputedAtom, FetchOptions } from './types';

/**
 * Creates a reactive fetch atom that auto-refetches when reactive dependencies change.
 *
 * Wraps core's async `computed` with jQuery's `$.ajax`.
 * Returns a standard `ComputedAtom<T>` with `isPending`, `hasError`, `invalidate()`, etc.
 */
function atomFetch<T>(
  urlOrFn: string | (() => string),
  options: FetchOptions<T>
): ComputedAtom<T> {
  const { defaultValue, transform, method, headers, ajaxOptions } = options;
  const getUrl = typeof urlOrFn === 'function' ? urlOrFn : () => urlOrFn;

  return computed(
    async () => {
      const url = getUrl();
      const raw = await $.ajax({ ...ajaxOptions, url, method, headers });
      return transform ? transform(raw) : (raw as T);
    },
    { defaultValue, lazy: false }
  );
}

$.extend({ atomFetch });
