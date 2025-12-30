# 🚀 Benchmark Quick Start Guide

## 1. Install dependencies

```bash
pnpm install
```

If you don't have tsx:

```bash
pnpm add -D tsx
```

## 2. Run benchmarks

### Full suite (recommended)

```bash
pnpm bench
```

### By category

```bash
# Micro benchmarks (primitive operations)
pnpm bench:micro

# Macro benchmarks (real-world scenarios)
pnpm bench:macro
```

### Individual benchmarks

```bash
pnpm bench:atom        # Atom operations
pnpm bench:computed    # Computed operations
pnpm bench:effect      # Effect operations
pnpm bench:batch       # Batch operations
pnpm bench:diamond     # Diamond dependency problem
pnpm bench:todo        # Todo app
pnpm bench:dashboard   # Dashboard
pnpm bench:graph       # Large graph
```

## 3. View results

### Console output

Results are printed to the console immediately when running benchmarks:

```text
📊 Atom Operations
================================================================================
┌─────────┬───────────────────────┬──────────────┬──────────────┬──────────┬─────────┐
│ (index) │ Benchmark             │ Ops/sec      │ Mean (ms)    │ Margin   │ Samples │
├─────────┼───────────────────────┼──────────────┼──────────────┼──────────┼─────────┤
│    0    │ 'atom creation'       │ '1,234,567'  │ '0.0008'     │ '0.52'   │  1235   │
└─────────┴───────────────────────┴──────────────┴──────────────┴──────────┴─────────┘
```

### Report files

The following files are generated in the `benchmarks/results/` directory:

- `benchmark-YYYY-MM-DD.json` - JSON format
- `benchmark-YYYY-MM-DD.html` - HTML report (open in browser)
- `benchmark-YYYY-MM-DD.md` - Markdown report

## 4. Memory benchmarks

GC-related benchmarks require the `--expose-gc` flag:

```bash
pnpm bench:memory    # Memory leak detection
pnpm bench:gc        # GC pressure measurement
```

## 5. Performance targets

| Task | Target | Description |
|------|--------|-------------|
| Atom creation | < 0.001ms | 1,000 ops/sec or more |
| Atom read | < 0.0001ms | 10,000 ops/sec or more |
| Atom write | < 0.01ms | 100 ops/sec or more |
| Computed recompute | < 0.1ms | Single dependency |
| Diamond (100 nodes) | < 1ms | Complex dependency graph |

## 6. Troubleshooting

### tsx not found

```bash
pnpm add -D tsx
```

### Permission error

If you encounter execution policy issues on Windows PowerShell:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Or use Git Bash or WSL.

### Benchmarks are slow

Run a specific benchmark:

```bash
pnpm bench:atom  # fastest benchmark
```

## 7. Benchmark structure

```text
benchmarks/
├── micro/              # Primitive operation benchmarks
│   ├── atom-operations.bench.ts
│   ├── computed-operations.bench.ts
│   ├── effect-operations.bench.ts
│   └── batch-operations.bench.ts
├── macro/              # Real-world scenario benchmarks
│   ├── diamond-problem.bench.ts
│   ├── todo-app.bench.ts
│   ├── dashboard.bench.ts
│   └── large-graph.bench.ts
├── memory/             # Memory benchmarks
│   ├── leak-detection.bench.ts
│   └── gc-pressure.bench.ts
├── utils/              # Utilities
│   ├── benchmark-runner.ts
│   ├── memory-tracker.ts
│   └── reporter.ts
└── index.ts            # Main entry
```

## 8. Next steps

- 📊 Run all benchmarks: `pnpm bench`
- 📄 Detailed docs: `benchmarks/README.md`
- 🔍 Inspect specific benchmark code: `benchmarks/micro/` or `benchmarks/macro/`

---

**Tip:** For accurate results, avoid running other tasks while benchmarks are running.
