import fs from "node:fs";
import path from "node:path";

const version = (process.env.GITHUB_REF_NAME ?? "").replace(/^v/, "");
if (!version) {
  console.error("x GITHUB_REF_NAME environment variable not set or invalid.");
  process.exit(1);
}

// 1. Discover and verify packages
const rootPkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (rootPkg.version !== version) {
  console.error(
    `x Root version mismatch: package.json (${rootPkg.version}) != ${version}`,
  );
  process.exit(1);
}

const packages = fs
  .readdirSync("packages", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => path.join("packages", d.name))
  .filter((p) => fs.existsSync(path.join(p, "package.json")));

const packageDetails = packages.map((p) => {
  const pkg = JSON.parse(fs.readFileSync(path.join(p, "package.json"), "utf8"));
  return {
    path: p,
    name: pkg.name,
    version: pkg.version,
    private: pkg.private === true,
  };
});

// Only verify versions for non-private packages
const publishablePackages = packageDetails.filter((pkg) => !pkg.private);
const mismatches = publishablePackages.filter((pkg) => pkg.version !== version);

if (mismatches.length > 0) {
  mismatches.forEach((m) =>
    console.error(`x Version mismatch: ${m.path} (${m.version}) != ${version}`),
  );
  process.exit(1);
}

// 2. Extract release notes by record splitting
const changelog = fs.readFileSync("CHANGELOG.md", "utf8");
const sections = changelog.split(/(?=^## \[)/m);
const target = sections.find((s) => s.startsWith(`## [${version}]`));

if (!target) {
  console.error(`x Changelog entry for ${version} not found`);
  process.exit(1);
}

const notes = target.replace(/^## \[.*?\]\n?/, "").trim();
fs.writeFileSync("RELEASE_NOTES.md", notes);
console.log(`✓ RELEASE_NOTES.md generated for v${version}`);

// 3. Output matrix for GHA
const matrix = publishablePackages.map(({ name, path: dir }) => ({
  name,
  dir,
}));

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `matrix=${JSON.stringify(matrix)}\n`,
  );
}
