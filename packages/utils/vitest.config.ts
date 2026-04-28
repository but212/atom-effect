import path from 'node:path';
import { defineVitestConfig } from '@but212/atom-effect-configs';

export default defineVitestConfig(import.meta.dirname)({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
  },
});
