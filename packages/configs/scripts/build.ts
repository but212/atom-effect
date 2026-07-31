import { execSync } from 'node:child_process';
import { rename, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const packageDir = process.cwd();

console.log('[configs:build] Compiling ESM & d.ts...');
execSync('tsc -p tsconfig.build.json', { stdio: 'inherit', cwd: packageDir });

console.log('[configs:build] Compiling CJS...');
execSync('tsc -p tsconfig.build.cjs.json', { stdio: 'inherit', cwd: packageDir });

const cjsFile = resolve(packageDir, 'dist/cjs/index.js');
const targetCjsFile = resolve(packageDir, 'dist/index.cjs');
const cjsDir = resolve(packageDir, 'dist/cjs');

console.log('[configs:build] Post-processing dist/index.cjs...');
await rename(cjsFile, targetCjsFile);
await rm(cjsDir, { recursive: true, force: true });

console.log('[configs:build] Build complete.');
