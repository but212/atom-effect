import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration for benchmarks
 * Separate from test configuration to avoid conflicts
 */
export default defineConfig({
	test: {
		benchmark: {
			include: ['__benchmarks__/**/*.bench.ts'],
			exclude: ['**/node_modules/**', '**/dist/**'],
			// Benchmark-specific options
			outputFile: '.performance/benchmark-results.json',
		},
	},
});
