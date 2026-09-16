/**
 * @fileoverview Micro-benchmarks for reactive network requests (atomFetch).
 */

import { describe, test } from 'vitest';
import $ from '../../dist';
import { microBenchOptions } from '../utils/setup';

interface FetchMockData {
  id: number;
  name: string;
}

let mockResponse: FetchMockData = { id: 1, name: 'Alice' };

const castTo = <T>(value: unknown): T => value as T;

$.ajax = (): JQuery.jqXHR => {
  const def = $.Deferred<FetchMockData, string, never>().resolve(mockResponse);
  return castTo<JQuery.jqXHR>({
    ...def.promise(),
    abort: () => {},
    getResponseHeader: () => null,
  });
};

describe('Fetch: Setup & Dependency Pipeline', () => {
  test('fetch setup comparison', async ({ bench }) => {
    await bench.compare(
      bench('setup eager atomFetch', () => {
        mockResponse = { id: 1, name: 'Alice' };
        $.atomFetch<FetchMockData>(() => '/api/user', {
          eager: true,
          defaultValue: { id: 0, name: '' },
        }).dispose();
      }),
      bench('setup lazy atomFetch', () => {
        mockResponse = { id: 1, name: 'Alice' };
        $.atomFetch<FetchMockData>(() => '/api/user', {
          eager: false,
          defaultValue: { id: 0, name: '' },
        }).dispose();
      }),
      { ...microBenchOptions, iterations: 200 }
    );
  });

  test('fetch dependency pipeline comparison', async ({ bench }) => {
    await bench.compare(
      bench('trigger refetch on dependency update', async () => {
        mockResponse = { id: 42, name: 'Bob' };
        const userId = $.atom(1);
        const fetchAtom = $.atomFetch<FetchMockData>(() => `/api/user/${userId.value}`, {
          defaultValue: { id: 0, name: '' },
          eager: true,
        });
        await fetchAtom.value;
        userId.value = 2;
        await fetchAtom.value;
        fetchAtom.dispose();
      }),
      bench('trigger fetch with sync transformation pipeline', async () => {
        mockResponse = { id: 42, name: 'Bob' };
        const fetchAtom = $.atomFetch<string>(() => '/api/user', {
          defaultValue: '',
          eager: true,
          transform: (rawData: unknown) => (rawData as FetchMockData).name.toUpperCase(),
        });
        await fetchAtom.value;
        fetchAtom.dispose();
      }),
      { ...microBenchOptions, iterations: 100 }
    );
  });

  test('rapid dependency updates with aborts', async ({ bench }) => {
    await bench('rapid dependency updates causing multiple aborts (50 times)', async () => {
      mockResponse = { id: 99, name: 'Charlie' };
      const userId = $.atom(1);
      const fetchAtom = $.atomFetch<FetchMockData>(() => `/api/user/${userId.value}`, {
        defaultValue: { id: 0, name: '' },
        eager: true,
      });
      for (let i = 0; i < 50; i++) userId.value = 10 + i;
      await fetchAtom.value;
      fetchAtom.dispose();
    }).run({ ...microBenchOptions, iterations: 50 });
  });
});
