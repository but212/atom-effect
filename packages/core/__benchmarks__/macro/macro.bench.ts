/**
 * @fileoverview Macro-benchmarks for atom-effect core
 * @description Combined real-world scenarios: Todo app, Data grid, Dependency graph, etc.
 */

import { bench, describe } from 'vitest';
import { atom, atomLens, computed, effect } from '../../dist';
import type { DataGridRow, TodoItem } from '../fixtures/index.js';
import { generateGridData } from '../fixtures/index.js';
import {
  benchEffectOptions,
  forceGC,
  getMemoryUsage,
  keep,
  macroBenchOptions,
  memoryBenchOptions,
  microBenchOptions,
} from '../utils/setup.js';

const REPEATS = 100;

describe('Todo App: Comprehensive Workflow', () => {
  // Vanilla implementation
  let vanillaTodos: TodoItem[] = [];
  let vanillaFilter: 'all' | 'active' | 'completed' = 'all';

  bench(
    '[Vanilla] full workflow: add → toggle → filter → delete → stats',
    () => {
      vanillaTodos = [];
      vanillaFilter = 'all';

      const nextBatch: TodoItem[] = [];
      for (let i = 0; i < 100; i++) {
        nextBatch.push({ id: i, text: 'New', completed: false, createdAt: new Date() });
      }
      vanillaTodos = nextBatch;

      vanillaTodos = vanillaTodos.map((t, i) => (i < 50 ? { ...t, completed: true } : t));

      vanillaFilter = 'active';

      vanillaTodos = vanillaTodos.slice(20);

      vanillaFilter = 'all';

      const filtered =
        vanillaFilter === 'all'
          ? vanillaTodos
          : vanillaFilter === 'active'
            ? vanillaTodos.filter((t) => !t.completed)
            : vanillaTodos.filter((t) => t.completed);

      const total = vanillaTodos.length;
      const completed = vanillaTodos.filter((t) => t.completed).length;
      const rate = total === 0 ? 0 : (completed / total) * 100;

      keep([filtered.length, rate]);
    },
    macroBenchOptions
  );

  const todosWorkflow = atom<TodoItem[]>([]);
  const filterWorkflow = atom<'all' | 'active' | 'completed'>('all');
  const filteredWorkflow = computed(() => {
    const f = filterWorkflow.value;
    if (f === 'all') return todosWorkflow.value;
    if (f === 'active') return todosWorkflow.value.filter((t: TodoItem) => !t.completed);
    return todosWorkflow.value.filter((t: TodoItem) => t.completed);
  });

  const totalCount = computed(() => todosWorkflow.value.length);
  const completedCount = computed(
    () => todosWorkflow.value.filter((t: TodoItem) => t.completed).length
  );
  const completionRate = computed(() =>
    totalCount.value === 0 ? 0 : (completedCount.value / totalCount.value) * 100
  );

  let _displayCount = 0;
  let _rate = 0;
  effect(() => {
    _displayCount = filteredWorkflow.value.length;
    _rate = completionRate.value;
  }, benchEffectOptions);

  bench(
    '[Atom] full workflow: add → toggle → filter → delete → stats',
    () => {
      // 1. Reset
      todosWorkflow.value = [];
      filterWorkflow.value = 'all';

      // 2. Add 100
      const nextBatch: TodoItem[] = [];
      for (let i = 0; i < 100; i++) {
        nextBatch.push({ id: i, text: 'New', completed: false, createdAt: new Date() });
      }
      todosWorkflow.value = nextBatch;

      // 3. Toggle 50
      todosWorkflow.value = todosWorkflow.value.map((t, i) =>
        i < 50 ? { ...t, completed: true } : t
      );

      // 4. Filter
      filterWorkflow.value = 'active';

      // 5. Delete 20
      todosWorkflow.value = todosWorkflow.value.slice(20);

      // 6. Back to all and check stats
      filterWorkflow.value = 'all';
      keep([_displayCount, _rate]);
    },
    macroBenchOptions
  );
});

