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
  },
});
