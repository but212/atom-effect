import { createVitestConfig } from '@but212/atom-effect-configs';

export default createVitestConfig(import.meta.dirname, {
  test: {
    environment: 'node',
  },
});
