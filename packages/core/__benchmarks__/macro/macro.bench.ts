/**
 * @fileoverview Macro-benchmarks for atom-effect core
 * @description Combined real-world scenarios: Todo app, Data grid, Dependency graph, etc.
 */

import { describe, test } from 'vitest';
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

const repeats = REPEATS;
const _keep = keep;
const _atom = atom;
const _computed = computed;
const _effect = effect;
const _atomLens = atomLens;
const _benchEffectOptions = benchEffectOptions;

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
  test('workflow comparison', async ({ bench }) => {
    let displayCount = 0;
    let rate = 0;
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

    const stopEffect = effect(() => {
      displayCount = todoStats.value.filteredLength;
      rate = todoStats.value.rate;
    }, benchEffectOptions);

    try {
      await bench.compare(
        bench('[Vanilla] full workflow: add → toggle → filter → delete → stats', () => {
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
          const calculatedRate = total === 0 ? 0 : (completed / total) * 100;

          _keep([filtered.length, calculatedRate]);
        }),
        bench('[Atom] full workflow: add → toggle → filter → delete → stats', () => {
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
          _keep([displayCount, rate]);
        }),
        macroBenchOptions
      );
    } finally {
      stopEffect.dispose();
    }
  });
});

describe('Todo App: Input Size Tiers', () => {
  for (const size of ['small', 'medium', 'large'] as const) {
    test(`toggle filter ${size}`, async ({ bench }) => {
      const data = generateTodosBySizeKey(size);
      const todosAtom = atom<TodoItem[]>(data);
      const filterAtom = atom<'all' | 'active' | 'completed'>('all');
      const filtered = computed(() => filterTodos(todosAtom.value, filterAtom.value));
      let count = 0;
      const stopEffect = effect(() => {
        count = filtered.value.length;
      }, benchEffectOptions);

      let vanillaFilter: 'all' | 'active' | 'completed' = 'all';

      try {
        await bench.compare(
          bench(`[Atom] toggle filter (${size}: ${data.length} items)`, () => {
            filterAtom.value = filterAtom.value === 'all' ? 'active' : 'all';
            _keep(count);
          }),
          bench(`[Vanilla] toggle filter (${size}: ${data.length} items)`, () => {
            vanillaFilter = vanillaFilter === 'all' ? 'active' : 'all';
            const filteredResult = filterTodos(data, vanillaFilter);
            _keep(filteredResult.length);
          }),
          macroBenchOptions
        );
      } finally {
        stopEffect.dispose();
      }
    });
  }
});

describe('Data Grid: Core Operations (1000 Rows)', () => {
  const data = generateGridData(1000);
  const rows = atom(data); // Principle 1 & 3: Unified state to avoid redundant atom creations

  test('toggle sort comparison', async ({ bench }) => {
    let sortDir: 'asc' | 'desc' = 'asc';
    const sortDirAtom = atom<'asc' | 'desc'>('asc');
    const sortedRows = computed(() => sortGridData(rows.value, sortDirAtom.value));

    await bench.compare(
      bench('[Vanilla] toggle sort', () => {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        _keep(sortGridData(data, sortDir)[0]);
      }),
      bench('[Atom] toggle sort', () => {
        sortDirAtom.value = sortDirAtom.value === 'asc' ? 'desc' : 'asc';
        _keep(sortedRows.value[0]); // Principle 2: Details - consistent with vanilla [0] return value
      }),
      macroBenchOptions
    );
  });

  test('switch filter comparison', async ({ bench }) => {
    let selectedDepartment = 'Engineering';
    const departmentFilter = atom<string>('Engineering');
    const filteredRows = computed(() =>
      rows.value.filter((row: DataGridRow) => row.department === departmentFilter.value)
    );

    await bench.compare(
      bench('[Vanilla] switch filter', () => {
        selectedDepartment = selectedDepartment === 'Engineering' ? 'Sales' : 'Engineering';
        _keep(data.filter((row) => row.department === selectedDepartment)[0]);
      }),
      bench('[Atom] switch filter', () => {
        departmentFilter.value = departmentFilter.value === 'Engineering' ? 'Sales' : 'Engineering';
        _keep(filteredRows.value[0]); // Principle 2: Details - consistent [0] return value
      }),
      macroBenchOptions
    );
  });

  test('sort + filter + paginate comparison', async ({ bench }) => {
    let sortDirP: 'asc' | 'desc' = 'asc';
    const sortDirComplex = atom<'asc' | 'desc'>('asc');
    const paginatedRowsComplex = computed(() =>
      sortGridData(rows.value, sortDirComplex.value)
        .filter((row) => row.department === 'Engineering')
        .slice(0, 20)
    );

    await bench.compare(
      bench('[Vanilla] sort + filter + paginate', () => {
        sortDirP = sortDirP === 'asc' ? 'desc' : 'asc';
        const paginated = sortGridData(data, sortDirP)
          .filter((row) => row.department === 'Engineering')
          .slice(0, 20);
        _keep(paginated[0]);
      }),
      bench('[Atom] sort + filter + paginate', () => {
        sortDirComplex.value = sortDirComplex.value === 'asc' ? 'desc' : 'asc';
        _keep(paginatedRowsComplex.value[0]); // Principle 2: Details - consistent [0] return value
      }),
      macroBenchOptions
    );
  });
});

