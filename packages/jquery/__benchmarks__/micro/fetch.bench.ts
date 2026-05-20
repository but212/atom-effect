/**
 * @fileoverview Micro-benchmarks for reactive network requests (atomFetch).
 */

import { bench, describe } from 'vitest';
import $ from '../../dist';
import { cleanupContainer, createContainer, microBenchOptions } from '../utils/setup';

interface FetchMockData {
  id: number;
  name: string;
}

const originalAjax = $.ajax;

function setupMockAjax(responseObj: FetchMockData): void {
  $.ajax = (
    _urlOrSettings?: string | JQuery.AjaxSettings,
    _settings?: JQuery.AjaxSettings
  ): JQuery.jqXHR => {
    const deferred = $.Deferred<FetchMockData, string, never>();
    deferred.resolve(responseObj);
    const promise = deferred.promise();
    return {
      ...promise,
      abort: () => {},
      getResponseHeader: () => null,
    } as unknown as JQuery.jqXHR;
  };
}

function restoreAjax(): void {
  $.ajax = originalAjax;
}

// ============================================================================
// 1. Initialization
// ============================================================================

describe('Fetch: Setup & Eager/Lazy Initialization', () => {
  const mockData: FetchMockData = { id: 1, name: 'Alice' };

  bench(
    'setup eager atomFetch',
    () => {
      setupMockAjax(mockData);
      const fetchAtom = $.atomFetch<FetchMockData>(() => '/api/user', {
        eager: true,
        defaultValue: { id: 0, name: '' },
      });
      fetchAtom.dispose();
      restoreAjax();
    },
    microBenchOptions
  );

  bench(
    'setup lazy atomFetch',
    () => {
      setupMockAjax(mockData);
      const fetchAtom = $.atomFetch<FetchMockData>(() => '/api/user', {
        eager: false,
        defaultValue: { id: 0, name: '' },
      });
      fetchAtom.dispose();
      restoreAjax();
    },
    microBenchOptions
  );
});

// ============================================================================
// 2. Dependency Tracking and updates
// ============================================================================

describe('Fetch: Dependency Reaction and Pipeline', () => {
  const mockData: FetchMockData = { id: 42, name: 'Bob' };

  bench(
    'trigger refetch on dependency update',
    async () => {
      setupMockAjax(mockData);
      const $c = createContainer();
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
      cleanupContainer($c);
      restoreAjax();
    },
    { ...microBenchOptions, iterations: 100 }
  );

  bench(
    'trigger fetch with sync transformation pipeline',
    async () => {
      setupMockAjax(mockData);
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
      restoreAjax();
    },
    { ...microBenchOptions, iterations: 100 }
  );
});

// ============================================================================
// 3. Concurrency & Abort Overhead
// ============================================================================

describe('Fetch: Concurrency & Abort Overhead', () => {
  const mockData: FetchMockData = { id: 99, name: 'Charlie' };

  bench(
    'rapid dependency updates causing multiple aborts (50 times)',
    async () => {
      setupMockAjax(mockData);
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
      restoreAjax();
    },
    { ...microBenchOptions, iterations: 50 }
  );
});
