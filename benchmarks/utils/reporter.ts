/**
 * @fileoverview 벤치마크 결과 리포터
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { join } from 'node:path';
import type { BenchmarkResult } from './benchmark-runner';
import type { MemoryDiff } from './memory-tracker';

export interface BenchmarkReport {
  name: string;
  timestamp: number;
  environment: {
    platform: string;
    nodeVersion: string;
    cpus: number;
  };
  results: BenchmarkResult[];
  memory?: MemoryDiff | null;
}

/**
 * benchmark reporter
 */
export class Reporter {
  private reports: BenchmarkReport[] = [];

  /**
   * add report
   */
  addReport(report: BenchmarkReport): void {
    this.reports.push(report);
  }

  /**
   * save json report
   */
  saveJSON(outputPath: string): void {
    const dir = join(process.cwd(), 'benchmarks', 'results');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const filePath = join(dir, outputPath);
    writeFileSync(filePath, JSON.stringify(this.reports, null, 2));
    console.log(`\nReport saved to: ${filePath}`);
  }

  /**
   * save HTML report
   */
  saveHTML(outputPath: string): void {
    const dir = join(process.cwd(), 'benchmarks', 'results');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const html = this.generateHTML();
    const filePath = join(dir, outputPath);
    writeFileSync(filePath, html);
    console.log(`\nHTML Report saved to: ${filePath}`);
  }

  /**
   * generate HTML
   */
  private generateHTML(): string {
    return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Benchmark Results</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      padding: 2rem;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
    }
    h1 {
      color: #60a5fa;
      margin-bottom: 2rem;
      font-size: 2.5rem;
    }
    h2 {
      color: #93c5fd;
      margin: 2rem 0 1rem;
      font-size: 1.8rem;
    }
    .meta {
      background: #1e293b;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      border-left: 4px solid #60a5fa;
    }
    .meta p {
      margin: 0.5rem 0;
      color: #cbd5e1;
    }
    .benchmark-section {
      background: #1e293b;
      padding: 1.5rem;
      border-radius: 8px;
      margin-bottom: 2rem;
      border: 1px solid #334155;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    th {
      background: #334155;
      padding: 1rem;
      text-align: left;
      font-weight: 600;
      color: #f1f5f9;
      border-bottom: 2px solid #60a5fa;
    }
    td {
      padding: 0.875rem 1rem;
      border-bottom: 1px solid #334155;
    }
    tr:hover {
      background: #2d3748;
    }
    .ops {
      color: #34d399;
      font-weight: 600;
    }
    .time {
      color: #fbbf24;
    }
    .fastest {
      background: #065f4633;
      border-left: 3px solid #34d399;
    }
    .slowest {
      background: #7f1d1d33;
      border-left: 3px solid #ef4444;
    }
    .memory {
      background: #1e3a5f;
      padding: 1rem;
      border-radius: 8px;
      margin-top: 1rem;
      border-left: 4px solid #3b82f6;
    }
    .memory p {
      margin: 0.5rem 0;
      color: #cbd5e1;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Reactive Atom Benchmark Results</h1>
    
    ${this.reports
      .map(
        (report) => `
      <div class="benchmark-section">
        <h2>${report.name}</h2>
        <div class="meta">
          <p><strong>Timestamp:</strong> ${new Date(report.timestamp).toLocaleString()}</p>
          <p><strong>Platform:</strong> ${report.environment.platform}</p>
          <p><strong>Node Version:</strong> ${report.environment.nodeVersion}</p>
          <p><strong>CPU Cores:</strong> ${report.environment.cpus}</p>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>Benchmark</th>
              <th>Ops/sec</th>
              <th>Mean (ms)</th>
              <th>Margin (±%)</th>
              <th>Samples</th>
            </tr>
          </thead>
          <tbody>
            ${report.results
              .map((result, _idx) => {
                const fastest = report.results.reduce((max, r) =>
                  r.opsPerSec > max.opsPerSec ? r : max
                );
                const slowest = report.results.reduce((min, r) =>
                  r.opsPerSec < min.opsPerSec ? r : min
                );
                const rowClass =
                  result === fastest ? 'fastest' : result === slowest ? 'slowest' : '';

                return `
              <tr class="${rowClass}">
                <td>${result.name}</td>
                <td class="ops">${result.opsPerSec.toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                <td class="time">${(result.meanTime * 1000).toFixed(4)}</td>
                <td>${result.margin.toFixed(2)}</td>
                <td>${result.samples}</td>
              </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>
        
        ${
          report.memory
            ? `
          <div class="memory">
            <p><strong>Memory Usage:</strong></p>
            <p>Heap Used: ${this.formatBytes(report.memory.heapUsedDiff)}</p>
            <p>Heap Total: ${this.formatBytes(report.memory.heapTotalDiff)}</p>
            <p>External: ${this.formatBytes(report.memory.externalDiff)}</p>
            <p>RSS: ${this.formatBytes(report.memory.rssDiff)}</p>
          </div>
        `
            : ''
        }
      </div>
    `
      )
      .join('')}
  </div>
</body>
</html>`;
  }

  /**
   * bytes to human readable format
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const value = bytes / k ** i;
    const sign = bytes < 0 ? '' : '+';
    return `${sign}${value.toFixed(2)} ${sizes[i]}`;
  }

  /**
   * save markdown report
   */
  saveMarkdown(outputPath: string): void {
    const dir = join(process.cwd(), 'benchmarks', 'results');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const markdown = this.generateMarkdown();
    const filePath = join(dir, outputPath);
    writeFileSync(filePath, markdown);
    console.log(`\nMarkdown Report saved to: ${filePath}`);
  }

  /**
   * generate markdown report
   */
  private generateMarkdown(): string {
    return `# Reactive Atom Benchmark Results

${this.reports
  .map(
    (report) => `
## ${report.name}

**Timestamp:** ${new Date(report.timestamp).toLocaleString()}  
**Platform:** ${report.environment.platform}  
**Node Version:** ${report.environment.nodeVersion}  
**CPU Cores:** ${report.environment.cpus}

| Benchmark | Ops/sec | Mean (ms) | Margin (±%) | Samples |
|-----------|---------|-----------|-------------|---------|
${report.results
  .map(
    (result) =>
      `| ${result.name} | ${result.opsPerSec.toLocaleString('en-US', { maximumFractionDigits: 0 })} | ${(
        result.meanTime * 1000
      ).toFixed(4)} | ${result.margin.toFixed(2)} | ${result.samples} |`
  )
  .join('\n')}

${
  report.memory
    ? `
### Memory Usage

- **Heap Used:** ${this.formatBytes(report.memory.heapUsedDiff)}
- **Heap Total:** ${this.formatBytes(report.memory.heapTotalDiff)}
- **External:** ${this.formatBytes(report.memory.externalDiff)}
- **RSS:** ${this.formatBytes(report.memory.rssDiff)}
`
    : ''
}

---
`
  )
  .join('\n')}

Generated at ${new Date().toISOString()}
`;
  }
}

/**
 * get environment info
 */
export function getEnvironment() {
  return {
    platform: `${process.platform} ${process.arch}`,
    nodeVersion: process.version,
    cpus: cpus().length,
  };
}