describe('Data Grid: Targeted Updates', () => {
  const ROW_COUNT = 1000;
  const data = generateGridData(ROW_COUNT);
  const rowsAtom = atom<DataGridRow[]>(data);
  const targetIdx = Math.floor(ROW_COUNT / 2);
  const nameLens = atomLens(rowsAtom, `${targetIdx}.name`);

  test('single cell update comparison', async ({ bench }) => {
    await bench.compare(
      bench(`[Manual] update single cell (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          const nextRows = [...rowsAtom.peek()];
          const targetRow = nextRows[targetIdx];
          if (targetRow) {
            nextRows[targetIdx] = { ...targetRow, name: `Updated ${i}` };
          }
          rowsAtom.value = nextRows;
        }
      }),
      bench(`[Lens] update single cell (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          nameLens.value = `Updated ${i}`;
        }
      }),
      macroBenchOptions
    );
  });

  test('select/deselect rows', async ({ bench }) => {
    await bench('select/deselect rows (Set-based)', () => {
      const selectedIds = _atom<Set<number>>(new Set());
      const selectedCount = _computed(() => selectedIds.value.size);

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
      _keep(selectedCount.value);
    }).run(macroBenchOptions);
  });
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

  test('dependency graph patterns comparison', async ({ bench }) => {
    await bench.compare(
      bench('deep chain (100 levels)', () => {
        chainSource.value += 1;
        _keep(chainSink.value);
      }),
      bench('diamond pattern (1 → 10 → 10 → 1)', () => {
        diamondSource.value += 1;
        _keep(diamondSink.value);
      }),
      bench('pyramid pattern (50 levels)', () => {
        const first = pyramidBase[0];
        if (first) first.value += 1;
        if (pyramidApex) _keep(pyramidApex.value);
      }),
      macroBenchOptions
    );
  });
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

  test('complex graph patterns comparison', async ({ bench }) => {
    await bench.compare(
      bench('mixed dependencies (100 atoms → 200 computeds)', () => {
        const first = mixedAtoms[0];
        if (first) first.value += 1;
        let last: any;
        for (const computedInstance of mixedComputeds) {
          last = computedInstance.value;
        }
        _keep(last);
      }),
      bench(`circular avoidance (x${repeats})`, () => {
        let result: any;
        for (let i = 0; i < repeats; i++) {
          circularAtomA.value += 1;
          result = circularComputedAll.value;
        }
        _keep(result);
      }),
      macroBenchOptions
    );
  });
});

