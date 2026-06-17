#!/usr/bin/env node
// DESKTOP-MODIFIED: version sync helper. Reads `version` from the root
// package.json (single source of truth) and writes it to version.py in the
// format the FastAPI backend expects: `APP_VERSION = 'vX.Y.Z'`.
//
// Run automatically via `npm run sync:version`, which is the first step of
// both `npm run dev` and `npm run build`. Can also be invoked manually:
//   node scripts/sync-version.js
//
// Exits 0 on success or no-op, 1 if version.py would have been malformed.

const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const packageJsonPath = path.join(projectRoot, 'package.json');
const versionPyPath = path.join(projectRoot, 'version.py');

function fail(message) {
  console.error(`[sync-version] ${message}`);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const rawVersion = pkg.version;
if (typeof rawVersion !== 'string' || rawVersion.length === 0) {
  fail(`package.json "version" is missing or empty: ${JSON.stringify(rawVersion)}`);
}

// Match X.Y.Z where X/Y/Z are non-negative integers. We deliberately do
// NOT accept pre-release tags (e.g. "1.0.0-rc.1") here — the backend's
// version-comparison logic in app/api/common.py strips the leading "v"
// and matches the remote version with the same regex.
const versionMatch = rawVersion.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!versionMatch) {
  fail(`package.json "version" must be exact "X.Y.Z", got: ${JSON.stringify(rawVersion)}`);
}

const expected = `APP_VERSION = 'v${rawVersion}'\n`;
const current = fs.existsSync(versionPyPath)
  ? fs.readFileSync(versionPyPath, 'utf8')
  : '';

if (current === expected) {
  console.log(`[sync-version] version.py already at v${rawVersion}, nothing to do`);
  process.exit(0);
}

fs.writeFileSync(versionPyPath, expected);
console.log(`[sync-version] version.py updated to v${rawVersion}`);
