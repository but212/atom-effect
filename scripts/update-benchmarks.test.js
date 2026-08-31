import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.join(scriptsDirectory, '..');

const rawResultFiles = [
  'core-macro.txt',
  'core-micro.txt',
  'core-realistic.txt',
  'core-state.txt',
  'jquery-macro.txt',
  'jquery-micro.txt',
  'utils-all.txt',
];

const documentationFiles = [
  'packages/core/docs/BENCHMARKS.md',
  'packages/core/docs/BENCHMARKS_DETAILED.md',
  'packages/jquery/docs/BENCHMARKS.md',
  'packages/jquery/docs/BENCHMARKS_DETAILED.md',
  'packages/utils/docs/BENCHMARKS.md',
  'packages/utils/docs/BENCHMARKS_DETAILED.md',
];

const sampleBenchmarkOutput =
  '\u001b[32m· untracked read: active 1,234.00 ops/sec (mean: 0.8100 ms) (p99: 1.2000 ms)\u001b[39m\n';

test('updates documentation from a separate raw-results directory', async (t) => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'atom-effect-benchmarks-'));
  t.after(() => rm(temporaryRoot, { recursive: true, force: true }));

  const temporaryScriptsDirectory = path.join(temporaryRoot, 'scripts');
  const temporaryResultsDirectory = path.join(temporaryRoot, 'results-merged');
  await mkdir(temporaryScriptsDirectory, { recursive: true });
  await mkdir(temporaryResultsDirectory, { recursive: true });

  await cp(
    path.join(scriptsDirectory, 'update-benchmarks.js'),
    path.join(temporaryScriptsDirectory, 'update-benchmarks.js')
  );

  for (const relativePath of documentationFiles) {
    const destination = path.join(temporaryRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(repositoryRoot, relativePath), destination);
  }

  for (const fileName of rawResultFiles) {
    await writeFile(path.join(temporaryResultsDirectory, fileName), sampleBenchmarkOutput);
  }

  const originalArguments = process.argv;
  process.argv = [...originalArguments.slice(0, 2), temporaryResultsDirectory];
  try {
    await import(pathToFileURL(path.join(temporaryScriptsDirectory, 'update-benchmarks.js')).href);
  } finally {
    process.argv = originalArguments;
  }

  const overview = await readFile(
    path.join(temporaryRoot, 'packages/core/docs/BENCHMARKS.md'),
    'utf8'
  );
  assert.match(overview, /\| \*\*Atom\*\* \| Read \(untracked\) \| 1\.2K ops\/sec \|/);

  const detailed = await readFile(
    path.join(temporaryRoot, 'packages/core/docs/BENCHMARKS_DETAILED.md'),
    'utf8'
  );
  assert.match(detailed, /\| untracked read: active \| 1,234\.00 \| 0\.8100 \| 1\.2000 \|/);
});
