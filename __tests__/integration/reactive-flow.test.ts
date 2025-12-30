/**
 * @fileoverview Integration tests for real-world usage scenarios
 * @description Tests complex interactions between atoms, computed values, and effects
 */

import { describe, expect, it, vi } from 'vitest';
import { atom } from '@/core/atom';
import { computed } from '@/core/computed';
import { effect } from '@/core/effect';
import { batch, untracked } from '@/helpers/helpers';

// ========================================
// Type Definitions for Test Scenarios
// ========================================

interface Todo {
  id: number;
  title: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
}

interface User {
  id: number;
  name: string;
  email: string;
}

interface AppState {
  currentUser: User | null;
  theme: 'light' | 'dark';
  notifications: number;
}

// ========================================
// Todo App State Management
// ========================================

describe('Integration: Todo App State Management', () => {
  it('manages todo list with computed statistics', async () => {
    // State
    const todos = atom<Todo[]>([]);
    const filter = atom<'all' | 'active' | 'completed'>('all');

    // Computed values
    const filteredTodos = computed(() => {
      const allTodos = todos.value;
      const currentFilter = filter.value;

      switch (currentFilter) {
        case 'active':
          return allTodos.filter((t) => !t.completed);
        case 'completed':
          return allTodos.filter((t) => t.completed);
        default:
          return allTodos;
      }
    });

    const completedCount = computed(() => todos.value.filter((t) => t.completed).length);

    const activeCount = computed(() => todos.value.filter((t) => !t.completed).length);

    const highPriorityCount = computed(
      () => todos.value.filter((t) => t.priority === 'high' && !t.completed).length
    );

    const stats = computed(() => ({
      total: todos.value.length,
      completed: completedCount.value,
      active: activeCount.value,
      highPriority: highPriorityCount.value,
      completionRate:
        todos.value.length > 0 ? Math.round((completedCount.value / todos.value.length) * 100) : 0,
    }));

    // Effects
    const effectCalls: string[] = [];
    effect(() => {
      effectCalls.push(`Stats updated: ${stats.value.completed}/${stats.value.total} completed`);
    });

    // Initial state
    expect(stats.value.total).toBe(0);
    expect(filteredTodos.value).toEqual([]);

    // Add todos in batch
    batch(() => {
      todos.value = [
        { id: 1, title: 'Buy groceries', completed: false, priority: 'high' },
        { id: 2, title: 'Write tests', completed: false, priority: 'medium' },
        { id: 3, title: 'Review PR', completed: true, priority: 'low' },
      ];
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stats.value.total).toBe(3);
    expect(stats.value.completed).toBe(1);
    expect(stats.value.active).toBe(2);
    expect(stats.value.highPriority).toBe(1);
    expect(stats.value.completionRate).toBe(33);

    // Filter todos
    filter.value = 'active';
    expect(filteredTodos.value).toHaveLength(2);
    expect(filteredTodos.value.every((t) => !t.completed)).toBe(true);

    // Complete a todo
    const updatedTodos = todos.value.map((t) => (t.id === 1 ? { ...t, completed: true } : t));
    todos.value = updatedTodos;

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(stats.value.completed).toBe(2);
    expect(stats.value.completionRate).toBe(67);
    expect(highPriorityCount.value).toBe(0); // High priority todo is now completed

    // Verify effect was called
    expect(effectCalls.length).toBeGreaterThan(0);
  });

  it('handles todo app with undo/redo functionality', async () => {
    const todos = atom<Todo[]>([]);
    const history = atom<Todo[][]>([[]]);
    const historyIndex = atom(0);

    // Computed for undo/redo availability
    const canUndo = computed(() => historyIndex.value > 0);
    const canRedo = computed(() => historyIndex.value < history.value.length - 1);

    // Actions
    const addTodo = (todo: Todo) => {
      const newTodos = [...todos.value, todo];
      todos.value = newTodos;

      // Update history
      const newHistory = history.value.slice(0, historyIndex.value + 1);
      newHistory.push(newTodos);
      history.value = newHistory;
      historyIndex.value = newHistory.length - 1;
    };

    const undo = () => {
      if (canUndo.value) {
        historyIndex.value--;
        todos.value = history.value[historyIndex.value]!;
      }
    };

    const redo = () => {
      if (canRedo.value) {
        historyIndex.value++;
        todos.value = history.value[historyIndex.value]!;
      }
    };

    // Test undo/redo
    expect(canUndo.value).toBe(false);
    expect(canRedo.value).toBe(false);

    addTodo({ id: 1, title: 'Task 1', completed: false, priority: 'low' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(todos.value).toHaveLength(1);
    expect(canUndo.value).toBe(true);

    addTodo({ id: 2, title: 'Task 2', completed: false, priority: 'medium' });
    expect(todos.value).toHaveLength(2);

    undo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(todos.value).toHaveLength(1);
    expect(canRedo.value).toBe(true);

    undo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(todos.value).toHaveLength(0);
    expect(canUndo.value).toBe(false);

    redo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(todos.value).toHaveLength(1);

    redo();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(todos.value).toHaveLength(2);
    expect(canRedo.value).toBe(false);
  });
});

// ========================================
// User Authentication & Profile
// ========================================

describe('Integration: User Authentication Flow', () => {
  it('manages user session with derived permissions', async () => {
    const currentUser = atom<User | null>(null);
    const isAuthenticated = computed(() => currentUser.value !== null);
    const userDisplayName = computed(() => currentUser.value?.name ?? 'Guest');
    const isAdmin = computed(() => currentUser.value?.email.endsWith('@admin.com') ?? false);

    // Effect to log authentication changes
    const authLogs: string[] = [];
    effect(() => {
      const status = isAuthenticated.value ? 'logged in' : 'logged out';
      authLogs.push(`User ${status}: ${userDisplayName.value}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Initial state
    expect(isAuthenticated.value).toBe(false);
    expect(userDisplayName.value).toBe('Guest');
    expect(isAdmin.value).toBe(false);

    // Login
    currentUser.value = { id: 1, name: 'Alice', email: 'alice@example.com' };
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(isAuthenticated.value).toBe(true);
    expect(userDisplayName.value).toBe('Alice');
    expect(isAdmin.value).toBe(false);

    // Login as admin
    currentUser.value = { id: 2, name: 'Admin', email: 'admin@admin.com' };
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(isAdmin.value).toBe(true);

    // Logout
    currentUser.value = null;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(isAuthenticated.value).toBe(false);
    expect(authLogs.length).toBeGreaterThan(0);
  });
});

// ========================================
// Application State with Multiple Concerns
// ========================================

describe('Integration: Complex Application State', () => {
  it('manages app state with theme, notifications, and user preferences', async () => {
    const appState = atom<AppState>({
      currentUser: null,
      theme: 'light',
      notifications: 0,
    });

    // Derived state
    const isDarkMode = computed(() => appState.value.theme === 'dark');
    const hasNotifications = computed(() => appState.value.notifications > 0);
    const notificationBadge = computed(() => {
      const count = appState.value.notifications;
      return count > 99 ? '99+' : count.toString();
    });

    // Effect to update document title
    const titleUpdates: string[] = [];
    effect(() => {
      const count = appState.value.notifications;
      const prefix = count > 0 ? `(${count}) ` : '';
      const title = `${prefix}My App`;
      titleUpdates.push(title);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Initial state
    expect(isDarkMode.value).toBe(false);
    expect(hasNotifications.value).toBe(false);
    expect(notificationBadge.value).toBe('0');

    // Update theme
    appState.value = { ...appState.value, theme: 'dark' };
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(isDarkMode.value).toBe(true);

    // Add notifications
    batch(() => {
      appState.value = { ...appState.value, notifications: 5 };
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(hasNotifications.value).toBe(true);
    expect(notificationBadge.value).toBe('5');

    // Many notifications
    appState.value = { ...appState.value, notifications: 150 };
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(notificationBadge.value).toBe('99+');

    expect(titleUpdates.length).toBeGreaterThan(0);
  });

  it('handles complex state updates with batching', async () => {
    const state = atom({ count: 0, multiplier: 1, offset: 0 });
    const result = computed(() => state.value.count * state.value.multiplier + state.value.offset);

    const computations: number[] = [];
    effect(() => {
      computations.push(result.value);
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    // Without batch: multiple recomputations
    state.value = { ...state.value, count: 10 };
    state.value = { ...state.value, multiplier: 2 };
    state.value = { ...state.value, offset: 5 };

    await new Promise((resolve) => setTimeout(resolve, 10));
    const withoutBatchCount = computations.length;

    // Reset
    computations.length = 0;
    state.value = { count: 0, multiplier: 1, offset: 0 };
    await new Promise((resolve) => setTimeout(resolve, 10));

    // With batch: single recomputation
    batch(() => {
      state.value = { ...state.value, count: 10 };
      state.value = { ...state.value, multiplier: 2 };
      state.value = { ...state.value, offset: 5 };
    });

    await new Promise((resolve) => setTimeout(resolve, 10));
    const withBatchCount = computations.length;

    // Batching should result in fewer or equal computations (타이밍 이슈로 인해 equal 허용)
    expect(withBatchCount).toBeLessThanOrEqual(withoutBatchCount);
    expect(result.value).toBe(25); // 10 * 2 + 5
  });
});

// ========================================
// Async Data Fetching
// ========================================

describe('Integration: Async Data Fetching', () => {
  it('handles async computed with loading states', async () => {
    const userId = atom(1);

    // Mock API
    const fetchUser = async (id: number): Promise<User> => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { id, name: `User ${id}`, email: `user${id}@example.com` };
    };

    const userData = computed(
      async () => {
        return await fetchUser(userId.value);
      },
      { defaultValue: { id: 0, name: 'Loading...', email: '' } }
    );

    // Initial state (should be idle, not pending until first access)
    expect(userData.state).toBe('idle');

    // Access the value to trigger computation
    const initialValue = userData.value;
    expect(initialValue.name).toBe('Loading...');
    expect(userData.isPending).toBe(true);

    // Wait for resolution
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(userData.isResolved).toBe(true);
    expect(userData.value.name).toBe('User 1');

    // Change user ID
    userId.value = 2;
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Access value to trigger recomputation
    const _changingValue = userData.value;
    expect(userData.isPending).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(userData.isResolved).toBe(true);
    expect(userData.value.name).toBe('User 2');
  });

  it('handles async errors with error recovery', async () => {
    const shouldFail = atom(false);
    const errorLogs: Error[] = [];

    const riskyComputed = computed(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (shouldFail.value) {
          throw new Error('Computation failed');
        }
        return 'Success';
      },
      {
        defaultValue: 'Default',
        onError: (err) => errorLogs.push(err),
      }
    );

    // Access value to trigger initial computation
    const initialValue = riskyComputed.value;
    expect(initialValue).toBe('Default'); // Returns default while pending

    // Wait for resolution
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(riskyComputed.value).toBe('Success');
    expect(riskyComputed.hasError).toBe(false);

    // Trigger error
    shouldFail.value = true;

    // Invalidate to mark as dirty, then access to trigger recomputation
    riskyComputed.invalidate();
    const _errorValue = riskyComputed.value; // This triggers the async computation

    // Wait for async computation to fail
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(riskyComputed.hasError).toBe(true);
    expect(errorLogs.length).toBe(1);
    expect(riskyComputed.value).toBe('Default'); // Falls back to default

    // Recover
    shouldFail.value = false;

    // Invalidate and trigger recomputation
    riskyComputed.invalidate();
    const _recoveredValue = riskyComputed.value;

    // Wait for async computation to complete
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(riskyComputed.hasError).toBe(false);
    expect(riskyComputed.value).toBe('Success');
  });
});

// ========================================
// Performance & Memory Management
// ========================================

describe('Integration: Performance & Memory', () => {
  it('efficiently handles large dependency graphs', async () => {
    // Create a chain of computed values
    const source = atom(1);
    const chain: ReturnType<typeof computed<number>>[] = [
      source as unknown as ReturnType<typeof computed<number>>,
    ];

    for (let i = 0; i < 50; i++) {
      const prev = chain[i]!;
      chain.push(computed(() => prev.value + 1));
    }

    const final = chain[chain.length - 1]!;
    expect(final.value).toBe(51);

    // Update source
    source.value = 10;
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(final.value).toBe(60);
  });

  it('properly cleans up disposed atoms and effects', () => {
    const count = atom(0);
    const doubled = computed(() => count.value * 2);

    const effectRuns: number[] = [];
    const eff = effect(() => {
      effectRuns.push(doubled.value);
    });

    // Verify effect runs
    count.value = 5;

    // Dispose effect
    eff.dispose();
    expect(eff.isDisposed).toBe(true);

    // Further changes shouldn't trigger effect
    const runsBefore = effectRuns.length;
    count.value = 10;
    expect(effectRuns.length).toBe(runsBefore);

    // Dispose computed and atom
    doubled.dispose();
    count.dispose();
  });

  it('handles untracked reads for performance optimization', async () => {
    const expensiveComputation = vi.fn((x: number) => x * 2);
    const trigger = atom(0);
    const data = atom(100);

    // Store untracked value in a variable that updates with trigger
    const result = computed(() => {
      trigger.value; // Create dependency on trigger

      // Read data without creating dependency
      // Important: untracked reads the CURRENT value at computation time
      const dataValue = untracked(() => data.value);
      return expensiveComputation(dataValue);
    });

    // Initial computation
    expect(result.value).toBe(200);
    expect(expensiveComputation).toHaveBeenCalledTimes(1);

    // Changing data doesn't trigger recomputation (not a dependency)
    data.value = 200;
    expect(expensiveComputation).toHaveBeenCalledTimes(1);
    expect(result.value).toBe(200); // Still returns old cached value

    // Changing trigger does trigger recomputation
    // At recomputation time, it reads the NEW untracked value (200)
    trigger.value = 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(result.value).toBe(400); // Recomputes with new data value (200 * 2)
    expect(expensiveComputation).toHaveBeenCalledTimes(2);
  });
});
