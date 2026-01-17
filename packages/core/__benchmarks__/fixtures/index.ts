/**
 * @fileoverview Shared test data fixtures for benchmarks
 * @description Common data generators for consistent benchmark scenarios
 */

export interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
  createdAt: Date;
}

export interface DataGridRow {
  id: number;
  name: string;
  age: number;
  email: string;
  department: string;
  salary: number;
  startDate: Date;
  active: boolean;
}

/**
 * Generate todo items for benchmarking
 */
export function generateTodos(count: number): TodoItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    text: `Todo item ${i + 1}`,
    completed: i % 3 === 0,
    createdAt: new Date(Date.now() - i * 1000 * 60),
  }));
}

/**
 * Generate data grid rows for benchmarking
 */
export function generateGridData(rows: number): DataGridRow[] {
  const departments = ['Engineering', 'Sales', 'Marketing', 'HR', 'Finance'];
  const names = ['Alice', 'Bob', 'Charlie', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];

  return Array.from({ length: rows }, (_, i) => ({
    id: i + 1,
    name: `${names[i % names.length]} ${Math.floor(i / names.length)}`,
    age: 20 + (i % 50),
    email: `user${i}@example.com`,
    department: departments[i % departments.length],
    salary: 50000 + (i % 10) * 10000,
    startDate: new Date(2020, 0, 1 + (i % 365)),
    active: i % 5 !== 0,
  }));
}

/**
 * Generate random integer between min and max (inclusive)
 */
export function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Generate random string of specified length
 */
export function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/**
 * Generate array of random numbers
 */
export function randomNumbers(count: number, min = 0, max = 1000): number[] {
  return Array.from({ length: count }, () => randomInt(min, max));
}
