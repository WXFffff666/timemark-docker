#!/usr/bin/env node
// verify-pnpm-workflow.mjs
// Checks: no with:version under pnpm/action-setup and packageManager exists
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workflows = ['.github/workflows/ci.yml', '.github/workflows/docker.yml'];

let failed = false;

function checkWorkflow(rel) {
  const p = resolve(root, rel);
  if (!existsSync(p)) {
    console.error(`FAIL: ${rel} not found`);
    failed = true;
    return;
  }
  const content = readFileSync(p, 'utf8');
  const lines = content.split('\n');
  // Find pnpm/action-setup@v4 and look ahead for with: version within same step (until next "- ")
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('pnpm/action-setup')) {
      // collect until next step marker "      - " or end
      let j = i + 1;
      let block = '';
      while (j < lines.length && !/^\s*-\s+(uses|run|name):/.test(lines[j])) {
        block += '\n' + lines[j];
        j++;
      }
      const hasWithVersion = /^\s*with:\s*$/m.test(block) && /^\s*version\s*:/m.test(block);
      if (hasWithVersion) {
        console.error(`FAIL: ${rel}:${i + 1} still has with: version under pnpm/action-setup`);
        console.error(lines.slice(i, j).join('\n'));
        failed = true;
      } else {
        console.log(`PASS: ${rel} — no with:version under pnpm/action-setup`);
      }
      // Also ensure uses line keeps v4 without with
      if (!lines[i].includes('pnpm/action-setup@v4')) {
        console.error(`FAIL: ${rel}:${i + 1} should use pnpm/action-setup@v4`);
        failed = true;
      }
      // Verify Node 22 retained in file
      if (!content.includes("node-version: '22'") && !content.includes('node-version: "22"') && !content.includes("node-version: 22")) {
        console.error(`FAIL: ${rel} missing node-version 22`);
        failed = true;
      }
      if (!content.includes("cache: 'pnpm'") && !content.includes('cache: "pnpm"')) {
        console.error(`FAIL: ${rel} missing cache: pnpm`);
        failed = true;
      }
    }
  }
}

console.log('=== Checking workflows for with:version ===');
for (const w of workflows) checkWorkflow(w);

console.log('\n=== Checking packageManager ===');
const pkgPath = resolve(root, 'package.json');
if (!existsSync(pkgPath)) {
  console.error('FAIL: package.json not found');
  failed = true;
} else {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.packageManager) {
    console.error('FAIL: packageManager missing in package.json');
    failed = true;
  } else if (!/^pnpm@/.test(pkg.packageManager)) {
    console.error(`FAIL: packageManager should be pnpm@x.y.z, got ${pkg.packageManager}`);
    failed = true;
  } else {
    console.log(`PASS: packageManager = ${pkg.packageManager}`);
  }
}

console.log('\n=== Checking lockfileVersion ===');
const lockPath = resolve(root, 'pnpm-lock.yaml');
if (existsSync(lockPath)) {
  const lock = readFileSync(lockPath, 'utf8');
  const m = lock.match(/lockfileVersion:\s*['"]?([^'"\n]+)['"]?/);
  if (m) console.log(`PASS: lockfileVersion = ${m[1].trim()} (should stay 9.0)`);
  if (m && m[1].trim() !== '9.0') {
    console.error(`WARN: lockfileVersion is ${m[1].trim()}, expected 9.0 (do not bump to 10)`);
    // not failing, just warn
  }
}

if (failed) {
  console.error('\nRED: verification FAILED');
  process.exit(1);
} else {
  console.log('\nGREEN: all checks passed');
  process.exit(0);
}
