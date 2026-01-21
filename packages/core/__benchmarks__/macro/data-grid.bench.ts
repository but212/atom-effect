/**
 * @fileoverview Data grid macro-benchmark
 * @description Real-world scenario: Data grid with sorting, filtering, pagination
 */

import { bench, describe } from 'vitest';
import { atom, batch, computed } from '../../src/index.js';
import type { DataGridRow } from '../fixtures/index.js';
import { generateGridData } from '../fixtures/index.js';
import { macroBenchOptions } from '../utils/setup.js';

describe('Data Grid: Initialization Baseline', () => {
  bench(
    '[Vanilla] initialize 1000 rows',
    () => {
      const data = generateGridData(1000);
      const rows = data;
      const _ = rows[0];
    },
    macroBenchOptions
  );

  bench(
    '[Atom] initialize 1000 rows',
    () => {
      const data = generateGridData(1000);
      const rows = atom<DataGridRow[]>(data);
      const _ = rows.value;
    },
    macroBenchOptions
  );
});

describe('Data Grid: Sorting Baseline', () => {
  const data = generateGridData(1000);

  let sortDir: 'asc' | 'desc' = 'asc';

  bench(
    '[Vanilla] sort 1000 rows by name',
    () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      const sorted = [...data].sort((a, b) => {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
      const _ = sorted[0];
    },
    macroBenchOptions
  );

  const rowsSortName = atom<DataGridRow[]>(data);
  const sortDirAtom = atom<'asc' | 'desc'>('asc');
  const sortedRowsName = computed(() => {
    return [...rowsSortName.value].sort((a, b) => {
      return sortDirAtom.value === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
  });

  bench(
    '[Atom] sort 1000 rows by name',
    () => {
      sortDirAtom.value = sortDirAtom.value === 'asc' ? 'desc' : 'asc';
      const _ = sortedRowsName.value;
    },
    macroBenchOptions
  );
});

describe('Data Grid: Filtering Baseline', () => {
  const data = generateGridData(1000);
  let dept = 'Engineering';

  bench(
    '[Vanilla] filter 1000 rows by department',
    () => {
      dept = dept === 'Engineering' ? 'Sales' : 'Engineering';
      const filtered = data.filter((row: DataGridRow) => row.department === dept);
      const _ = filtered[0];
    },
    macroBenchOptions
  );

  const rowsFilter = atom<DataGridRow[]>(data);
  const departmentFilter = atom<string>('Engineering');
  const filteredRows = computed(() => {
    return rowsFilter.value.filter((row: DataGridRow) => row.department === departmentFilter.value);
  });

  bench(
    '[Atom] filter 1000 rows by department',
    () => {
      departmentFilter.value = departmentFilter.value === 'Engineering' ? 'Sales' : 'Engineering';
      const _ = filteredRows.value;
    },
    macroBenchOptions
  );
});

describe('Data Grid: Complex Operations (Sort + Filter + Paginate)', () => {
  const data = generateGridData(1000);
  let sortDir: 'asc' | 'desc' = 'asc';

  bench(
    '[Vanilla] sort + filter + paginate',
    () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      const sorted = [...data].sort((a, b) => {
        return sortDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
      const filtered = sorted.filter((row: DataGridRow) => row.department === 'Engineering');
      const paginated = filtered.slice(0, 20);
      const _ = paginated[0];
    },
    macroBenchOptions
  );

  const rowsComplex = atom<DataGridRow[]>(data);
  const sortDirAtom = atom<'asc' | 'desc'>('asc');
  const sortedRowsComplex = computed(() => {
    return [...rowsComplex.value].sort((a, b) => {
      return sortDirAtom.value === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
  });
  const filteredRowsComplex = computed(() => {
    return sortedRowsComplex.value.filter((row: DataGridRow) => row.department === 'Engineering');
  });
  const paginatedRowsComplex = computed(() => {
    return filteredRowsComplex.value.slice(0, 20);
  });

  bench(
    '[Atom] sort + filter + paginate',
    () => {
      sortDirAtom.value = sortDirAtom.value === 'asc' ? 'desc' : 'asc';
      const _ = paginatedRowsComplex.value;
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
