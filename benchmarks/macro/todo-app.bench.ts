/**
 * @fileoverview todo app simulation benchmark
 */

import { runBenchmark } from '../utils/benchmark-runner';
import { atom, batch, computed } from '../utils/import-lib';
import { MemoryTracker } from '../utils/memory-tracker';

interface Todo {
  id: number;
  text: string;
  completed: boolean;
}

type Filter = 'all' | 'active' | 'completed';

/**
 * create todo app
 */
function createTodoApp(todoCount: number) {
  // state
  const todos = atom<Todo[]>(
    Array.from({ length: todoCount }, (_, i) => ({
      id: i,
      text: `Todo ${i}`,
      completed: i % 3 === 0,
    }))
  );

  const filter = atom<Filter>('all');
  const searchQuery = atom('');

  // Computed 값들
  const filteredTodos = computed(() => {
    const allTodos = todos.value;
    const currentFilter = filter.value;

    if (currentFilter === 'all') return allTodos;
    if (currentFilter === 'active') return allTodos.filter((t: Todo) => !t.completed);
    return allTodos.filter((t: Todo) => t.completed);
  });

  const searchedTodos = computed(() => {
    const filtered = filteredTodos.value;
    const query = searchQuery.value.toLowerCase();

    if (!query) return filtered;
    return filtered.filter((t: Todo) => t.text.toLowerCase().includes(query));
  });

  const totalCount = computed(() => todos.value.length);
  const activeCount = computed(() => todos.value.filter((t: Todo) => !t.completed).length);
  const completedCount = computed(() => todos.value.filter((t: Todo) => t.completed).length);
  const progress = computed(() => {
    const total = totalCount.value;
    if (total === 0) return 0;
    return (completedCount.value / total) * 100;
  });

  // actions
  const addTodo = (text: string) => {
    todos.value = [
      ...todos.value,
      {
        id: Date.now(),
        text,
        completed: false,
      },
    ];
  };

  const toggleTodo = (id: number) => {
    todos.value = todos.value.map((t: Todo) => (t.id === id ? { ...t, completed: !t.completed } : t));
  };

  const toggleAll = () => {
    const hasActive = activeCount.value > 0;
    todos.value = todos.value.map((t: Todo) => ({ ...t, completed: hasActive }));
  };

  const deleteTodo = (id: number) => {
    todos.value = todos.value.filter((t: Todo) => t.id !== id);
  };

  const clearCompleted = () => {
    todos.value = todos.value.filter((t: Todo) => !t.completed);
  };

  return {
    // state
    todos,
    filter,
    searchQuery,
    // computed
    filteredTodos,
    searchedTodos,
    totalCount,
    activeCount,
    completedCount,
    progress,
    // actions
    addTodo,
    toggleTodo,
    toggleAll,
    deleteTodo,
    clearCompleted,
  };
}

function disposeTodoApp(app: ReturnType<typeof createTodoApp>): void {
  app.progress.dispose();
  app.completedCount.dispose();
  app.activeCount.dispose();
  app.totalCount.dispose();
  app.searchedTodos.dispose();
  app.filteredTodos.dispose();
}

export async function runTodoAppBenchmark() {
  const tracker = new MemoryTracker();

  tracker.snapshot();

  const results = await runBenchmark(
    'Todo App Simulation',
    {
      'create todo app (100 todos)': () => {
        const app = createTodoApp(100);
        disposeTodoApp(app);
      },

      'create todo app (1000 todos)': () => {
        const app = createTodoApp(1000);
        disposeTodoApp(app);
      },

      'filter todos (all -> active -> completed)': () => {
        const app = createTodoApp(1000);
        app.filteredTodos.value;
        app.filter.value = 'active';
        app.filteredTodos.value;
        app.filter.value = 'completed';
        app.filteredTodos.value;
        disposeTodoApp(app);
      },

      'search todos': () => {
        const app = createTodoApp(1000);
        app.searchQuery.value = 'Todo 1';
        app.searchedTodos.value;
        app.searchQuery.value = 'Todo 5';
        app.searchedTodos.value;
        disposeTodoApp(app);
      },

      'toggle single todo': () => {
        const app = createTodoApp(1000);
        app.toggleTodo(0);
        app.filteredTodos.value;
        disposeTodoApp(app);
      },

      'toggle 100 todos (one by one)': () => {
        const app = createTodoApp(1000);
        for (let i = 0; i < 100; i++) {
          app.toggleTodo(i);
        }
        app.filteredTodos.value;
        disposeTodoApp(app);
      },

      'toggle 100 todos (batched)': () => {
        const app = createTodoApp(1000);
        batch(() => {
          for (let i = 0; i < 100; i++) {
            app.toggleTodo(i);
          }
        });
        app.filteredTodos.value;
        disposeTodoApp(app);
      },

      'toggle all todos': () => {
        const app = createTodoApp(1000);
        app.toggleAll();
        app.progress.value;
        disposeTodoApp(app);
      },

      'add 10 todos': () => {
        const app = createTodoApp(100);
        for (let i = 0; i < 10; i++) {
          app.addTodo(`New todo ${i}`);
        }
        app.totalCount.value;
        disposeTodoApp(app);
      },

      'add 10 todos (batched)': () => {
        const app = createTodoApp(100);
        batch(() => {
          for (let i = 0; i < 10; i++) {
            app.addTodo(`New todo ${i}`);
          }
        });
        app.totalCount.value;
        disposeTodoApp(app);
      },

      'delete 100 todos': () => {
        const app = createTodoApp(1000);
        for (let i = 0; i < 100; i++) {
          app.deleteTodo(i);
        }
        app.totalCount.value;
        disposeTodoApp(app);
      },

      'clear completed': () => {
        const app = createTodoApp(1000);
        app.clearCompleted();
        app.totalCount.value;
        disposeTodoApp(app);
      },

      'complex workflow': () => {
        const app = createTodoApp(500);

        // filtering
        app.filter.value = 'active';
        app.filteredTodos.value;

        // search
        app.searchQuery.value = 'Todo 1';
        app.searchedTodos.value;

        // toggle
        batch(() => {
          for (let i = 0; i < 50; i++) {
            app.toggleTodo(i);
          }
        });

        // progress
        app.progress.value;

        // clear completed
        app.clearCompleted();
        app.totalCount.value;

        disposeTodoApp(app);
      },
    },
    { time: 20, iterations: 10, maxSamples: 2000 }
  );

  tracker.snapshot();
  const memoryDiff = tracker.lastDiff();
  if (memoryDiff) {
    tracker.printDiff(memoryDiff);
  }

  return { results, memory: memoryDiff };
}

// directly run benchmark
// if (import.meta.url === `file://${process.argv[1]}`) {
//   runTodoAppBenchmark().catch(console.error);
// }
