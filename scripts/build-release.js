#!/usr/bin/env node

/**
 * RedMatrix Release Build Script
 *
 * Automates the full release workflow:
 *   1. Validates and updates the version across all project files
 *   2. Runs frontend and backend test suites
 *   3. Executes a Tauri production build
 *   4. Copies the built installers to the /release directory
 *
 * Usage:
 *   node scripts/build-release.js <version>
 *   npm run release -- <version>
 *
 * Examples:
 *   node scripts/build-release.js 0.8.0
 *   npm run release -- 0.8.0
 *
 * Options:
 *   --skip-tests    Skip running test suites (use with caution)
 *   --help          Show this help message
 */

import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SEMVER_RE = /^\d+\.\d+\.\d+$/;

function log(msg) {
  console.log(`\x1b[36m[release]\x1b[0m ${msg}`);
}

function success(msg) {
  console.log(`\x1b[32m[release]\x1b[0m ✔ ${msg}`);
}

function error(msg) {
  console.error(`\x1b[31m[release]\x1b[0m ✖ ${msg}`);
  process.exit(1);
}

function run(cmd, opts = {}) {
  log(`Running: ${cmd}`);
  try {
    execSync(cmd, {
      cwd: opts.cwd || ROOT,
      stdio: "inherit",
      shell: true,
    });
  } catch (e) {
    error(`Command failed: ${cmd}`);
  }
}

