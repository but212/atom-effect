import { defineVitestConfig } from './src/index';

export default defineVitestConfig(import.meta.dirname, {
  test: {
    environment: 'node',
  },
});
