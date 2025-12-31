/**
 * @fileoverview benchmark main entry file
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

// Macro benchmarks
import { runDashboardBenchmark } from './macro/dashboard.bench';
import { runDiamondProblemBenchmark } from './macro/diamond-problem.bench';
import { runLargeGraphBenchmark } from './macro/large-graph.bench';
import { runTodoAppBenchmark } from './macro/todo-app.bench';
// Micro benchmarks
import { runGCPressureBenchmark } from './memory/gc-pressure.bench';
import { runLeakDetectionBenchmark } from './memory/leak-detection.bench';
import { runAtomOperationsBenchmark } from './micro/atom-operations.bench';
import { runBatchOperationsBenchmark } from './micro/batch-operations.bench';
import { runComputedOperationsBenchmark } from './micro/computed-operations.bench';
import { runEffectOperationsBenchmark } from './micro/effect-operations.bench';
// DOM benchmarks
import { runDOMEventBenchmark } from './dom/event.bench';
import { runDOMRenderBenchmark } from './dom/render.bench';
import { runDOMUpdateBenchmark } from './dom/update.bench';
import { useDist } from './utils/import-lib';
import { getEnvironment, Reporter } from './utils/reporter';

const reporter = new Reporter();

function runSubprocess(command: 'micro' | 'macro'): void {
  const isWin = process.platform === 'win32';
  const tsxBin = path.join(
    process.cwd(),
    'node_modules',
    '.bin',
    isWin ? 'tsx.cmd' : 'tsx'
  );

  const result = isWin
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', tsxBin, 'benchmarks/index.ts', command], {
        stdio: 'inherit',
        env: process.env,
      })
    : spawnSync(tsxBin, ['benchmarks/index.ts', command], {
        stdio: 'inherit',
        env: process.env,
      });

  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    process.exit(result.status);
  }
}

/**
 * run all benchmarks
 */
async function runAll() {
  console.log('\n🚀 Starting Reactive Atom Benchmarks...\n');

  // build info
  if (useDist) {
    console.log('📦 Using optimized build from dist/\n');
  } else {
    console.log('🔧 Using source files from src/ (run `pnpm build` for optimized benchmarks)\n');
  }

  console.log('='.repeat(80));

  const startTime = Date.now();

  try {
    runSubprocess('micro');
    runSubprocess('macro');

    const env = getEnvironment();

    const duration = Date.now() - startTime;
    console.log(`\n${'='.repeat(80)}\n`);
    console.log(`\n✅ All benchmarks completed in ${(duration / 1000).toFixed(2)}s`);

    // report generation
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    reporter.saveJSON(`benchmark-${timestamp}.json`);
    reporter.saveHTML(`benchmark-${timestamp}.html`);
    reporter.saveMarkdown(`benchmark-${timestamp}.md`);
  } catch (error) {
    console.error('\n❌ Benchmark failed:', error);
    process.exit(1);
  }
}

/**
 * run micro benchmarks
 */
async function runMicro() {
  console.log('\n🚀 Running Micro Benchmarks...\n');
  await runAtomOperationsBenchmark();
  await runComputedOperationsBenchmark();
  await runEffectOperationsBenchmark();
  await runBatchOperationsBenchmark();
  console.log('\n✅ Micro benchmarks completed');
}

/**
 * run macro benchmarks
 */
async function runMacro() {
  console.log('\n🚀 Running Macro Benchmarks...\n');
  await runDiamondProblemBenchmark();
  await runTodoAppBenchmark();
  await runDashboardBenchmark();
  await runLargeGraphBenchmark();
  console.log('\n✅ Macro benchmarks completed');
}

/**
 * run memory benchmarks
 */
async function runMemory() {
  console.log('\n🚀 Running Memory Benchmarks...\n');
  await runGCPressureBenchmark();
  await runLeakDetectionBenchmark();
  console.log('\n✅ Memory benchmarks completed');
}

/**
 * run DOM benchmarks
 */
async function runDOM() {
  console.log('\n🚀 Running DOM Benchmarks...\n');
  await runDOMRenderBenchmark();
  await runDOMUpdateBenchmark();
  await runDOMEventBenchmark();
  console.log('\n✅ DOM benchmarks completed');
}

// CLI interface
const args = process.argv.slice(2);
const command = args[0] || 'all';

(async () => {
  switch (command) {
    case 'all':
      await runAll();
      break;
    case 'micro':
      await runMicro();
      break;
    case 'macro':
      await runMacro();
      break;
    case 'memory':
      await runMemory();
      break;
    case 'atom':
      await runAtomOperationsBenchmark();
      break;
    case 'computed':
      await runComputedOperationsBenchmark();
      break;
    case 'effect':
      await runEffectOperationsBenchmark();
      break;
    case 'batch':
      await runBatchOperationsBenchmark();
      break;
    case 'diamond':
      await runDiamondProblemBenchmark();
      break;
    case 'todo':
      await runTodoAppBenchmark();
      break;
    case 'dashboard':
      await runDashboardBenchmark();
      break;
    case 'graph':
      await runLargeGraphBenchmark();
      break;
    case 'gc':
      await runGCPressureBenchmark();
      break;
    case 'leak':
      await runLeakDetectionBenchmark();
      break;
    case 'dom':
      await runDOM();
      break;
    case 'dom:render':
      await runDOMRenderBenchmark();
      break;
    case 'dom:update':
      await runDOMUpdateBenchmark();
      break;
    case 'dom:event':
      await runDOMEventBenchmark();
      break;
    default:
      console.log(`
Usage: npm run bench [command]

Commands:
  all         Run all benchmarks (default)
  micro       Run all micro benchmarks
  macro       Run all macro benchmarks
  memory      Run all memory benchmarks
  
  atom        Run atom operations benchmark
  computed    Run computed operations benchmark
  effect      Run effect operations benchmark
  batch       Run batch operations benchmark
  
  diamond     Run diamond problem benchmark
  todo        Run todo app benchmark
  dashboard   Run dashboard benchmark
  graph       Run large graph benchmark

  gc          Run GC pressure benchmark
  leak        Run leak detection benchmark
  
  dom         Run all DOM benchmarks
  dom:render  Run DOM rendering benchmark
  dom:update  Run DOM update benchmark
  dom:event   Run DOM event benchmark
      `);
  }
})().catch(console.error);