describe('Dynamic Dependency Patterns', () => {
  const condAtom = atom(true);
  const condA = atom(1);
  const condB = atom(2);
  const condResult = computed(() => (condAtom.value ? condA.value : condB.value));

  const idxAtom = atom(0);
  const arrValues = Array.from({ length: 10 }, (_, i) => atom(i));
  const arrSelected = computed(() => arrValues[idxAtom.value]?.value);

  test('dynamic dependency comparison', async ({ bench }) => {
    await bench.compare(
      bench(`conditional dependencies (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          condAtom.value = !condAtom.value;
          _keep(condResult.value);
          if (condAtom.value) condA.value++;
          else condB.value++;
          _keep(condResult.value);
        }
      }),
      bench(`array-based selection (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) {
          idxAtom.value = (idxAtom.value + 1) % 10;
          _keep(arrSelected.value);
          const valAtom = arrValues[idxAtom.value];
          if (valAtom) {
            valAtom.value++;
          }
          _keep(arrSelected.value);
        }
      }),
      macroBenchOptions
    );
  });
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

  test('grid lens operations comparison', async ({ bench }) => {
    await bench.compare(
      bench('batch update: 10 random cells', () => {
        for (const update of randomUpdates) {
          const cell = cellLenses[update.r]?.[update.c];
          if (cell) {
            cell.value = { value: Math.random(), color: 'blue' };
          }
        }
      }),
      bench('bulk update: replace full grid', () => {
        gridAtom.value = gridAtom
          .peek()
          .map((row: Cell[]) => row.map((cell: Cell) => ({ value: cell.value + 1, color: 'red' })));
      }),
      bench('read performance: 2500 lenses', () => {
        for (let r = 0; r < ROWS; r++) {
          const row = cellLenses[r];
          if (row) {
            for (let c = 0; c < COLS; c++) {
              _keep(row[c]?.value);
            }
          }
        }
      }),
      macroBenchOptions
    );
  });
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

  test('lens depth comparison', async ({ bench }) => {
    await bench.compare(
      bench(`read depth ${DEPTH} lens chain (x${repeats})`, () => {
        for (let i = 0; i < repeats; i++) _keep(currentLens.value);
      }),
      bench(`update depth ${DEPTH} lens chain`, () => {
        currentLens.value = { child: 'done' };
      }),
      macroBenchOptions
    );
  });
});

describe('Memory & GC pressure', () => {
  test('memory and GC comparison', async ({ bench }) => {
    await bench.compare(
      bench('create and dispose 1000 units (atom/comp/effect)', () => {
        const someAtom = _atom(0);
        const units: { dispose(): void }[] = [];
        for (let i = 0; i < 1000; i++) {
          if (i < 333) {
            units.push(_atom(0));
          } else if (i < 666) {
            units.push(_computed(() => someAtom.value + i));
          } else {
            units.push(_effect(() => _keep(someAtom.value), _benchEffectOptions));
          }
        }
        for (const unit of units) {
          unit.dispose();
        }
        someAtom.dispose();
      }),
      bench('subscription churn (1K cycles)', () => {
        const someAtom = _atom(0);
        for (let i = 0; i < 1000; i++) {
          const unsubscribeCallback = someAtom.subscribe(() => {});
          unsubscribeCallback();
        }
        someAtom.dispose();
      }),
      bench('circular reference cleanup (100 cycles)', () => {
        for (let i = 0; i < 100; i++) {
          const firstAtom = _atom<any>({ ref: null });
          const secondAtom = _atom<any>({ ref: firstAtom });
          firstAtom.value = { ref: secondAtom };
          firstAtom.dispose();
          secondAtom.dispose();
        }
        forceGC();
      }),
      memoryBenchOptions
    );
  });
});

describe('Large State Analysis', () => {
  test('large state comparison', async ({ bench }) => {
    await bench.compare(
      bench('10K entity state tree management', () => {
        const state = _atom(initialLargeState);

        const counts = _computed(() => ({
          usersCount: state.value.users.length,
          postsCount: state.value.posts.length,
          commentsCount: state.value.comments.length,
        }));

        _keep(counts.value);
        state.value = { ...state.value, users: [...state.value.users, { id: 1000, name: 'New' }] };
        _keep(counts.value);
        state.dispose();
      }),
      bench('heap monitoring (1000 large atoms)', () => {
        const before = getMemoryUsage();
        const atoms = Array.from({ length: 1000 }, (_, i) => _atom(new Array<number>(100).fill(i)));
        const during = getMemoryUsage();
        for (const someAtom of atoms) {
          someAtom.dispose();
        }
        forceGC();
        const after = getMemoryUsage();
        _keep([before, during, after]);
      }),
      memoryBenchOptions
    );
  });
});
