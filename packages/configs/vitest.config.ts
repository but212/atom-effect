import { defineVitestConfig } from './src/index.js';

export default defineVitestConfig(import.meta.dirname, {
  test: {
    environment: 'node',
  },
});
