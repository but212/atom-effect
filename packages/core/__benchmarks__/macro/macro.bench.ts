/**
 * @fileoverview Macro-benchmarks for atom-effect core
 * @description Combined real-world scenarios: Todo app, Data grid, Dependency graph, etc.
 */

import { bench, describe } from 'vitest';
import { atom, atomLens, computed, effect } from '../../dist';
import {
  benchEffectOptions,
  type DataGridRow,
  forceGC,
  generateGridData,
  generateTodosBySizeKey,
  getMemoryUsage,
  keep,
  macroBenchOptions,
  memoryBenchOptions,
  REPEATS,
  type TodoItem,
} from '../utils/setup.js';

// --- Domain Helpers ---
const filterTodos = (todos: TodoItem[], filter: 'all' | 'active' | 'completed') =>
  filter === 'all' ? todos : todos.filter((todo) => todo.completed === (filter === 'completed'));

const sortGridData = (rows: DataGridRow[], direction: 'asc' | 'desc') =>
  [...rows].sort((firstRow, secondRow) => {
    const comp = firstRow.name.localeCompare(secondRow.name);
    return direction === 'asc' ? comp : -comp;
  });

const initialLargeState = {
  users: Array.from({ length: 1000 }, (_, id) => ({ id, name: `U ${id}` })),
  posts: Array.from({ length: 5000 }, (_, id) => ({
    id,
    userId: id % 1000,
    content: `P ${id}`,
  })),
  comments: Array.from({ length: 4000 }, (_, id) => ({
    id,
    postId: id % 5000,
    text: `C ${id}`,
  })),
};

describe('Todo App: Comprehensive Workflow', () => {
  bench(
    '[Vanilla] full workflow: add → toggle → filter → delete → stats',
    () => {
      let vanillaTodos = Array.from({ length: 100 }, (_, index) => ({
        id: index,
        text: 'New',
        completed: false,
      }));
      let vanillaFilter: 'all' | 'active' | 'completed' = 'all';

      vanillaTodos = vanillaTodos.map((todo, index) =>
        index < 50 ? { ...todo, completed: true } : todo
      );
      vanillaFilter = 'active';
      vanillaTodos = vanillaTodos.slice(20);
      vanillaFilter = 'all';

      const filtered = filterTodos(vanillaTodos, vanillaFilter);
      const total = vanillaTodos.length;
      const completed = vanillaTodos.filter((todo) => todo.completed).length;
      const rate = total === 0 ? 0 : (completed / total) * 100;

      keep([filtered.length, rate]);
    },
    macroBenchOptions
  );

  const todosWorkflow = atom<TodoItem[]>([]);
  const filterWorkflow = atom<'all' | 'active' | 'completed'>('all');
  const filteredWorkflow = computed(() => filterTodos(todosWorkflow.value, filterWorkflow.value));

  // Principle 1: Well-designed unified data structure for statistics
  const todoStats = computed(() => {
    const todos = todosWorkflow.value;
    const total = todos.length;
    const completed = todos.filter((todo: TodoItem) => todo.completed).length;
    return {
      filteredLength: filteredWorkflow.value.length,
      rate: total === 0 ? 0 : (completed / total) * 100,
    };
  });

  let displayCount = 0;
  let rate = 0;
  effect(() => {
    displayCount = todoStats.value.filteredLength;
    rate = todoStats.value.rate;
  }, benchEffectOptions);

  bench(
    '[Atom] full workflow: add → toggle → filter → delete → stats',
    () => {
      todosWorkflow.value = Array.from({ length: 100 }, (_, index) => ({
        id: index,
        text: 'New',
        completed: false,
      }));
      todosWorkflow.value = todosWorkflow.value.map((todo: TodoItem, index: number) =>
        index < 50 ? { ...todo, completed: true } : todo
      );
      filterWorkflow.value = 'active';
      todosWorkflow.value = todosWorkflow.value.slice(20);
      filterWorkflow.value = 'all';
      keep([displayCount, rate]);
    },
    macroBenchOptions
  );
});

