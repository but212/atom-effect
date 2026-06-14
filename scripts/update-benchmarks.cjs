/**
 * @file update-benchmarks.cjs
 * @description Automatically parses Vitest benchmark text outputs and surgically updates
 * the markdown documentation tables across the core, jquery, and utils packages.
 *
 * To ensure structural integrity, it dynamically maps table headers to column indexes
 * and throws descriptive errors if expected headers are missing or mutated.
 */

const fs = require('node:fs');
const path = require('node:path');

// biome-ignore lint/suspicious/noControlCharactersInRegex: Required to match and strip ANSI terminal escape sequences
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strips ANSI escape sequences from terminal logs/output.
 * @param {string} str - The raw string containing ANSI codes.
 * @returns {string} The cleaned plain-text string.
 */
const stripAnsi = (str) => str.replace(ansiRegex, '');

const txtFiles = [
  'core-macro.txt',
  'core-micro.txt',
  'core-realistic.txt',
  'core-state.txt',
  'jquery-macro.txt',
  'jquery-micro.txt',
  'utils-all.txt',
];

const workspaceRoot = path.join(__dirname, '..');
const benchmarkDb = {};

/**
 * Normalizes test case names to enable resilient dictionary mapping.
 * Strips loop factors like `(x10)`, `(x80)`, etc., punctuation, and standardizes whitespace.
 * @param {string} name - The original benchmark case name.
 * @returns {string} The normalized lowercase, space-delimited string.
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/,\s*x\d+\b/g, '')
    .replace(/\b(x\d+)\b/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse Vitest benchmark result logs
txtFiles.forEach((file) => {
  const filePath = path.join(workspaceRoot, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[IO Error] Required benchmark source file missing: ${file}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  content.split('\n').forEach((line) => {
    const cleanLine = stripAnsi(line).trim();
    // Benchmark rows are marked with the '·' bullet point
    if (cleanLine.includes('·') || cleanLine.startsWith('·')) {
      const parts = cleanLine.split(/\s+/);
      // Ensure the line contains the 10 numeric metrics columns at the end
      if (parts.length >= 11) {
        const stats = parts.slice(-10);
        const nameParts = parts.slice(0, -10);
        const name = nameParts
          .join(' ')
          .replace(/^[·\s]+/, '')
          .trim();
        const normalized = normalizeName(name);

        benchmarkDb[normalized] = {
          hz: parseFloat(stats[0].replace(/,/g, '')),
          mean: parseFloat(stats[3]),
          p99: parseFloat(stats[5]),
        };
      }
    }
  });
});

/**
 * Formats raw Hz values into human-readable throughput notations.
 * @param {number} hz - The raw operations per second count.
 * @returns {string} Formatted throughput string (e.g., "5.20M ops/sec", "376.2K ops/sec").
 */
