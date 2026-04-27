import { defineVitestConfig } from '@but212/atom-effect-configs';

export default defineVitestConfig(import.meta.dirname)({
  test: {
    environment: 'node',
  },
});