describe('Todo App: Input Size Tiers', () => {
  for (const size of ['small', 'medium', 'large'] as const) {
    const data = generateTodosBySizeKey(size);
    const todosAtom = atom<TodoItem[]>(data);
    const filterAtom = atom<'all' | 'active' | 'completed'>('all');
    const filtered = computed(() => filterTodos(todosAtom.value, filterAtom.value));
    let count = 0;
    effect(() => {
      count = filtered.value.length;
    }, benchEffectOptions);

    bench(
      `[Atom] toggle filter (${size}: ${data.length} items)`,
      () => {
        filterAtom.value = filterAtom.value === 'all' ? 'active' : 'all';
        keep(count);
      },
      macroBenchOptions
    );

    let vanillaFilter: 'all' | 'active' | 'completed' = 'all';
    bench(
      `[Vanilla] toggle filter (${size}: ${data.length} items)`,
      () => {
        vanillaFilter = vanillaFilter === 'all' ? 'active' : 'all';
        const filteredResult = filterTodos(data, vanillaFilter);
        keep(filteredResult.length);
      },
      macroBenchOptions
    );
  }
});

describe('Data Grid: Core Operations (1000 Rows)', () => {
  const data = generateGridData(1000);
  const rows = atom(data); // Principle 1 & 3: Unified state to avoid redundant atom creations

  let sortDir: 'asc' | 'desc' = 'asc';
  bench(
    '[Vanilla] toggle sort',
    () => {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      keep(sortGridData(data, sortDir)[0]);
    },
    macroBenchOptions
  );

  const sortDirAtom = atom<'asc' | 'desc'>('asc');
  const sortedRows = computed(() => sortGridData(rows.value, sortDirAtom.value));

  bench(
    '[Atom] toggle sort',
    () => {
      sortDirAtom.value = sortDirAtom.value === 'asc' ? 'desc' : 'asc';
      keep(sortedRows.value[0]); // Principle 2: Details - consistent with vanilla [0] return value
    },
    macroBenchOptions
  );

  let selectedDepartment = 'Engineering';
  bench(
    '[Vanilla] switch filter',
    () => {
      selectedDepartment = selectedDepartment === 'Engineering' ? 'Sales' : 'Engineering';
      keep(data.filter((row) => row.department === selectedDepartment)[0]);
    },
    macroBenchOptions
  );

  const departmentFilter = atom<string>('Engineering');
  const filteredRows = computed(() =>
    rows.value.filter((row: DataGridRow) => row.department === departmentFilter.value)
  );

  bench(
    '[Atom] switch filter',
    () => {
      departmentFilter.value = departmentFilter.value === 'Engineering' ? 'Sales' : 'Engineering';
      keep(filteredRows.value[0]); // Principle 2: Details - consistent [0] return value
    },
    macroBenchOptions
  );

  let sortDirP: 'asc' | 'desc' = 'asc';
  bench(
    '[Vanilla] sort + filter + paginate',
    () => {
      sortDirP = sortDirP === 'asc' ? 'desc' : 'asc';
      const paginated = sortGridData(data, sortDirP)
        .filter((row) => row.department === 'Engineering')
        .slice(0, 20);
      keep(paginated[0]);
    },
    macroBenchOptions
  );

  const sortDirComplex = atom<'asc' | 'desc'>('asc');
  const paginatedRowsComplex = computed(() =>
    sortGridData(rows.value, sortDirComplex.value)
      .filter((row) => row.department === 'Engineering')
      .slice(0, 20)
  );

  bench(
    '[Atom] sort + filter + paginate',
    () => {
      sortDirComplex.value = sortDirComplex.value === 'asc' ? 'desc' : 'asc';
      keep(paginatedRowsComplex.value[0]); // Principle 2: Details - consistent [0] return value
    },
    macroBenchOptions
  );
});

