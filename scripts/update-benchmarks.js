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
import { pathToFileURL } from 'node:url';

// biome-ignore lint/suspicious/noControlCharactersInRegex: Required to match and strip ANSI terminal escape sequences
const ansiRegex = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strips ANSI escape sequences from terminal logs/output.
 * @param {string} str The raw string containing ANSI codes.
 * @returns {string} The cleaned plain-text string.
 */
const stripAnsi = (str) => str.replace(ansiRegex, '');

const RAW_RESULT_FILES = [
  'core-macro.txt',
  'core-micro.txt',
  'core-realistic.txt',
  'core-state.txt',
  'jquery-macro.txt',
  'jquery-micro.txt',
  'utils-all.txt',
];

/**
 * Normalizes test case names to enable resilient dictionary mapping.
 * Strips loop factors like `(x10)`, `(x80)`, etc., punctuation, and standardizes whitespace.
 * @param {string} name The original benchmark case name.
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

function parseLegacyResult(line) {
  const parts = line.split(/\s+/);
  const opsSecIdx = parts.lastIndexOf('ops/sec');
  if (opsSecIdx === -1 || opsSecIdx === 0) return null;

  const meanIdx = parts.indexOf('(mean:');
  const p99Idx = parts.indexOf('(p99:');
  return {
    hz: parseFloat(parts[opsSecIdx - 1].replace(/,/g, '')),
    mean: meanIdx === -1 ? NaN : parseFloat(parts[meanIdx + 1]),
    p99: p99Idx === -1 ? NaN : parseFloat(parts[p99Idx + 1]),
    name: parts.slice(0, opsSecIdx - 1).join(' '),
  };
}

function parseVitest5Result(line) {
  // The final 10 columns are statistics; Vitest may append a ranking indicator.
  const parts = line.split(/\s+/);
  const hasRanking = ['fastest', 'slowest'].includes(parts.at(-1));
  const tokens = hasRanking ? parts.slice(0, -1) : parts;
  if (tokens.length < 11) return null;

  const stats = tokens.slice(-10);
  if (!stats[8].includes('%')) return null;

  return {
    hz: parseFloat(stats[0].replace(/,/g, '')),
    mean: parseFloat(stats[3].replace(/,/g, '')),
    p99: parseFloat(stats[5].replace(/,/g, '')),
    name: tokens.slice(0, -10).join(' '),
  };
}

function parseBenchmarkLine(line) {
  const cleanLine = stripAnsi(line).trim();
  if (!cleanLine || /^name\s+hz\b/i.test(cleanLine)) return null;

  const isLegacyResult = cleanLine.includes('(mean:') && cleanLine.includes('(p99:');
  const result = isLegacyResult ? parseLegacyResult(cleanLine) : parseVitest5Result(cleanLine);
  if (!result || Number.isNaN(result.hz) || Number.isNaN(result.mean) || Number.isNaN(result.p99)) {
    return null;
  }

  const name = result.name.replace(/^[·\s]+/, '').trim();
  if (!name) return null;

  return {
    key: normalizeName(name),
    measurement: { hz: result.hz, mean: result.mean, p99: result.p99 },
  };
}

function loadBenchmarkResults(rawResultsRoot) {
  const benchmarkDb = {};
  for (const file of RAW_RESULT_FILES) {
    const filePath = path.join(rawResultsRoot, file);
    if (!fs.existsSync(filePath)) {
      throw new Error(`[IO Error] Required benchmark source file missing: ${file}`);
    }

    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const result = parseBenchmarkLine(line);
      if (result) benchmarkDb[result.key] = result.measurement;
    }
  }
  return benchmarkDb;
}

/**
 * Formats raw Hz values into human-readable throughput notations.
 * @param {number} hz The raw operations per second count.
 * @returns {string} Formatted throughput string (e.g., "5.20M ops/sec", "376.2K ops/sec").
 */
function formatOpsSec(hz) {
  if (hz >= 1000000) return `${(hz / 1000000).toFixed(2)}M ops/sec`;
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}K ops/sec`;
  return `${hz.toFixed(1)} ops/sec`;
}

/**
 * Resolves column positions for required headers, throwing if structure constraints are violated.
 * @param {string} headerLine The raw markdown table header line.
 * @param {string[]} expected Array of expected column header names.
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
      'atomForm O(1) Scaling': { key: 'Update 1 field in 100-field form', format: 'hz' },
    },
  },
  {
    filePath: 'packages/utils/docs/BENCHMARKS.md',
    headers: ['Category', 'Key Metric', 'Value'],
    matchRow: (row) => `${row.Category} | ${row['Key Metric']}`,
    mappings: {
      '**SlotBuffer** | push (small)': { key: 'push (small)', format: 'hz' },
      '**Option** | isSome check': { key: 'isSome', format: 'hz' },
      '**Result** | ok creation': { key: 'Result.ok creation', format: 'hz' },
      '**Type Guard** | isPromise': { key: 'isPromise: native promise', format: 'hz' },
    },
  },
];

// Helper to update a table in place using a list of lines and a specific schema definition
function processTableLines(lines, schema, benchmarkDb) {
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

const DETAILED_DOCS = [
  'packages/core/docs/BENCHMARKS_DETAILED.md',
  'packages/jquery/docs/BENCHMARKS_DETAILED.md',
  'packages/utils/docs/BENCHMARKS_DETAILED.md',
];

function processDetailedTableLines(lines, benchmarkDb) {
  let headerIndexes = null;
  return lines.map((line) => {
    if (line.trim().startsWith('|') && line.includes('|')) {
      const lowerLine = line.toLowerCase();
      const isHeader = lowerLine.includes('ops/sec (hz)') && lowerLine.includes('mean (ms)');
      if (isHeader) {
        const cols = line.split('|').map((c) => c.trim());
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
}

function updateMarkdownFile(workspaceRoot, relativePath, transformLines) {
  const filePath = path.join(workspaceRoot, relativePath);
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const updated = transformLines(lines);
  fs.writeFileSync(filePath, updated.join('\n'), 'utf8');
  console.log(`Updated: ${filePath}`);
}

function updateOverviewDocs(workspaceRoot, benchmarkDb) {
  const filePaths = new Set(OVERVIEW_SCHEMAS.map((schema) => schema.filePath));
  for (const filePath of filePaths) {
    const schemas = OVERVIEW_SCHEMAS.filter((schema) => schema.filePath === filePath);
    updateMarkdownFile(workspaceRoot, filePath, (lines) =>
      schemas.reduce(
        (currentLines, schema) => processTableLines(currentLines, schema, benchmarkDb),
        lines
      )
    );
  }
}

function updateDetailedDocs(workspaceRoot, benchmarkDb) {
  for (const filePath of DETAILED_DOCS) {
    updateMarkdownFile(workspaceRoot, filePath, (lines) =>
      processDetailedTableLines(lines, benchmarkDb)
    );
  }
}

function updateBenchmarkDocs(workspaceRoot, rawResultsRoot) {
  const benchmarkDb = loadBenchmarkResults(rawResultsRoot);
  updateOverviewDocs(workspaceRoot, benchmarkDb);
  updateDetailedDocs(workspaceRoot, benchmarkDb);
}

export function main(argv = process.argv) {
  const workspaceRoot = import.meta.dirname ? path.join(import.meta.dirname, '..') : process.cwd();
  const rawResultsRoot = argv[2] ? path.resolve(argv[2]) : workspaceRoot;
  updateBenchmarkDocs(workspaceRoot, rawResultsRoot);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
