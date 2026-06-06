import type { AliasOptions } from 'vite';

export const getAliasConfig = (packageDir: string): { resolve: { alias: AliasOptions } } => ({
  resolve: {
    alias: {
      '@': `${packageDir}/src`,
    },
  },
});
