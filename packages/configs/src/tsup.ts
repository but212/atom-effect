import { defineConfig, type Options } from 'tsup';

export const createTsupConfig = (options: Options = {}) => {
  return defineConfig({
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    ...options,
  });
};
