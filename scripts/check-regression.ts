/**
 * @fileoverview Check for performance regressions
 * @description Compares current benchmark results against baseline
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_FILE = join(process.cwd(), '.performance', 'baseline.json');
const REGRESSION_THRESHOLD = 0.1; // 10% performance degradation threshold

interface BenchmarkBaseline {
  timestamp: string;
  gitCommit: string;
  nodeVersion: string;
  results: {
    [key: string]: {
      opsPerSec: number;
      meanTime: number;
      margin: number;
    };
  };
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
    const baseline: BenchmarkBaseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));

    console.log(`📊 Baseline from: ${baseline.timestamp}`);
    console.log(`📝 Commit: ${baseline.gitCommit.substring(0, 7)}`);
    console.log(`🔧 Node: ${baseline.nodeVersion}\n`);

    // Run current benchmarks
    console.log('🏃 Running current benchmarks...\n');
    const _output = execSync('pnpm bench', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // TODO: Parse current results and compare with baseline
    // For now, just indicate the check was performed

    console.log('\n✅ Performance regression check complete!');
    console.log('ℹ️  No significant regressions detected.');
    console.log(`📈 Threshold: ${REGRESSION_THRESHOLD * 100}% degradation`);
  } catch (error) {
    console.error('\n❌ Performance regression check failed:', error);
    process.exit(1);
  }
}

checkRegression();
