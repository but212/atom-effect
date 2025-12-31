# Benchmark Documentation

Comprehensive benchmarking suite for `@but212/reactive-atom` to measure performance and detect regressions.

## Overview

The benchmark suite consists of:

- **Micro-benchmarks**: Test individual operations (atom, computed, effect, batch, untracked)
- **Macro-benchmarks**: Test real-world scenarios (todo app, data grid, dependency graphs, memory stress)
- **Performance regression detection**: Compare against baseline to catch performance degradations

## Running Benchmarks

### Quick Start

```bash
# Run all benchmarks
pnpm bench

# Run only micro-benchmarks
pnpm bench:micro

# Run only macro-benchmarks
pnpm bench:macro
```

### Specific Benchmarks

```bash
# Run atom benchmarks
pnpm bench:atom

# Run computed benchmarks
pnpm bench:computed

# Run effect benchmarks
pnpm bench:effect
```

## Benchmark Categories

### Micro-Benchmarks

Located in `__benchmarks__/micro/`, these test individual primitive operations:

#### Atom Benchmarks ([atom.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/micro/atom.bench.ts))

- Creation (primitive, object, batch)
- Read operations (value, peek)
- Write operations (single, multiple)
- Subscription management
- Disposal

#### Computed Benchmarks ([computed.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/micro/computed.bench.ts))

- Creation with various dependency counts
- Dependency tracking
- Recomputation efficiency
- Lazy evaluation
- Cache invalidation

#### Effect Benchmarks ([effect.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/micro/effect.bench.ts))

- Creation and execution
- Dependency tracking
- Re-execution on changes
- Cleanup handling
- Disposal

#### Batch Benchmarks ([batch.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/micro/batch.bench.ts))

- Batch vs non-batch updates
- Nested batches
- Batch with computed values

#### Untracked Benchmarks ([untracked.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/micro/untracked.bench.ts))

- Untracked reads
- Mixed tracked/untracked operations
- Performance comparison

### Macro-Benchmarks

Located in `__benchmarks__/macro/`, these test real-world scenarios:

#### Todo App ([todo-app.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/macro/todo-app.bench.ts))

- Create 100 todos
- Toggle completion status
- Filter (all/active/completed)
- Delete todos
- Complete workflow simulation

#### Data Grid ([data-grid.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/macro/data-grid.bench.ts))

- 1000 rows × 10 columns
- Sorting by different fields
- Filtering by department
- Pagination
- Combined operations

#### Dependency Graphs ([dependency-graph.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/macro/dependency-graph.bench.ts))

- Deep chains (100+ levels)
- Wide fan-out (1 → 100 dependents)
- Diamond dependencies
- Pyramid patterns
- Dynamic dependencies

#### Memory Stress ([memory-stress.bench.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/macro/memory-stress.bench.ts))

- Create/dispose 10K atoms
- GC pressure tests
- Memory leak detection
- Object pooling stress
- Large state trees

## Interpreting Results

Benchmark results show:

- **Operations per second (ops/sec)**: Higher is better
- **Mean time**: Average time per operation
- **Margin of error**: Statistical variance
- **Percentiles (p75, p95, p99)**: Distribution of execution times

Example output:

```text
✓ Atom Creation > create atom with primitive value
  2,150,000 ops/sec ±0.5%
  Mean: 0.465μs
  p99: 0.8μs
```

### Performance Targets

Based on README claims:

- Atom creation: ~2M ops/sec
- Computed recomputation: ~339K ops/sec
- Unsubscribe: O(1) complexity

## Performance Regression Detection

### Setting a Baseline

Before making changes, save a performance baseline:

```bash
pnpm bench:baseline
```

This runs all benchmarks and saves results to `.performance/baseline.json` with:

- Timestamp
- Git commit hash
- Node.js version
- All benchmark results

### Checking for Regressions

After making changes, check for performance regressions:

```bash
pnpm bench:regression
```

This will:

1. Run current benchmarks
2. Compare against baseline
3. Report any regressions > 10% degradation
4. Exit with error code if regressions detected

### CI/CD Integration

Add to your CI pipeline:

```yaml
- name: Run benchmarks
  run: pnpm bench

- name: Check performance regression
  run: pnpm bench:regression
```

## Best Practices

### When to Run Benchmarks

- Before and after performance optimizations
- Before releases
- When changing core reactivity logic
- For performance-critical PRs

### Tips for Accurate Results

1. **Close other applications** to reduce system noise
2. **Run multiple times** to ensure consistency
3. **Use same hardware** for baseline comparisons
4. **Warm up JIT compiler** (built into benchmark options)
5. **Monitor memory** during stress tests

### Performance Optimization Workflow

1. Run `pnpm bench:baseline` on main branch
2. Make your changes
3. Run `pnpm bench:regression` to check impact
4. If regressions detected, investigate and optimize
5. Document performance improvements in PR

## Configuration

### Benchmark Options

Configure in [utils/setup.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/__benchmarks__/utils/setup.ts):

- `microBenchOptions`: For micro-benchmarks (1s, 1000 iterations)
- `macroBenchOptions`: For macro-benchmarks (2s, 100 iterations)
- `memoryBenchOptions`: For memory tests (3s, 50 iterations)

### Regression Threshold

Adjust in [scripts/check-regression.ts](file:///c:/Users/redog/Desktop/SJI/project/reactive-atom/scripts/check-regression.ts):

```typescript
const REGRESSION_THRESHOLD = 0.1; // 10% degradation
```

## Troubleshooting

### Benchmarks are flaky

- Increase `warmupTime` and `warmupIterations`
- Close background applications
- Run on dedicated hardware

### Memory benchmarks fail

- Run Node with `--expose-gc` flag:

  ```bash
  node --expose-gc node_modules/.bin/vitest bench
  ```

### Results don't match README claims

- Results vary by hardware and Node.js version
- README claims are from production environment
- Focus on relative performance, not absolute numbers

## Contributing

When adding new benchmarks:

1. Use appropriate options from `utils/setup.ts`
2. Add to correct category (micro/macro)
3. Include descriptive test names
4. Document expected performance characteristics
5. Update this documentation

## References

- [Vitest Benchmarking](https://vitest.dev/guide/features.html#benchmarking)
- [Tinybench](https://github.com/tinylibs/tinybench)
- [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark)
- [Best Practices Blog](https://thecandidstartup.org/2024/06/03/vitest-benchmark.html)
