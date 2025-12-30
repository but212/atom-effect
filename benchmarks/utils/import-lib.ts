/**
 * @fileoverview benchmark library import utility
 * @description dist exists then use built version, else use src
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

const distPath = join(process.cwd(), 'dist', 'index.mjs');
export const useDist = existsSync(distPath);

// dynamic import to get the appropriate path
export const { atom, computed, effect, batch, untracked } = useDist
  ? await import('../../dist/index.mjs')
  : await import('../../src/index.js');
