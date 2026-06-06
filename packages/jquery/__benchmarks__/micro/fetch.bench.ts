/**
 * @fileoverview Micro-benchmarks for reactive network requests (atomFetch).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { microBenchOptions, withContainer } from '../utils/setup';

interface FetchMockData {
  id: number;
  name: string;
}

let mockResponse: FetchMockData = { id: 1, name: 'Alice' };

$.ajax = (
  _urlOrSettings?: string | JQuery.AjaxSettings,
  _settings?: JQuery.AjaxSettings
): JQuery.jqXHR => {
  const deferred = $.Deferred<FetchMockData, string, never>();
  deferred.resolve(mockResponse);
  const promise = deferred.promise();
  return {
    ...promise,
    abort: () => {},
    getResponseHeader: () => null,
  } as unknown as JQuery.jqXHR;
};

// ============================================================================
// 1. Initialization
// ============================================================================

describe('Fetch: Setup & Eager/Lazy Initialization', () => {
  const setupFetch = (eager: boolean) => () => {
    mockResponse = { id: 1, name: 'Alice' };
    const fetchAtom = $.atomFetch<FetchMockData>(() => '/api/user', {
      eager,
      defaultValue: { id: 0, name: '' },
    });
    fetchAtom.dispose();
  };

  bench('setup eager atomFetch', setupFetch(true), microBenchOptions);
  bench('setup lazy atomFetch', setupFetch(false), microBenchOptions);
});

// ============================================================================
// 2. Dependency Tracking and updates
// ============================================================================

describe('Fetch: Dependency Reaction and Pipeline', () => {
  bench(
    'trigger refetch on dependency update',
    withContainer(async () => {
      mockResponse = { id: 42, name: 'Bob' };
      const userId = $.atom(1);

      const fetchAtom = $.atomFetch<FetchMockData>(() => `/api/user/${userId.value}`, {
        defaultValue: { id: 0, name: '' },
        eager: true,
      });

      // Force resolution
      await fetchAtom.value;

      // Trigger dependency update (will initiate async fetch)
      userId.value = 2;
      await fetchAtom.value;

      fetchAtom.dispose();
    }),
    { ...microBenchOptions, iterations: 100 }
  );

  bench(
    'trigger fetch with sync transformation pipeline',
    async () => {
      mockResponse = { id: 42, name: 'Bob' };
      const fetchAtom = $.atomFetch<string>(() => '/api/user', {
        defaultValue: '',
        eager: true,
        transform: (data) => {
          const u = data as FetchMockData;
          return u.name.toUpperCase();
        },
      });

      await fetchAtom.value;

      fetchAtom.dispose();
    },
    { ...microBenchOptions, iterations: 100 }
  );
});

// ============================================================================
// 3. Concurrency & Abort Overhead
// ============================================================================

describe('Fetch: Concurrency & Abort Overhead', () => {
  bench(
    'rapid dependency updates causing multiple aborts (50 times)',
    async () => {
      mockResponse = { id: 99, name: 'Charlie' };
      const userId = $.atom(1);

      const fetchAtom = $.atomFetch<FetchMockData>(() => `/api/user/${userId.value}`, {
        defaultValue: { id: 0, name: '' },
        eager: true,
      });

      // 50 synchronous changes to trigger rapid abort cascading
      for (let i = 0; i < 50; i++) {
        userId.value = 10 + i;
      }

      // Await final resolution
      await fetchAtom.value;

      fetchAtom.dispose();
    },
    { ...microBenchOptions, iterations: 50 }
  );
});
