/**
 * @fileoverview Save performance baseline for regression detection
 * @description Runs benchmarks and saves results as baseline for comparison
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const BASELINE_DIR = join(process.cwd(), '.performance');
const BASELINE_FILE = join(BASELINE_DIR, 'baseline.json');

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

async function saveBaseline() {
  console.log('🔍 Running benchmarks to establish baseline...\n');

  // Ensure directory exists
  if (!existsSync(BASELINE_DIR)) {
    mkdirSync(BASELINE_DIR, { recursive: true });
  }

  try {
    // Run benchmarks and capture output
    const _output = execSync('pnpm bench', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Get git commit hash
    let gitCommit = 'unknown';
    try {
      gitCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      console.warn('⚠️  Could not determine git commit hash');
    }

    // Parse benchmark results (simplified - adjust based on actual output format)
    const baseline: BenchmarkBaseline = {
      timestamp: new Date().toISOString(),
      gitCommit,
      nodeVersion: process.version,
      results: {}, // TODO: Parse actual benchmark results
    };

    // Save baseline
    writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));

    console.log('\n✅ Performance baseline saved successfully!');
    console.log(`📁 Location: ${BASELINE_FILE}`);
    console.log(`📊 Commit: ${gitCommit.substring(0, 7)}`);
    console.log(`🕐 Timestamp: ${baseline.timestamp}`);
  } catch (error) {
    console.error('\n❌ Failed to save baseline:', error);
    process.exit(1);
  }
}

saveBaseline();
