/**
 * @fileoverview Save performance baseline for regression detection
 * @description Runs benchmarks and saves results as baseline for comparison
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DIR = join(process.cwd(), '.performance');
const BASELINE_FILE = join(BASELINE_DIR, 'baseline.json');
const RESULTS_FILE = join(BASELINE_DIR, 'benchmark-results.json');

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

async function saveBaseline() {
	console.log('🔍 Running benchmarks to establish baseline...\n');

	// Ensure directory exists
	if (!existsSync(BASELINE_DIR)) {
		mkdirSync(BASELINE_DIR, { recursive: true });
	}

	try {
		// Run benchmarks with JSON reporter
		console.log('Running benchmarks...\n');
		execSync('pnpm bench --reporter=json > .performance/benchmark-results.json', {
			encoding: 'utf8',
			stdio: 'inherit',
		});

		// Get git commit hash
		let gitCommit = 'unknown';
		try {
			gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
		} catch {
			console.warn('⚠️  Could not determine git commit hash');
		}

		// Parse benchmark results
		let results: BenchmarkResult[] = [];
		if (existsSync(RESULTS_FILE)) {
			try {
				const rawResults = JSON.parse(readFileSync(RESULTS_FILE, 'utf8'));
				// Extract results from Vitest benchmark output format
				// This may need adjustment based on actual Vitest output
				results = rawResults.results || rawResults || [];
			} catch (error) {
				console.warn('⚠️  Could not parse benchmark results');
				console.warn('Saving baseline with empty results for now');
			}
		}

		// Create baseline
		const baseline: BenchmarkBaseline = {
			timestamp: new Date().toISOString(),
			gitCommit,
			nodeVersion: process.version,
			results,
		};

		// Save baseline
		writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));

		console.log('\n✅ Performance baseline saved successfully!');
		console.log(`📁 Location: ${BASELINE_FILE}`);
		console.log(`📊 Commit: ${gitCommit.substring(0, 7)}`);
		console.log(`🕐 Timestamp: ${baseline.timestamp}`);
		console.log(`📈 Benchmarks saved: ${results.length}`);
	} catch (error) {
		console.error('\n❌ Failed to save baseline:', error);
		process.exit(1);
	}
}

saveBaseline();
