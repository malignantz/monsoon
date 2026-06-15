#!/usr/bin/env node
// Enforces the append-only contract on src/lib/cityIds.v1.js — the frozen ID
// table behind shareable itinerary links (?i=…). Fails (exit 1) if:
//   1. a current city has no v1 ID (new cities must be appended),
//   2. the table contains a duplicate slug,
//   3. the table is not append-only vs git HEAD (an entry moved or was removed).
// Run: `npm run check:ids`. See docs/itinerary-sharing.md.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const slug = (n) =>
  n
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Pull the string literals out of the array body (ignores comments/JSDoc).
function parseTable(source) {
  const body = source.slice(source.indexOf('CITY_IDS_V1 = ['));
  const arr = body.slice(body.indexOf('['), body.indexOf('];') + 1);
  return [...arr.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

const errors = [];

const current = parseTable(fs.readFileSync('src/lib/cityIds.v1.js', 'utf8'));

// 2. no duplicates
const seen = new Set();
for (const s of current) {
  if (seen.has(s)) errors.push(`duplicate slug in table: "${s}"`);
  seen.add(s);
}

// 1. every current city is present
const core = require('../src/generated/travel-core.json');
const citySlugs = core.cities.map((c) => slug(c.name));
const tableSet = new Set(current);
for (const s of citySlugs) {
  if (!tableSet.has(s)) errors.push(`city "${s}" has no v1 ID — append it to src/lib/cityIds.v1.js`);
}

// 3. append-only vs HEAD (skip if the file is new this commit)
try {
  const head = parseTable(execSync('git show HEAD:src/lib/cityIds.v1.js', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }));
  head.forEach((s, i) => {
    if (current[i] !== s)
      errors.push(`append-only violation at index ${i}: HEAD has "${s}", now "${current[i] ?? '(missing)'}". Never reorder or remove IDs.`);
  });
} catch {
  // No prior version in git (first introduction) — nothing to diff against.
}

if (errors.length) {
  console.error(`✗ city ID contract failed (${errors.length}):`);
  for (const e of errors) console.error('  • ' + e);
  process.exit(1);
}
console.log(`✓ city ID contract holds — ${current.length} IDs, all ${citySlugs.length} cities covered, append-only.`);
