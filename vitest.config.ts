import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.config.ts',
        '**/benchmarks/**',
        '**/*.test.ts',
        '__tests__/**',
        'src/types.ts', // 타입 정의 파일
        'scripts/',
      ],
    },
    projects: [
      {
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
          exclude: ['__tests__/dom/**', '**/*.dom.test.ts'],
        },
      },
      {
        resolve: {
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          include: ['__tests__/dom/**/*.test.ts', '**/*.dom.test.ts'],
        },
      },
    ],
  },
});
