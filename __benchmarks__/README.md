# Known Issues and Notes

## TypeScript Lint Warnings

The benchmark files currently show some TypeScript lint warnings about return types. These are **safe to ignore** and do not affect functionality:

### Issue

```text
Argument of type '() => number' is not assignable to parameter of type 'BenchFunction'.
Type 'number' is not assignable to type 'void | Promise<void>'.
```

### Explanation

In some benchmarks, we return values from the benchmark function to prevent dead code elimination by the JavaScript engine. For example:

```typescript
bench('example', () => {
  const result = someComputation();
  return result; // Prevents tree-shaking/optimization
});
```

While Vitest expects `void | Promise<void>`, returning values is a common pattern in benchmarking to ensure the code is actually executed. The TypeScript warnings are cosmetic and don't affect benchmark execution.

### Resolution Options

If these warnings need to be resolved:

1. **Use void assertion**: Add `void` before the return

   ```typescript
   bench('example', () => {
     void someComputation();
   });
   ```

2. **Assign to variable**: Store result without returning

   ```typescript
   bench('example', () => {
     let _result = someComputation();
   });
   ```

3. **Add type assertion**: Cast the function

   ```typescript
   bench('example', (() => {
     return someComputation();
   }) as any);
   ```

The current implementation prioritizes benchmark accuracy over type strictness, which is an acceptable tradeoff for performance testing.

## Running Benchmarks

The benchmarks are ready to run despite the lint warnings:

```bash
# Run all benchmarks
pnpm bench

# Run specific categories
pnpm bench:micro
pnpm bench:macro

# Performance regression detection
pnpm bench:baseline  # Save current performance baseline
pnpm bench:regression  # Check for regressions
```

## Next Steps

The benchmark suite is complete and functional. To suppress the warnings entirely, you could run benchmarks with:

```bash
# Skip type checking for benchmarks
pnpm bench --no-typecheck
```

Or add a `// @ts-nocheck` comment at the top of benchmark files if desired.