describe('Data Grid: Core Operations (1000 Rows)', () => {
  const data = generateGridData(1000);

  let sortDir: 'asc' | 'desc' = 'asc';
  bench(
    '[Vanilla] toggle sort',
    () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      const sorted = [...data].sort((a, b) => {
        const compare = a.name.localeCompare(b.name);
        return sortDir === 'asc' ? compare : -compare;
      });
      keep(sorted[0]);
    },
    macroBenchOptions
  );

  const rowsSort = atom<DataGridRow[]>(data);
  const sortDirAtom = atom<'asc' | 'desc'>('asc');
  const sortedRows = computed(() => {
    return [...rowsSort.value].sort((a, b) => {
      const compare = a.name.localeCompare(b.name);
      return sortDirAtom.value === 'asc' ? compare : -compare;
    });
  });

  bench(
    '[Atom] toggle sort',
    () => {
      sortDirAtom.value = sortDirAtom.value === 'asc' ? 'desc' : 'asc';
      keep(sortedRows.value);
    },
    macroBenchOptions
  );

  let dept = 'Engineering';
  bench(
    '[Vanilla] switch filter',
    () => {
      dept = dept === 'Engineering' ? 'Sales' : 'Engineering';
      const filtered = data.filter((row: DataGridRow) => row.department === dept);
      keep(filtered[0]);
    },
    macroBenchOptions
  );

  const rowsFilter = atom<DataGridRow[]>(data);
  const departmentFilter = atom<string>('Engineering');
  const filteredRows = computed(() => {
    return rowsFilter.value.filter((row: DataGridRow) => row.department === departmentFilter.value);
  });

  bench(
    '[Atom] switch filter',
    () => {
      departmentFilter.value = departmentFilter.value === 'Engineering' ? 'Sales' : 'Engineering';
      keep(filteredRows.value);
    },
    macroBenchOptions
  );

  let sortDirP: 'asc' | 'desc' = 'asc';
  bench(
    '[Vanilla] sort + filter + paginate',
    () => {
      sortDirP = sortDirP === 'asc' ? 'desc' : 'asc';
      const sorted = [...data].sort((a, b) => {
        return sortDirP === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
      });
      const filtered = sorted.filter((row: DataGridRow) => row.department === 'Engineering');
      const paginated = filtered.slice(0, 20);
      keep(paginated[0]);
    },
    macroBenchOptions
  );

  const rowsComplex = atom<DataGridRow[]>(data);
  const sortDirComplex = atom<'asc' | 'desc'>('asc');
  const paginatedRowsComplex = computed(() => {
    const sorted = [...rowsComplex.value].sort((a, b) => {
      return sortDirComplex.value === 'asc'
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name);
    });
    const filtered = sorted.filter((row: DataGridRow) => row.department === 'Engineering');
    return filtered.slice(0, 20);
  });

  bench(
    '[Atom] sort + filter + paginate',
    () => {
      sortDirComplex.value = sortDirComplex.value === 'asc' ? 'desc' : 'asc';
      keep(paginatedRowsComplex.value);
    },
    macroBenchOptions
  );
});

describe('Data Grid: Targeted Updates', () => {
  const ROW_COUNT = 1000;
  const data = generateGridData(ROW_COUNT);
  const rowsAtom = atom<DataGridRow[]>(data);

  // Target middle row
  const targetIdx = Math.floor(ROW_COUNT / 2);
  const nameLens = atomLens(rowsAtom, `${targetIdx}.name`);

  bench(
    `[Manual] update single cell (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const nextRows = [...rowsAtom.peek()];
        nextRows[targetIdx] = { ...nextRows[targetIdx]!, name: `Updated ${i}` };
        rowsAtom.value = nextRows;
      }
    },
    macroBenchOptions
  );

  bench(
    `[Lens] update single cell (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        nameLens.value = `Updated ${i}`;
      }
    },
    macroBenchOptions
  );

  bench(
    'select/deselect rows (Set-based)',
    () => {
      const selectedIds = atom<Set<number>>(new Set());
      const selectedCount = computed(() => selectedIds.value.size);

      for (let i = 1; i <= 100; i++) {
        const newSet = new Set(selectedIds.value);
        newSet.add(i);
        selectedIds.value = newSet;
      }
      for (let i = 1; i <= 50; i++) {
        const newSet = new Set(selectedIds.value);
        newSet.delete(i);
        selectedIds.value = newSet;
      }
      keep(selectedCount.value);
    },
    macroBenchOptions
  );
});