describe('Data Grid: Targeted Updates', () => {
  const ROW_COUNT = 1000;
  const data = generateGridData(ROW_COUNT);
  const rowsAtom = atom<DataGridRow[]>(data);
  const targetIdx = Math.floor(ROW_COUNT / 2);
  const nameLens = atomLens(rowsAtom, `${targetIdx}.name`);

  bench(
    `[Manual] update single cell (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        const nextRows = [...rowsAtom.peek()];
        const targetRow = nextRows[targetIdx];
        if (targetRow) {
          nextRows[targetIdx] = { ...targetRow, name: `Updated ${i}` };
        }
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
    const previousComputed = chainSink;
    chainSink = computed(() => previousComputed.value + 1);
  }

  const diamondSource = atom(1);
  const diamondLevel1 = Array.from({ length: 10 }, (_, index) =>
    computed(() => diamondSource.value * (index + 1))
  );
  const diamondLevel2 = diamondLevel1.map((previousComputed) =>
    computed(() => previousComputed.value * 2)
  );
  const diamondSink = computed(() =>
    diamondLevel2.reduce((sum, computedNode) => sum + computedNode.value, 0)
  );

  const pyramidBase = Array.from({ length: 50 }, (_, index) => atom(index));
  let currentLevel = pyramidBase.map((someAtom) => computed(() => someAtom.value));
  while (currentLevel.length > 1) {
    const nextLevel: typeof currentLevel = [];
    for (let i = 0; i < currentLevel.length - 1; i++) {
      const left = currentLevel[i];
      const right = currentLevel[i + 1];
      if (left && right) {
        nextLevel.push(computed(() => left.value + right.value));
      }
    }
    currentLevel = nextLevel;
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
      const first = pyramidBase[0];
      if (first) first.value += 1;
      if (pyramidApex) keep(pyramidApex.value);
    },
    macroBenchOptions
  );
});

describe('Complex Graph Architecture', () => {
  const mixedAtoms = Array.from({ length: 100 }, (_, i) => atom(i));
  const mixedComputeds = Array.from({ length: 200 }, (_, i) => {
    const left = mixedAtoms[i % mixedAtoms.length];
    const right = mixedAtoms[(i + 1) % mixedAtoms.length];
    return computed(() => (left?.value ?? 0) + (right?.value ?? 0));
  });

  const [circularAtomA, circularAtomB, circularAtomC] = [atom(1), atom(2), atom(3)];
  const circularComputedAB = computed(() => circularAtomA.value + circularAtomB.value);
  const circularComputedBC = computed(() => circularAtomB.value + circularAtomC.value);
  const circularComputedCA = computed(() => circularAtomC.value + circularAtomA.value);
  const circularComputedAll = computed(
    () => circularComputedAB.value + circularComputedBC.value + circularComputedCA.value
  );

  bench(
    'mixed dependencies (100 atoms → 200 computeds)',
    () => {
      const first = mixedAtoms[0];
      if (first) first.value += 1;
      let last: any;
      for (const computedInstance of mixedComputeds) {
        last = computedInstance.value;
      }
      keep(last);
    },
    macroBenchOptions
  );

  bench(
    `circular avoidance (x${REPEATS})`,
    () => {
      let result: any;
      for (let i = 0; i < REPEATS; i++) {
        circularAtomA.value += 1;
        result = circularComputedAll.value;
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
  const arrSelected = computed(() => arrValues[idxAtom.value]?.value);

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
    macroBenchOptions
  );

  bench(
    `array-based selection (x${REPEATS})`,
    () => {
      for (let i = 0; i < REPEATS; i++) {
        idxAtom.value = (idxAtom.value + 1) % 10;
        keep(arrSelected.value);
        const valAtom = arrValues[idxAtom.value];
        if (valAtom) {
          valAtom.value++;
        }
        keep(arrSelected.value);
      }
    },
    macroBenchOptions
  );
});

describe('Large Grid with Lenses (50x50)', () => {
  type Cell = { value: number; color: string };
  const ROWS = 50;
  const COLS = 50;

  const initialGrid: Cell[][] = Array.from({ length: ROWS }, () =>
    Array.from({ length: COLS }, () => ({ value: 0, color: 'white' }))
  );
  const gridAtom = atom(initialGrid);
  const cellLenses = initialGrid.map((row, r) =>
    row.map((_, c) => atomLens(gridAtom, `${r}.${c}`))
  );

  const randomUpdates = Array.from({ length: 10 }, () => ({
    r: Math.floor(Math.random() * ROWS),
    c: Math.floor(Math.random() * COLS),
    value: Math.random(),
  }));

  bench(
    'batch update: 10 random cells',
    () => {
      for (const update of randomUpdates) {
        const cell = cellLenses[update.r]?.[update.c];
        if (cell) {
          cell.value = { value: Math.random(), color: 'blue' };
        }
      }
    },
    macroBenchOptions
  );

  bench(
    `bulk update: replace full grid`,
    () => {
      gridAtom.value = gridAtom
        .peek()
        .map((row: Cell[]) => row.map((cell: Cell) => ({ value: cell.value + 1, color: 'red' })));
    },
    macroBenchOptions
  );

  bench(
    `read performance: 2500 lenses`,
    () => {
      for (let r = 0; r < ROWS; r++) {
        const row = cellLenses[r];
        if (row) {
          for (let c = 0; c < COLS; c++) {
            keep(row[c]?.value);
          }
        }
      }
    },
    macroBenchOptions
  );
});

describe('Recursive Lens Depth Stress', () => {
  const DEPTH = 100;
  type StressTarget = { child: any };

  const source = atom({ child: null } as StressTarget);
  let currentLens = atomLens(source, 'child');

  for (let i = 1; i < DEPTH; i++) {
    currentLens = atomLens(currentLens, 'child');
  }

  const root: StressTarget = { child: null };
  let current = root;
  for (let i = 0; i < DEPTH; i++) {
    current = current.child = { child: null };
  }
  source.value = root;

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
      const someAtom = atom(0);
      const units: { dispose(): void }[] = [];
      for (let i = 0; i < 1000; i++) {
        if (i < 333) {
          units.push(atom(0));
        } else if (i < 666) {
          units.push(computed(() => someAtom.value + i));
        } else {
          units.push(effect(() => keep(someAtom.value), benchEffectOptions));
        }
      }
      for (const unit of units) {
        unit.dispose();
      }
      someAtom.dispose();
    },
    memoryBenchOptions
  );

  bench(
    'subscription churn (1K cycles)',
    () => {
      const someAtom = atom(0);
      for (let i = 0; i < 1000; i++) {
        const unsubscribeCallback = someAtom.subscribe(() => {});
        unsubscribeCallback();
      }
      someAtom.dispose();
    },
    memoryBenchOptions
  );

  bench(
    'circular reference cleanup (100 cycles)',
    () => {
      for (let i = 0; i < 100; i++) {
        const firstAtom = atom<any>({ ref: null });
        const secondAtom = atom<any>({ ref: firstAtom });
        firstAtom.value = { ref: secondAtom };
        firstAtom.dispose();
        secondAtom.dispose();
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
      const state = atom(initialLargeState);

      const counts = computed(() => ({
        usersCount: state.value.users.length,
        postsCount: state.value.posts.length,
        commentsCount: state.value.comments.length,
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
      const atoms = Array.from({ length: 1000 }, (_, i) => atom(new Array<number>(100).fill(i)));
      const during = getMemoryUsage();
      for (const someAtom of atoms) {
        someAtom.dispose();
      }
      forceGC();
      const after = getMemoryUsage();
      keep([before, during, after]);
    },
    memoryBenchOptions
  );
});
