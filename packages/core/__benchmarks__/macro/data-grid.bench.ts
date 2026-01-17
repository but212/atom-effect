/**
 * @fileoverview Data grid macro-benchmark
 * @description Real-world scenario: Data grid with sorting, filtering, pagination
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed } from '../../src/index.js';
import type { DataGridRow } from '../fixtures/index.js';
import { generateGridData } from '../fixtures/index.js';
import { macroBenchOptions } from '../utils/setup.js';

describe('Data Grid Scenarios', () => {
  // Initialization benchmark - Creation IS the test
  bench(
    'initialize grid with 1000 rows',
    () => {
      const data = generateGridData(1000);
      const rows = atom<DataGridRow[]>(data);
      const _ = rows.value;
    },
    macroBenchOptions
  );

  const rowsSortName = atom<DataGridRow[]>(generateGridData(1000));
  const sortedRowsName = computed(() => {
    return [...rowsSortName.value].sort((a, b) => a.name.localeCompare(b.name));
  });

  bench(
    'sort 1000 rows by name',
    () => {
      // Trigger re-sort by modifying data
      rowsSortName.value = [...rowsSortName.value];
      const _ = sortedRowsName.value;
    },
    macroBenchOptions
  );

  const rowsSortSalary = atom<DataGridRow[]>(generateGridData(1000));
  const sortedRowsSalary = computed(() => {
    return [...rowsSortSalary.value].sort((a, b) => b.salary - a.salary);
  });

  bench(
    'sort 1000 rows by salary',
    () => {
      rowsSortSalary.value = [...rowsSortSalary.value];
      const _ = sortedRowsSalary.value;
    },
    macroBenchOptions
  );

  const rowsFilter = atom<DataGridRow[]>(generateGridData(1000));
  const departmentFilter = atom<string>('Engineering');
  const filteredRows = computed(() => {
    return rowsFilter.value.filter((row: DataGridRow) => row.department === departmentFilter.value);
  });

  bench(
    'filter 1000 rows by department',
    () => {
      // Toggle filter
      departmentFilter.value = departmentFilter.value === 'Engineering' ? 'Sales' : 'Engineering';
      const _ = filteredRows.value;
    },
    macroBenchOptions
  );

  const rowsPaginate = atom<DataGridRow[]>(generateGridData(1000));
  const page = atom(1);
  const pageSize = atom(10);
  const paginatedRows = computed(() => {
    const start = (page.value - 1) * pageSize.value;
    const end = start + pageSize.value;
    return rowsPaginate.value.slice(start, end);
  });

  bench(
    'paginate 1000 rows (10 rows per page)',
    () => {
      // Go to next page, cycle 1-10
      page.value = (page.value % 10) + 1;
      const _ = paginatedRows.value;
    },
    macroBenchOptions
  );

  const rowsComplex = atom<DataGridRow[]>(generateGridData(1000));
  const sortBy = atom<keyof DataGridRow>('name');
  const sortDir = atom<'asc' | 'desc'>('asc');
  const deptFilter = atom<string | null>(null);
  const pageComplex = atom(1);
  const pageSizeComplex = atom(20);

  const sortedRowsComplex = computed(() => {
    const sorted = [...rowsComplex.value].sort((a, b) => {
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

  const filteredRowsComplex = computed(() => {
    if (!deptFilter.value) return sortedRowsComplex.value;
    return sortedRowsComplex.value.filter(
      (row: DataGridRow) => row.department === deptFilter.value
    );
  });

  const paginatedRowsComplex = computed(() => {
    const start = (pageComplex.value - 1) * pageSizeComplex.value;
    const end = start + pageSizeComplex.value;
    return filteredRowsComplex.value.slice(start, end);
  });

  bench(
    'sort + filter + paginate (1000 rows)',
    () => {
      // Change one condition per run to trigger chain
      if (sortDir.value === 'asc') {
        sortDir.value = 'desc';
      } else {
        sortDir.value = 'asc';
      }
      const _ = paginatedRowsComplex.value;
    },
    macroBenchOptions
  );

  const rowsUpdate = atom<DataGridRow[]>(generateGridData(1000));

  bench(
    'update single row in 1000 rows',
    () => {
      // Update row
      rowsUpdate.value = rowsUpdate.value.map((row: DataGridRow) =>
        row.id === 500 ? { ...row, salary: row.salary + 1 } : row
      );
    },
    macroBenchOptions
  );

  const rowsBatch = atom<DataGridRow[]>(generateGridData(1000));

  bench(
    'batch update 100 rows in 1000 rows',
    () => {
      batch(() => {
        for (let i = 0; i < 100; i++) {
          rowsBatch.value = rowsBatch.value.map((row: DataGridRow) =>
            row.id === i ? { ...row, active: !row.active } : row
          );
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
      const _rows = atom<DataGridRow[]>(generateGridData(1000));
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
