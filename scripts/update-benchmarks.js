/**
 * @file update-benchmarks.js
 * @description Automatically parses Vitest benchmark text outputs and surgically updates
 * the markdown documentation tables across the core, jquery, and utils packages.
 *
 * To ensure structural integrity, it dynamically maps table headers to column indexes
 * and throws descriptive errors if expected headers are missing or mutated.
 */

import fs from 'node:fs';
import path from 'node:path';

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

const workspaceRoot = import.meta.dirname
  ? path.join(import.meta.dirname, '..')
  : path.join(process.cwd());
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
for (const file of txtFiles) {
  const filePath = path.join(workspaceRoot, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`[IO Error] Required benchmark source file missing: ${file}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split('\n')) {
    const cleanLine = stripAnsi(line).trim();
    // Benchmark rows are marked with the '·' bullet point
    if (cleanLine.includes('·') || cleanLine.startsWith('·')) {
      const parts = cleanLine.split(/\s+/);
      let hz = NaN;
      let mean = NaN;
      let p99 = NaN;
      let nameParts = [];

      const opsSecIdx = parts.lastIndexOf('ops/sec');
      if (opsSecIdx !== -1 && opsSecIdx > 0) {
        hz = parseFloat(parts[opsSecIdx - 1].replace(/,/g, ''));
        const meanIdx = parts.indexOf('(mean:');
        const p99Idx = parts.indexOf('(p99:');
        mean = meanIdx === -1 ? NaN : parseFloat(parts[meanIdx + 1]);
        p99 = p99Idx === -1 ? NaN : parseFloat(parts[p99Idx + 1]);
        nameParts = parts.slice(0, opsSecIdx - 1);
      } else if (parts.length >= 11) {
        const stats = parts.slice(-10);
        hz = parseFloat(stats[0].replace(/,/g, ''));
        mean = parseFloat(stats[3]);
        p99 = parseFloat(stats[5]);
        nameParts = parts.slice(0, -10);
      }

      if (!Number.isNaN(hz) && !Number.isNaN(mean) && !Number.isNaN(p99)) {
        const name = nameParts
          .join(' ')
          .replace(/^[·\s]+/, '')
          .trim();
        const normalized = normalizeName(name);

        benchmarkDb[normalized] = { hz, mean, p99 };
      }
    }
  }
}

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
  for (const name of expected) {
    const idx = cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    if (idx === -1) {
      throw new Error(
        `[Structural Integrity Error] Expected column "${name}" not found in header: "${headerLine}"`
      );
    }
    result[name] = idx;
  }
  return result;
}

// ============================================================================
// Declarative Mappings for Overview Tables
// ============================================================================

const OVERVIEW_SCHEMAS = [
  {
    filePath: 'packages/core/docs/BENCHMARKS.md',
    headers: ['Category', 'Metric', 'Result'],
    matchRow: (row) => `${row.Category} | ${row.Metric}`,
    mappings: {
      '**Atom** | Read (untracked)': { key: 'untracked read: active', format: 'hz' },
      '**Computed** | Recompute (cached)': { key: 'recomputation & cache', format: 'hz' },
      '**Effect** | Propagation': { key: 'propagation: atom → computed → effect', format: 'hz' },
      '**Workflow** | Todo App': {
        key: '[Atom] full workflow: add → toggle → filter → delete → stats',
        format: 'hz',
      },
      '**Latency** | 100 Atom updates': { key: '[Batch] state sync (100 atoms)', format: 'ms' },
    },
  },
  {
    filePath: 'packages/jquery/docs/BENCHMARKS.md',
    headers: ['Category', 'Key Metric', 'Value'],
    matchRow: (row) => `${row.Category} | ${row['Key Metric']}`,
    mappings: {
      '**Text Binding** | Update (100el × 50)': {
        key: 'atom-effect: update text (100 elements x 50 updates)',
        format: 'hz',
      },
      '**Class Binding** | Toggle (100el × 100)': {
        key: 'atom-effect: toggle class (100 elements x 100 toggles)',
        format: 'hz',
      },
      '**List Render** | Reconciliation (100 items)': {
        key: 'reconciliation: full shuffle 100 items',
        format: 'hz',
      },
      '**Input (DOM→Atom)** | 100 events': {
        key: 'DOM → atom: input val (trigger 100 events)',
        format: 'hz',
      },
      '**Todo App** | Full workflow': {
        key: 'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all',
        format: 'hz',
      },
      '**Dashboard** | Fan-in chain': {
        key: 'fan-in: 100 atoms → 1 computed → 1 DOM binding',
        format: 'hz',
      },
    },
  },
  {
    filePath: 'packages/jquery/docs/BENCHMARKS.md',
    headers: ['Benchmark', 'Result'],
    matchRow: (row) => row.Benchmark,
    mappings: {
      'atomText update (100el × 50)': {
        key: 'atom-effect: update text (100 elements x 50 updates)',
        format: 'hz',
      },
      'atomClass toggle (100el × 100)': {
        key: 'atom-effect: toggle class (100 elements x 100 toggles)',
        format: 'hz',
      },
      'atomList reconciliation (100 items)': {
        key: 'reconciliation: full shuffle 100 items',
        format: 'hz',
      },
      'atomVal DOM→Atom (100 events)': {
        key: 'DOM → atom: input val (trigger 100 events)',
        format: 'hz',
      },
      'Todo full workflow': {
        key: 'full workflow (small): add(20) → toggle(10) → filter(active) → delete(5) → all',
        format: 'hz',
      },
      'Dashboard fan-in': { key: 'fan-in: 100 atoms → 1 computed → 1 DOM binding', format: 'hz' },
      'atomForm O(1) Scaling': { key: 'Update 1 field in 100-field form (x10)', format: 'hz' },
    },
  },
  {
    filePath: 'packages/utils/docs/BENCHMARKS.md',
    headers: ['Category', 'Key Metric', 'Value'],
    matchRow: (row) => `${row.Category} | ${row['Key Metric']}`,
    mappings: {
      '**SlotBuffer** | push (small)': { key: 'push (small, x10)', format: 'hz' },
      '**Option** | isSome check': { key: 'isSome (x10)', format: 'hz' },
      '**Result** | ok creation': { key: 'Result.ok creation (x10)', format: 'hz' },
      '**Type Guard** | isPromise': { key: 'isPromise: native promise (x10)', format: 'hz' },
    },
  },
];

// Helper to update a table in place using a list of lines and a specific schema definition
function processTableLines(lines, schema) {
  let headerIndexes = null;
  return lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      const lowerLine = line.toLowerCase();
      // Detect if this line matches all the required headers for this schema
      const isTargetHeader = schema.headers.every((h) => lowerLine.includes(h.toLowerCase()));
      if (isTargetHeader && !headerIndexes) {
        headerIndexes = getColIndexes(line, schema.headers);
        return line;
      }
      if (line.includes(':---') || line.includes('----------') || !headerIndexes) {
        return line;
      }

      const cols = line.split('|').map((c) => c.trim());
      // Convert columns array back to a lookup object
      const rowObj = {};
      for (const h of schema.headers) {
        rowObj[h] = cols[headerIndexes[h]];
      }

      const matchValue = schema.matchRow(rowObj);
      const mapped = schema.mappings[matchValue];
      if (mapped) {
        const match = benchmarkDb[normalizeName(mapped.key)];
        if (match) {
          const targetCol = schema.headers[schema.headers.length - 1]; // Result, Value, etc. (always the last header in expected)
          const resultIndex = headerIndexes[targetCol];
          if (mapped.format === 'ms') {
            cols[resultIndex] = `${match.mean.toFixed(4)} ms`;
          } else {
            cols[resultIndex] = formatOpsSec(match.hz);
          }
          return `| ${cols.slice(1, -1).join(' | ')} |`;
        }
      }
    }
    return line;
  });
}

// 1. Update Overview files
const filesToUpdate = new Set(OVERVIEW_SCHEMAS.map((s) => s.filePath));
for (const relPath of filesToUpdate) {
  const filePath = path.join(workspaceRoot, relPath);
  if (!fs.existsSync(filePath)) continue;

  let lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const schemasForFile = OVERVIEW_SCHEMAS.filter((s) => s.filePath === relPath);

  for (const schema of schemasForFile) {
    lines = processTableLines(lines, schema);
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
  console.log(`Updated: ${filePath}`);
}

// ============================================================================
// 2. Update Detailed Benchmark Files
// ============================================================================
const detailedFiles = [
  'packages/core/docs/BENCHMARKS_DETAILED.md',
  'packages/jquery/docs/BENCHMARKS_DETAILED.md',
  'packages/utils/docs/BENCHMARKS_DETAILED.md',
];

for (const mdFile of detailedFiles) {
  const filePath = path.join(workspaceRoot, mdFile);
  if (!fs.existsSync(filePath)) continue;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let headerIndexes = null;
  const updated = lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      const lowerLine = line.toLowerCase();
      const isHeader = lowerLine.includes('ops/sec (hz)') && lowerLine.includes('mean (ms)');
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
}
