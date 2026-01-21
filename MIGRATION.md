# Migration Guide

## Internal File Structure Changes

The core package has undergone a significant structural refactoring to improve maintainability and performance. If you were importing directly from internal paths (which is discouraged), you may need to update your imports.

### Path Flattening

Several files have been moved to a flatter structure within `src/core`:

| Old Path | New Path |
| ---------- | ---------- |
| `src/core/atom/atom.ts` | `src/core/atom.ts` |
| `src/core/computed/index.ts` | `src/core/computed.ts` |
| `src/core/effect/effect.ts` | `src/core/effect.ts` |
| `src/core/utils/dep-tracking.ts` | `src/core/dep-tracking.ts` |
| `src/internal/scheduler/scheduler.ts` | `src/internal/scheduler.ts` |
| `src/internal/scheduler/batch.ts` | `src/internal/batch.ts` |

### Type Consolidation

All types previously located in `src/types/*.ts` have been merged into a single file: `src/types.ts`.

**Action Required**: Update any deep imports of types to point to the root types file or the main entry point.

```typescript
// Old
import { AtomOptions } from '@but212/atom-effect/src/types/atom';

// New
import { AtomOptions } from '@but212/atom-effect'; 
// Or internal (discouraged)
import { AtomOptions } from '@/types';
```

### Path Aliases

The codebase now uses `@/` as a path alias for `src/`. This change is internal to the package build process and should not affect consumers using the compiled output, but it affects contributors and those running tests.
