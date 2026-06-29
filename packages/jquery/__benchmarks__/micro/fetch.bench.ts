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
  const run = (
    name: string,
    benchmarkFunction: ($container: JQuery) => void | Promise<void>,
    iterations = 200
  ) => bench(name, withContainer(benchmarkFunction), { ...microBenchOptions, iterations });

  run('setup eager atomFetch', () => {
    mockResponse = { id: 1, name: 'Alice' };
    $.atomFetch<FetchMockData>(() => '/api/user', {
      eager: true,
      defaultValue: { id: 0, name: '' },
    }).dispose();
  });

  run('setup lazy atomFetch', () => {
    mockResponse = { id: 1, name: 'Alice' };
    $.atomFetch<FetchMockData>(() => '/api/user', {
      eager: false,
      defaultValue: { id: 0, name: '' },
    }).dispose();
  });

  run(
    'trigger refetch on dependency update',
    async () => {
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
    },
    100
  );

  run(
    'trigger fetch with sync transformation pipeline',
    async () => {
      mockResponse = { id: 42, name: 'Bob' };
      const fetchAtom = $.atomFetch<string>(() => '/api/user', {
        defaultValue: '',
        eager: true,
        transform: (rawData) => (rawData as FetchMockData).name.toUpperCase(),
      });
      await fetchAtom.value;
      fetchAtom.dispose();
    },
    100
  );

  run(
    'rapid dependency updates causing multiple aborts (50 times)',
    async () => {
      mockResponse = { id: 99, name: 'Charlie' };
      const userId = $.atom(1);
      const fetchAtom = $.atomFetch<FetchMockData>(() => `/api/user/${userId.value}`, {
        defaultValue: { id: 0, name: '' },
        eager: true,
      });
      for (let i = 0; i < 50; i++) userId.value = 10 + i;
      await fetchAtom.value;
      fetchAtom.dispose();
    },
    50
  );
});