describe('Dependency Graph Patterns', () => {
  const chainSource = atom(0);
  let chainSink = computed(() => chainSource.value);
  for (let i = 1; i < 100; i++) {
    const prev = chainSink;
    chainSink = computed(() => prev.value + 1);
  }

  const diamondSource = atom(1);
  const diamondLevel1 = Array.from({ length: 10 }, (_, i) =>
    computed(() => diamondSource.value * (i + 1))
  );
  const diamondLevel2 = Array.from({ length: 10 }, (_, i) =>
    computed(() => diamondLevel1[i]!.value * 2)
  );
  const diamondSink = computed(() => diamondLevel2.reduce((sum, c) => sum + c.value, 0));

  const pyramidBase = Array.from({ length: 50 }, (_, i) => atom(i));
  let currentLevel = pyramidBase.map((a) => computed(() => a.value));
  for (let level = 1; level < 50; level++) {
    const nextLevel: any[] = [];
    for (let i = 0; i < currentLevel.length - 1; i++) {
      const left = currentLevel[i]!;
      const right = currentLevel[i + 1]!;
      nextLevel.push(computed(() => left.value + right.value));
    }
    currentLevel = nextLevel;
    if (currentLevel.length === 0) break;
  }
  const pyramidApex = currentLevel[0];

  bench(
    'deep chain (100 levels)',
    () => {
      chainSource.value += 1;
      keep(chainSink.value);
    },
    macroBenchOptions
  );

  bench(
    'diamond pattern (1 → 10 → 10 → 1)',
    () => {
      diamondSource.value += 1;
      keep(diamondSink.value);
    },
    macroBenchOptions
  );

  bench(
    'pyramid pattern (50 levels)',
    () => {
      pyramidBase[0]!.value += 1;
      keep(pyramidApex!.value);
    },
    macroBenchOptions
  );
});

describe('Complex Graph Architecture', () => {
  const mixedAtoms = Array.from({ length: 100 }, (_, i) => atom(i));
  const mixedComputeds = Array.from({ length: 200 }, (_, i) => {
    const idx1 = i % mixedAtoms.length;
    const idx2 = (i + 1) % mixedAtoms.length;
    return computed(() => mixedAtoms[idx1]!.value + mixedAtoms[idx2]!.value);
  });

  const circA = atom(1);
  const circB = atom(2);
  const circC = atom(3);
  const circAb = computed(() => circA.value + circB.value);
  const circBc = computed(() => circB.value + circC.value);
  const circCa = computed(() => circC.value + circA.value);
  const circAll = computed(() => circAb.value + circBc.value + circCa.value);

  bench(
    'mixed dependencies (100 atoms → 200 computeds)',
    () => {
      mixedAtoms[0]!.value += 1;
      let last: any;
      mixedComputeds.forEach((c) => {
        last = c.value;
      });
      keep(last);
    },
    macroBenchOptions
  );

  bench(
    `circular avoidance (x${REPEATS})`,
    () => {
      let result: any;
      for (let i = 0; i < REPEATS; i++) {
        circA.value += 1;
        result = circAll.value;
      }
      keep(result);
    },
    macroBenchOptions
  );
});

describe('Dynamic Dependency Patterns', () => {
  const condAtom = atom(true);
  const condA = atom(1);
  const condB = atom(2);
  const condResult = computed(() => (condAtom.value ? condA.value : condB.value));

  const idxAtom = atom(0);
  const arrValues = Array.from({ length: 10 }, (_, i) => atom(i));
  const arrSelected = computed(() => arrValues[idxAtom.value]!.value);

  bench(
    `conditional dependencies (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        condAtom.value = !condAtom.value;
        keep(condResult.value);
        if (condAtom.value) condA.value++;
        else condB.value++;
        keep(condResult.value);
      }
    },
    microBenchOptions
  );

  bench(
    `array-based selection (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        idxAtom.value = (idxAtom.value + 1) % 10;
        keep(arrSelected.value);
        arrValues[idxAtom.value]!.value++;
        keep(arrSelected.value);
      }
    },
    microBenchOptions
  );
});

