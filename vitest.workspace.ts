export default [
  {
    extends: 'vitest.config.ts',
    test: {
      name: 'unit',
      environment: 'node',
      include: ['__tests__/**/*.test.ts', 'src/**/*.test.ts'],
      exclude: ['__tests__/dom/**', '**/*.dom.test.ts'],
    },
  },
  {
    extends: 'vitest.config.ts',
    test: {
      name: 'dom',
      environment: 'happy-dom',
      include: ['__tests__/dom/**/*.test.ts', '**/*.dom.test.ts'],
    },
  },
];
