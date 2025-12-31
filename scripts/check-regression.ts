/**
 * @fileoverview Check for performance regressions
 * @description Compares current benchmark results against baseline
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_FILE = join(process.cwd(), '.performance', 'baseline.json');
const RESULTS_FILE = join(process.cwd(), '.performance', 'benchmark-results.json');
const REGRESSION_THRESHOLD = 0.1; // 10% performance degradation threshold

interface BenchmarkResult {
	name: string;
	opsPerSec: number;
	meanTime: number;
	margin: number;
}

interface BenchmarkBaseline {
	timestamp: string;
	gitCommit: string;
	nodeVersion: string;
	results: BenchmarkResult[];
}

async function checkRegression() {
	console.log('🔍 Checking for performance regressions...\n');

	// Check if baseline exists
	if (!existsSync(BASELINE_FILE)) {
		console.warn('⚠️  No baseline found. Run `pnpm bench:baseline` first.');
		console.log('ℹ️  Skipping regression check.');
		process.exit(0);
	}

	try {
		// Load baseline
		const baseline: BenchmarkBaseline = JSON.parse(
			readFileSync(BASELINE_FILE, 'utf8'),
		);

		console.log(`📊 Baseline from: ${baseline.timestamp}`);
		console.log(`📝 Commit: ${baseline.gitCommit.substring(0, 7)}`);
		console.log(`🔧 Node: ${baseline.nodeVersion}\n`);

		// Run current benchmarks
		console.log('🏃 Running current benchmarks...\n');
		execSync('pnpm bench --reporter=json > .performance/current-results.json', {
			encoding: 'utf8',
			stdio: 'inherit',
		});

		// Parse current results
		if (!existsSync(RESULTS_FILE)) {
			console.warn('⚠️  No benchmark results file found');
			process.exit(1);
		}

		const currentResults: BenchmarkBaseline = JSON.parse(
			readFileSync(RESULTS_FILE, 'utf8'),
		);

		// Compare results
		const regressions: Array<{
			name: string;
			baselineOps: number;
			currentOps: number;
			degradation: number;
		}> = [];

		for (const baselineResult of baseline.results) {
			const currentResult = currentResults.results.find(
				(r) => r.name === baselineResult.name,
			);

			if (!currentResult) {
				console.warn(`⚠️  Benchmark "${baselineResult.name}" not found in current results`);
				continue;
			}

			const degradation =
				(baselineResult.opsPerSec - currentResult.opsPerSec) /
				baselineResult.opsPerSec;

			if (degradation > REGRESSION_THRESHOLD) {
				regressions.push({
					name: baselineResult.name,
					baselineOps: baselineResult.opsPerSec,
					currentOps: currentResult.opsPerSec,
					degradation,
				});
			}
		}

		// Report results
		if (regressions.length > 0) {
			console.error('\n❌ Performance regressions detected!\n');
			for (const reg of regressions) {
				console.error(`  ${reg.name}`);
				console.error(`    Baseline: ${reg.baselineOps.toFixed(2)} ops/sec`);
				console.error(`    Current:  ${reg.currentOps.toFixed(2)} ops/sec`);
				console.error(
					`    Degradation: ${(reg.degradation * 100).toFixed(2)}%\n`,
				);
			}
			console.error(
				`📈 Threshold: ${REGRESSION_THRESHOLD * 100}% degradation`,
			);
			process.exit(1);
		}

		console.log('\n✅ Performance regression check complete!');
		console.log('ℹ️  No significant regressions detected.');
		console.log(`📈 Threshold: ${REGRESSION_THRESHOLD * 100}% degradation`);
	} catch (error) {
		console.error('\n❌ Performance regression check failed:', error);
		process.exit(1);
	}
}

checkRegression();