function formatOpsSec(hz) {
  if (hz >= 1000000) return `${(hz / 1000000).toFixed(2)}M ops/sec`;
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}K ops/sec`;
  return `${hz.toFixed(1)} ops/sec`;
}

/**
 * Resolves column positions for required headers, throwing if structure constraints are violated.
 * @param {string} headerLine - The raw markdown table header line.
 * @param {string[]} expected - Array of expected column header names.
 * @returns {Record<string, number>} Object mapping expected header names to 0-based column index.
 * @throws {Error} If any of the expected headers are missing.
 */
function getColIndexes(headerLine, expected) {
  const cols = headerLine.split('|').map((c) => c.trim());
  const result = {};
  expected.forEach((name) => {
    const idx = cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    if (idx === -1) {
      throw new Error(
        `[Structural Integrity Error] Expected column "${name}" not found in header: "${headerLine}"`
      );
    }
    result[name] = idx;
  });
  return result;
}

// ============================================================================
// 1. Update Core Package Overview Benchmarks
// ============================================================================
const coreOverviewPath = path.join(workspaceRoot, 'packages/core/docs/BENCHMARKS.md');
if (fs.existsSync(coreOverviewPath)) {
  const lines = fs.readFileSync(coreOverviewPath, 'utf8').split('\n');
  let headerIndexes = null;
  const updated = lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      if (
        !headerIndexes &&
        line.toLowerCase().includes('category') &&
        line.toLowerCase().includes('metric')
      ) {
        headerIndexes = getColIndexes(line, ['Category', 'Metric', 'Result']);
        return line;
      }
      if (line.includes(':---') || !headerIndexes) return line;

      const cols = line.split('|').map((c) => c.trim());
      const cat = cols[headerIndexes.Category];
      const met = cols[headerIndexes.Metric];
      let matchedKey = null;

      if (cat === '**Atom**' && met === 'Read (untracked)') matchedKey = 'untracked read: active';
      else if (cat === '**Computed**' && met === 'Recompute (cached)')
        matchedKey = 'recomputation & cache';
      else if (cat === '**Effect**' && met === 'Propagation')
        matchedKey = 'propagation: atom → computed → effect';
      else if (cat === '**Workflow**' && met === 'Todo App')
        matchedKey = '[Atom] full workflow: add → toggle → filter → delete → stats';
      else if (cat === '**Latency**' && met === '100 Atom updates') {
        const match = benchmarkDb[normalizeName('[Batch] state sync (100 atoms)')];
        if (match) {
          cols[headerIndexes.Result] = `${match.mean.toFixed(4)} ms`;
          return `| ${cols.slice(1, -1).join(' | ')} |`;
        }
      }

      if (matchedKey) {
        const match = benchmarkDb[normalizeName(matchedKey)];
        if (match) {
          cols[headerIndexes.Result] = formatOpsSec(match.hz);
          return `| ${cols.slice(1, -1).join(' | ')} |`;
        }
      }
    }
    return line;
  });
  fs.writeFileSync(coreOverviewPath, updated.join('\n'), 'utf8');
  console.log(`Updated: ${coreOverviewPath}`);
}

// ============================================================================
// 2. Update jQuery Package Overview Benchmarks
// ============================================================================
const jqueryOverviewPath = path.join(workspaceRoot, 'packages/jquery/docs/BENCHMARKS.md');
if (fs.existsSync(jqueryOverviewPath)) {
  const lines = fs.readFileSync(jqueryOverviewPath, 'utf8').split('\n');
  let headerIndexesTable1 = null;
  let headerIndexesTable2 = null;
  const updated = lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      // Table 1: Key Metric Overview
      if (line.toLowerCase().includes('category') && line.toLowerCase().includes('key metric')) {
        headerIndexesTable1 = getColIndexes(line, ['Category', 'Key Metric', 'Value']);
        return line;
      }
      // Table 2: Benchmark Highlights
      if (line.toLowerCase().includes('benchmark') && line.toLowerCase().includes('result')) {
        headerIndexesTable2 = getColIndexes(line, ['Benchmark', 'Result']);
        return line;
      }
      if (line.includes(':---') || line.includes('----------')) return line;

      const cols = line.split('|').map((c) => c.trim());

      if (headerIndexesTable1 && cols.length === 6) {
        const cat = cols[headerIndexesTable1.Category];
        const met = cols[headerIndexesTable1['Key Metric']];
        let key = '';
        if (cat === '**Text Binding**' && met === 'Update (100el × 50)')
          key = 'atom-effect: update text (100 elements x 50 updates)';
        else if (cat === '**Class Binding**' && met === 'Toggle (100el × 100)')
          key = 'atom-effect: toggle class (100 elements x 100 toggles)';
        else if (cat === '**List Render**' && met === 'Reconciliation (100 items)')
          key = 'reconciliation: full shuffle 100 items';
        else if (cat === '**Input (DOM→Atom)**' && met === '100 events')
          key = 'DOM → atom: input val (trigger 100 events)';
        else if (cat === '**Todo App**' && met === 'Full workflow')
          key = 'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all';
        else if (cat === '**Dashboard**' && met === 'Fan-in chain')
          key = 'fan-in: 100 atoms → 1 computed → 1 DOM binding';

        if (key) {
          const match = benchmarkDb[normalizeName(key)];
          if (match) {
            cols[headerIndexesTable1.Value] = formatOpsSec(match.hz);
            return `| ${cols.slice(1, -1).join(' | ')} |`;
          }
        }
      } else if (headerIndexesTable2 && cols.length === 5) {
        const benchmark = cols[headerIndexesTable2.Benchmark];
        let key = '';
        if (benchmark === 'atomText update (100el × 50)')
          key = 'atom-effect: update text (100 elements x 50 updates)';
        else if (benchmark === 'atomClass toggle (100el × 100)')
          key = 'atom-effect: toggle class (100 elements x 100 toggles)';
        else if (benchmark === 'atomList reconciliation (100 items)')
          key = 'reconciliation: full shuffle 100 items';
        else if (benchmark === 'atomVal DOM→Atom (100 events)')
          key = 'DOM → atom: input val (trigger 100 events)';
        else if (benchmark === 'Todo full workflow')
          key = 'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all';
        else if (benchmark === 'Dashboard fan-in')
          key = 'fan-in: 100 atoms → 1 computed → 1 DOM binding';
        else if (benchmark === 'atomForm O(1) Scaling')
          key = 'Update 1 field in 100-field form (x10)';

        if (key) {
          const match = benchmarkDb[normalizeName(key)];
          if (match) {
            cols[headerIndexesTable2.Result] = formatOpsSec(match.hz);
            return `| ${cols.slice(1, -1).join(' | ')} |`;
          }
        }
      }
    }
    return line;
  });
  fs.writeFileSync(jqueryOverviewPath, updated.join('\n'), 'utf8');
  console.log(`Updated: ${jqueryOverviewPath}`);
}

// ============================================================================
// 3. Update Utils Package Overview Benchmarks
// ============================================================================
const utilsOverviewPath = path.join(workspaceRoot, 'packages/utils/docs/BENCHMARKS.md');
if (fs.existsSync(utilsOverviewPath)) {
  const lines = fs.readFileSync(utilsOverviewPath, 'utf8').split('\n');
  let headerIndexes = null;
  const updated = lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      if (line.toLowerCase().includes('category') && line.toLowerCase().includes('key metric')) {
        headerIndexes = getColIndexes(line, ['Category', 'Key Metric', 'Value']);
        return line;
      }
      if (line.includes(':---') || !headerIndexes) return line;

      const cols = line.split('|').map((c) => c.trim());
      const cat = cols[headerIndexes.Category];
      const met = cols[headerIndexes['Key Metric']];
      let key = '';
      if (cat === '**SlotBuffer**' && met === 'push (small)') key = 'push (small, x10)';
      else if (cat === '**Option**' && met === 'isSome check') key = 'isSome (x10)';
      else if (cat === '**Result**' && met === 'ok creation') key = 'Result.ok creation (x10)';
      else if (cat === '**Type Guard**' && met === 'isPromise')
        key = 'isPromise: native promise (x10)';

      if (key) {
        const match = benchmarkDb[normalizeName(key)];
        if (match) {
          cols[headerIndexes.Value] = formatOpsSec(match.hz);
          return `| ${cols.slice(1, -1).join(' | ')} |`;
        }
      }
    }
    return line;
  });
  fs.writeFileSync(utilsOverviewPath, updated.join('\n'), 'utf8');
  console.log(`Updated: ${utilsOverviewPath}`);
}

// ============================================================================
// 4. Update Detailed Benchmark Files
// ============================================================================
const detailedFiles = [
  'packages/core/docs/BENCHMARKS_DETAILED.md',
  'packages/jquery/docs/BENCHMARKS_DETAILED.md',
  'packages/utils/docs/BENCHMARKS_DETAILED.md',
];

detailedFiles.forEach((mdFile) => {
  const filePath = path.join(workspaceRoot, mdFile);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let headerIndexes = null;
  const updated = lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      const isHeader =
        line.toLowerCase().includes('ops/sec') || line.toLowerCase().includes('mean');
      if (isHeader) {
        const cols = line.split('|').map((c) => c.trim());
        // Find whichever column denotes the case name dynamically
        const caseColName = cols.find((c) =>
          ['test case', 'benchmark case', 'pattern', 'scenario'].includes(c.toLowerCase())
        );
        if (caseColName) {
          headerIndexes = getColIndexes(line, [
            caseColName,
            'ops/sec (Hz)',
            'Mean (ms)',
            'p99 (ms)',
          ]);
          headerIndexes.caseKey = caseColName;
        }
        return line;
      }
      if (line.includes(':---') || line.includes('--- |') || !headerIndexes) return line;

      const cols = line.split('|').map((c) => c.trim());
      const testCase = cols[headerIndexes[headerIndexes.caseKey]];
      const match = benchmarkDb[normalizeName(testCase)];
      if (match) {
        cols[headerIndexes['ops/sec (Hz)']] = match.hz.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        cols[headerIndexes['Mean (ms)']] = match.mean.toFixed(4);
        cols[headerIndexes['p99 (ms)']] = match.p99.toFixed(4);
        return `| ${cols.slice(1, -1).join(' | ')} |`;
      }
    }
    return line;
  });

  fs.writeFileSync(filePath, updated.join('\n'), 'utf8');
  console.log(`Updated: ${filePath}`);
});