function readFile(relPath) {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

function writeFile(relPath, content) {
  writeFileSync(resolve(ROOT, relPath), content, "utf-8");
}

function replaceInFile(relPath, search, replacement) {
  const content = readFile(relPath);
  if (!search.test ? !content.includes(search) : !search.test(content)) {
    error(`Pattern not found in ${relPath}: ${search}`);
  }
  const updated = search.test
    ? content.replace(search, replacement)
    : content.replace(search, replacement);
  writeFile(relPath, updated);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todayCode() {
  return todayStr().replace(/-/g, "");
}

// ─── Version Detection ────────────────────────────────────────────────────────

function detectCurrentVersion() {
  const pkg = JSON.parse(readFile("package.json"));
  return pkg.version;
}

// ─── Version Updaters ─────────────────────────────────────────────────────────

function updatePackageJson(version) {
  const path = "package.json";
  const pkg = JSON.parse(readFile(path));
  pkg.version = version;
  writeFile(path, JSON.stringify(pkg, null, 2) + "\n");
  success(`Updated ${path}`);
}

function updateTauriConf(version) {
  const path = "src-tauri/tauri.conf.json";
  const conf = JSON.parse(readFile(path));
  conf.version = version;
  writeFile(path, JSON.stringify(conf, null, 2) + "\n");
  success(`Updated ${path}`);
}

function updateCargoToml(version) {
  const path = "src-tauri/Cargo.toml";
  replaceInFile(path, /^version = ".*"$/m, `version = "${version}"`);
  success(`Updated ${path}`);
}

function updateAbout(version) {
  const path = "src/components/About.tsx";
  const date = todayCode();
  replaceInFile(path, /v\d+\.\d+\.\d+ \(\d{8}\)/, `v${version} (${date})`);
  success(`Updated ${path}`);
}

function updateFooter(version) {
  const path = "src/components/Footer.tsx";
  replaceInFile(path, /RedMatrix v\d+\.\d+\.\d+-dev/, `RedMatrix v${version}-dev`);
  success(`Updated ${path}`);
}

function updateAppTest(version) {
  const path = "src/App.test.tsx";
  replaceInFile(path, /RedMatrix v\d+\.\d+\.\d+-dev/, `RedMatrix v${version}-dev`);
  success(`Updated ${path}`);
}

function updateChangelog(version) {
  const path = "Changelog.md";
  const content = readFile(path);
  const date = todayStr();

  // If this version already exists in the changelog, just update the date
  const versionEntry = `## [${version}]`;
  if (content.includes(versionEntry)) {
    log(`Changelog already contains ${version}, updating date`);
    replaceInFile(path, new RegExp(`## \\[${version.replace(/\./g, "\\.")}\\] - \\d{4}-\\d{2}-\\d{2}`), `## [${version}] - ${date}`);
  } else {
    // Insert a new entry after [Unreleased]
    const marker = "## [Unreleased]";
    if (!content.includes(marker)) {
      error(`Changelog is missing the "${marker}" section`);
    }
    const newEntry = `${marker}\n\n## [${version}] - ${date}\n\n### Added\n- (describe changes here)\n`;
    const updated = content.replace(marker, newEntry);
    writeFile(path, updated);
  }
  success(`Updated ${path}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
  RedMatrix Release Build Script

  Usage:
    node scripts/build-release.js <version> [options]
    npm run release -- <version> [options]

  Arguments:
    <version>      Semver version string (e.g. 0.8.0)

  Options:
    --skip-tests   Skip frontend and backend test suites
    --help         Show this help message

  Examples:
    node scripts/build-release.js 0.8.0
    node scripts/build-release.js 0.7.1 --skip-tests

  Files updated:
    • package.json
    • src-tauri/tauri.conf.json
    • src-tauri/Cargo.toml
    • src/components/About.tsx
    • src/components/Footer.tsx
    • src/App.test.tsx
    • Changelog.md
  `);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    showHelp();
    process.exit(args.includes("--help") ? 0 : 1);
  }

  const skipTests = args.includes("--skip-tests");
  const version = args.find((a) => !a.startsWith("--"));

  if (!version) {
    error("No version specified. Usage: node scripts/build-release.js <version>");
  }

  if (!SEMVER_RE.test(version)) {
    error(`Invalid version format "${version}". Expected semver (e.g. 0.8.0)`);
  }

  const currentVersion = detectCurrentVersion();
  log(`Current version: ${currentVersion}`);
  log(`Target version:  ${version}`);
  log(`Build date:      ${todayStr()}`);
  console.log("");

  // ── Step 1: Update versions ──────────────────────────────────────────────
  log("Step 1/5: Updating version across all files...");
  updatePackageJson(version);
  updateTauriConf(version);
  updateCargoToml(version);
  updateAbout(version);
  updateFooter(version);
  updateAppTest(version);
  updateChangelog(version);
  console.log("");

  // ── Step 2: Run frontend tests ───────────────────────────────────────────
  if (skipTests) {
    log("Step 2/5: Skipping frontend tests (--skip-tests)");
  } else {
    log("Step 2/5: Running frontend tests...");
    run("npm run test");
    success("Frontend tests passed");
  }
  console.log("");

  // ── Step 3: Run backend tests ────────────────────────────────────────────
  if (skipTests) {
    log("Step 3/5: Skipping backend tests (--skip-tests)");
  } else {
    log("Step 3/5: Running backend tests...");
    run("cargo test", { cwd: resolve(ROOT, "src-tauri") });
    success("Backend tests passed");
  }
  console.log("");

  // ── Step 4: Build Tauri application ──────────────────────────────────────
  log("Step 4/5: Building Tauri application (release mode)...");
  run("npx @tauri-apps/cli build");
  success("Tauri build complete");
  console.log("");

  // ── Step 5: Copy artifacts to release/ ───────────────────────────────────
  log("Step 5/5: Copying release artifacts...");
  const releaseDir = resolve(ROOT, "release");
  if (!existsSync(releaseDir)) {
    mkdirSync(releaseDir, { recursive: true });
  }

  const artifacts = [
    {
      src: "src-tauri/target/release/redmatrix.exe",
      dest: "release/redmatrix.exe",
    },
    {
      src: `src-tauri/target/release/bundle/msi/RedMatrix_${version}_x64_en-US.msi`,
      dest: `release/RedMatrix_${version}_x64_en-US.msi`,
    },
    {
      src: `src-tauri/target/release/bundle/nsis/RedMatrix_${version}_x64-setup.exe`,
      dest: `release/RedMatrix_${version}_x64-setup.exe`,
    },
  ];

  for (const { src, dest } of artifacts) {
    const srcPath = resolve(ROOT, src);
    const destPath = resolve(ROOT, dest);
    if (!existsSync(srcPath)) {
      error(`Build artifact not found: ${src}`);
    }
    copyFileSync(srcPath, destPath);
    success(`Copied ${dest}`);
  }
  console.log("");

  // ── Done ─────────────────────────────────────────────────────────────────
  console.log(`\x1b[32m${"═".repeat(60)}\x1b[0m`);
  console.log(`\x1b[32m  RedMatrix v${version} build complete!\x1b[0m`);
  console.log(`\x1b[32m${"═".repeat(60)}\x1b[0m`);
  console.log("");
  console.log("  Release artifacts:");
  for (const { dest } of artifacts) {
    console.log(`    • ${dest}`);
  }
  console.log("");
}

main();
