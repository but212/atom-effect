import type { Options } from 'tsup';

export const baseTsupConfig: Options = {
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
};
