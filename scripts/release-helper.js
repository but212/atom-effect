import fs from 'node:fs';
import path from 'node:path';

const version = (process.env.GITHUB_REF_NAME ?? '').replace(/^v/, '');
if (!version) {
  console.error('x GITHUB_REF_NAME environment variable not set or invalid.');
  process.exit(1);
}

// 1. Verify root and sub-package versions
const verifyVersion = (filePath, name, force = false) => {
  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if ((force || !pkg.private) && pkg.version !== version) {
    console.error(`x Version mismatch in ${name}: ${pkg.version} !== ${version}`);
    process.exit(1);
  }
};

verifyVersion('package.json', 'root', true);
for (const dir of fs.readdirSync('packages')) {
  const pkgPath = path.join('packages', dir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    verifyVersion(pkgPath, dir);
  }
}

// 2. Extract release notes
const changelog = fs.readFileSync('CHANGELOG.md', 'utf8');
const sections = changelog.split(/(?=^## \[)/m);
const target = sections.find((s) => s.startsWith(`## [${version}]`));

if (!target) {
  console.error(`x Changelog entry for ${version} not found`);
  process.exit(1);
}

fs.writeFileSync('RELEASE_NOTES.md', target.replace(/^## \[.*?\]\n?/, '').trim());
console.log(`✓ RELEASE_NOTES.md generated for v${version}`);
