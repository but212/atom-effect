/**
 * @fileoverview Data grid macro-benchmark
 * @description Real-world scenario: Data grid with sorting, filtering, pagination
 */

import { bench, describe } from 'vitest';
import { atom, computed, batch } from '../../src/index.js';
import { macroBenchOptions } from '../utils/setup.js';
import { generateGridData } from '../fixtures/index.js';
import type { DataGridRow } from '../fixtures/index.js';

describe('Data Grid Scenarios', () => {
  bench(
    'initialize grid with 1000 rows',
    () => {
      const data = generateGridData(1000);
      const rows = atom<DataGridRow[]>(data);
      const _ = rows.value;
    },
    macroBenchOptions
  );

  bench(
    'sort 1000 rows by name',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));

      const sortedRows = computed(() => {
        return [...rows.value].sort((a, b) => a.name.localeCompare(b.name));
      });

      const _ = sortedRows.value;
    },
    macroBenchOptions
  );

  bench(
    'sort 1000 rows by salary',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));

      const sortedRows = computed(() => {
        return [...rows.value].sort((a, b) => b.salary - a.salary);
      });

      const _ = sortedRows.value;
    },
    macroBenchOptions
  );

  bench(
    'filter 1000 rows by department',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));
      const departmentFilter = atom<string>('Engineering');

      const filteredRows = computed(() => {
        return rows.value.filter((row) => row.department === departmentFilter.value);
      });

      const _ = filteredRows.value;

      // Change filter
      departmentFilter.value = 'Sales';
      const __ = filteredRows.value;
    },
    macroBenchOptions
  );

  bench(
    'paginate 1000 rows (10 rows per page)',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));
      const page = atom(1);
      const pageSize = atom(10);

      const paginatedRows = computed(() => {
        const start = (page.value - 1) * pageSize.value;
        const end = start + pageSize.value;
        return rows.value.slice(start, end);
      });

      // Access multiple pages
      for (let i = 1; i <= 10; i++) {
        page.value = i;
        const _ = paginatedRows.value;
      }
    },
    macroBenchOptions
  );

  bench(
    'sort + filter + paginate (1000 rows)',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));
      const sortBy = atom<keyof DataGridRow>('name');
      const sortDir = atom<'asc' | 'desc'>('asc');
      const departmentFilter = atom<string | null>(null);
      const page = atom(1);
      const pageSize = atom(20);

      // Sort
      const sortedRows = computed(() => {
        const sorted = [...rows.value].sort((a, b) => {
          const aVal = a[sortBy.value];
          const bVal = b[sortBy.value];
          if (typeof aVal === 'string' && typeof bVal === 'string') {
            return sortDir.value === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
          }
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sortDir.value === 'asc' ? aVal - bVal : bVal - aVal;
          }
          return 0;
        });
        return sorted;
      });

      // Filter
      const filteredRows = computed(() => {
        if (!departmentFilter.value) return sortedRows.value;
        return sortedRows.value.filter((row) => row.department === departmentFilter.value);
      });

      // Paginate
      const paginatedRows = computed(() => {
        const start = (page.value - 1) * pageSize.value;
        const end = start + pageSize.value;
        return filteredRows.value.slice(start, end);
      });

      // Initial load
      let _ = paginatedRows.value;

      // Sort by salary
      sortBy.value = 'salary';
      sortDir.value = 'desc';
      _ = paginatedRows.value;

      // Filter Engineering
      departmentFilter.value = 'Engineering';
      _ = paginatedRows.value;

      // Go to page 2
      page.value = 2;
      _ = paginatedRows.value;
    },
    macroBenchOptions
  );

  bench(
    'update single row in 1000 rows',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));

      // Update row
      rows.value = rows.value.map((row) => (row.id === 500 ? { ...row, salary: 100000 } : row));
    },
    macroBenchOptions
  );

  bench(
    'batch update 100 rows in 1000 rows',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));

      batch(() => {
        for (let i = 1; i <= 100; i++) {
          rows.value = rows.value.map((row) => (row.id === i ? { ...row, active: false } : row));
        }
      });
    },
    macroBenchOptions
  );
});

describe('Data Grid with Selection', () => {
  bench(
    'select/deselect rows',
    () => {
      const rows = atom<DataGridRow[]>(generateGridData(1000));
      const selectedIds = atom<Set<number>>(new Set());

      const selectedCount = computed(() => selectedIds.value.size);

      // Select 100 rows
      for (let i = 1; i <= 100; i++) {
        selectedIds.value = new Set([...selectedIds.value, i]);
      }

      // Deselect 50 rows
      for (let i = 1; i <= 50; i++) {
        const newSet = new Set(selectedIds.value);
        newSet.delete(i);
        selectedIds.value = newSet;
      }

      const _ = selectedCount.value;
    },
    macroBenchOptions
  );
});
