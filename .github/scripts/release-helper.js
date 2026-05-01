import fs from 'node:fs';
import path from 'node:path';

const version = process.env.GITHUB_REF_NAME.replace(/^v/, '');

// 1. Discover and verify packages
const packages = fs
  .readdirSync('packages', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join('packages', d.name))
  .filter((p) => fs.existsSync(path.join(p, 'package.json')));

const mismatches = packages
  .map((p) => ({
    path: p,
    version: JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).version,
  }))
  .filter((pkg) => pkg.version !== version);

if (mismatches.length > 0) {
  mismatches.forEach((m) =>
    console.error(`× Version mismatch: ${m.path} (${m.version}) != ${version}`)
  );
  process.exit(1);
}

// 2. Extract release notes by record splitting
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const sections = changelog.split(/(?=^## \[)/m);
const target = sections.find((s) => s.startsWith(`## [${version}]`));

if (!target) {
  console.error(`× Changelog entry for ${version} not found`);
  process.exit(1);
}

const notes = target.replace(/^## \[.*?\]\n?/, '').trim();
fs.writeFileSync('RELEASE_NOTES.md', notes);
console.log(`✓ RELEASE_NOTES.md generated for v${version}`);

// 3. Output matrix for GHA
const matrix = packages.map((p) => ({
  name: JSON.parse(fs.readFileSync(path.join(p, 'package.json'), 'utf8')).name,
  dir: p,
}));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(matrix)}\n`);
}