describe('Large Grid with Lenses (50x50)', () => {
  type Cell = { v: number; color: string };
  const ROWS = 50;
  const COLS = 50;

  const initialGrid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ v: 0, color: 'white' }))
  );
  const gridAtom = atom(initialGrid);
  const cellLenses = initialGrid.map((row, r) =>
    row.map((_, c) => atomLens(gridAtom, `${r}.${c}`))
  );

  bench(
    'batch update: 10 random cells',
    () => {
      for (let i = 0; i < 10; i++) {
        const r = Math.floor(Math.random() * ROWS);
        const i_col = Math.floor(Math.random() * COLS);
        cellLenses[r]![i_col]!.value = { v: Math.random(), color: 'blue' };
      }
    },
    macroBenchOptions
  );

  bench(
    `bulk update: replace full grid (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        gridAtom.value = gridAtom
          .peek()
          .map((row) => row.map((cell) => ({ v: cell.v + 1, color: 'red' })));
      }
    },
    macroBenchOptions
  );

  bench(
    `read performance: 2500 lenses (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            keep(cellLenses[r]![c]!.value);
          }
        }
      }
    },
    macroBenchOptions
  );
});

describe('Recursive Lens Depth Stress', () => {
  const DEPTH = 100;
  const source = atom({ child: null as any });
  let currentLens: any = source;
  for (let i = 0; i < DEPTH; i++) {
    // @ts-expect-error - dynamic recursive path exceeds static Path depth limits
    currentLens = atomLens(currentLens as any, 'child');
  }

  let deepestSource = source.value;
  for (let i = 0; i < DEPTH; i++) {
    deepestSource.child = { child: null };
    deepestSource = deepestSource.child;
  }
  source.value = { ...source.value };

  bench(
    `read depth ${DEPTH} lens chain (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) keep(currentLens.value);
    },
    macroBenchOptions
  );

  bench(
    `update depth ${DEPTH} lens chain`,
    () => {
      currentLens.value = { child: 'done' };
    },
    macroBenchOptions
  );
});

describe('Memory & GC pressure', () => {
  bench(
    'create and dispose 1000 units (atom/comp/effect)',
    () => {
      const a = atom(0);
      const units = [
        ...Array.from({ length: 333 }, () => atom(0)),
        ...Array.from({ length: 333 }, (_, i) => computed(() => a.value + i)),
        ...Array.from({ length: 334 }, () => effect(() => keep(a.value), benchEffectOptions)),
      ];
      units.forEach((u) => (u as any).dispose());
      a.dispose();
    },
    memoryBenchOptions
  );

  bench(
    'subscription churn (1K cycles)',
    () => {
      const a = atom(0);
      for (let i = 0; i < 1000; i++) {
        const unsub = a.subscribe(() => {});
        unsub();
      }
      a.dispose();
    },
    memoryBenchOptions
  );

  bench(
    'circular reference cleanup (100 cycles)',
    () => {
      for (let i = 0; i < 100; i++) {
        const a = atom<any>({ ref: null });
        const b = atom<any>({ ref: a });
        a.value = { ref: b };
        a.dispose();
        b.dispose();
      }
      forceGC();
    },
    memoryBenchOptions
  );
});

describe('Large State Analysis', () => {
  bench(
    '10K entity state tree management',
    () => {
      const state = atom({
        users: Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `U ${i}` })),
        posts: Array.from({ length: 5000 }, (_, i) => ({
          id: i,
          userId: i % 1000,
          content: `P ${i}`,
        })),
        comments: Array.from({ length: 4000 }, (_, i) => ({
          id: i,
          postId: i % 5000,
          text: `C ${i}`,
        })),
      });

      const counts = computed(() => ({
        u: state.value.users.length,
        p: state.value.posts.length,
        c: state.value.comments.length,
      }));

      keep(counts.value);
      state.value = { ...state.value, users: [...state.value.users, { id: 1000, name: 'New' }] };
      keep(counts.value);
      state.dispose();
    },
    memoryBenchOptions
  );

  bench(
    'heap monitoring (1000 large atoms)',
    () => {
      const before = getMemoryUsage();
      const atoms = Array.from({ length: 1000 }, (_, i) => atom(new Array(100).fill(i)));
      const during = getMemoryUsage();
      atoms.forEach((a) => a.dispose());
      forceGC();
      const after = getMemoryUsage();
      keep([before, during, after]);
    },
    memoryBenchOptions
  );
});
