// Leak guard for the static SEO surface (GROWTH_ENGINE_PLAN §3.2 / §7.4).
//
// The generator renders only allowlisted public fields (src/seo/publicData.js).
// This check proves it from the other side: it collects the text of the
// private inputs and fails if any of it appears in a generated page,
// sitemap*.xml or llms.txt. Trees: city/, best/, cities/, compare/ (index.html
// pages only) and og/ (.png only; binary, so only the file type is checked).
//
//   • data/cost-evidence/*.json — component notes, evidence claims & quotes, _doc
//   • data/safety-inputs-v3.json — property / women's / visitor rationale, audit notes
//   • data/cities/*.json         — per-city editorial rationale, research notes, source quotes
//   • data/travel-data.json      — the safety bake `note` string
//
// (The SPA's own lazy JSON bundle in dist/assets is out of scope here; the
// file-name guard in scripts/build.sh covers raw files.)
//
// Usage: node scripts/seo/leak-check.mjs [--out dist]   (exit 1 on a leak)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { GENERATED_TREES } from './trees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.indexOf('--out');
const dist = join(root, outArg > 0 ? process.argv[outArg + 1] : 'dist');
const MIN = 16; // shorter strings ("estimated", "home cooking") are too generic to be evidence of a leak

const markers = new Map(); // text -> where it came from
const add = (s, from) => {
  if (typeof s !== 'string') return;
  const t = s.trim();
  if (t.length >= MIN && !/^https?:\/\//.test(t)) markers.set(t, from);
};
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const evDir = join(root, 'data/cost-evidence');
if (existsSync(evDir)) {
  for (const f of readdirSync(evDir)) {
    if (!f.endsWith('.json')) continue;
    const j = readJson(join(evDir, f));
    for (const c of Object.values(j.components ?? {})) add(c?.note, `cost-evidence/${f} note`);
    for (const e of j.evidence ?? []) {
      add(e?.quote, `cost-evidence/${f} evidence quote`);
      add(e?.claim, `cost-evidence/${f} evidence claim`);
      add(e?.note, `cost-evidence/${f} evidence note`);
    }
    add(j.accomSeasonality?._doc, `cost-evidence/${f} _doc`);
  }
}

const safetyPath = join(root, 'data/safety-inputs-v3.json');
if (existsSync(safetyPath)) {
  for (const [city, v] of Object.entries(readJson(safetyPath))) {
    if (!v || typeof v !== 'object') continue;
    for (const k of ['propertyNote', 'womensSafetyNote', 'touristRationale']) add(v[k], `safety-inputs ${city}.${k}`);
    add(v._audit?.note, `safety-inputs ${city}._audit.note`);
  }
}

// Per-city inputs for cities added through scripts/add_city.py: the editorial
// rationale, research notes and source quotes are private like safety-inputs-v3.
const citiesDir = join(root, 'data/cities');
if (existsSync(citiesDir)) {
  for (const f of readdirSync(citiesDir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    const j = readJson(join(citiesDir, f));
    const sf = j.safety ?? {};
    for (const k of ['propertyNote', 'womensSafetyNote', 'touristRationale']) add(sf[k], `cities/${f} safety.${k}`);
    for (const [k, v] of Object.entries(sf.rationale ?? {})) add(v, `cities/${f} safety.rationale.${k}`);
    add(j.researchNotes, `cities/${f} researchNotes`);
    add(j.season?.rationale, `cities/${f} season.rationale`);
    add(j.english?.rationale, `cities/${f} english.rationale`);
    add(j.climateAir?.notes, `cities/${f} climateAir.notes`);
    const sources = [
      ...(sf.consulted ?? []), ...(j.visaSources ?? []), ...(j.english?.sources ?? []), ...(j.season?.sources ?? []),
      ...(j.hazards ?? []).map((h) => h.source), ...(j.events ?? []).map((e) => e.source), j.swim?.source
    ];
    for (const s of sources) {
      add(s?.quote, `cities/${f} source quote`);
      add(s?.note, `cities/${f} source note`);
    }
  }
}

const tdPath = join(root, 'data/travel-data.json');
if (existsSync(tdPath)) {
  for (const c of readJson(tdPath).cities ?? []) {
    add(c.safety?.note, `travel-data ${c.name} safety.note`);
    add(c.safety?.property?.source, `travel-data ${c.name} safety.property.source`);
    add(c.safety?.tourist?.rationale, `travel-data ${c.name} safety.tourist.rationale`);
  }
}

// Generated SEO outputs.
function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, acc) : acc.push(p);
  }
  return acc;
}
// Every sitemap*.xml (the index and each per-type child) is scanned too.
const sitemaps = existsSync(dist) ? readdirSync(dist).filter((f) => /^sitemap.*\.xml$/.test(f)) : [];
const files = [
  ...GENERATED_TREES.flatMap((d) => walk(join(dist, d))),
  ...[...sitemaps, 'llms.txt'].map((f) => join(dist, f)).filter(existsSync)
];

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const problems = [];
let scanned = 0;

// The share-image PNGs are binary, but their text is built from the og specs in
// src/seo/entry.js. build-seo.mjs writes those specs to tmp/seo/og-text.json
// (gitignored, never deployed); run the same markers over their JSON here so a
// private string can't reach a card either. Absent file (check run without a
// build) just skips this; build.sh always runs build-seo.mjs first.
const ogTextPath = join(root, 'tmp/seo/og-text.json');
if (existsSync(ogTextPath)) {
  const leaves = [];
  const collect = (v) => (typeof v === 'string' ? leaves.push(v) : v && typeof v === 'object' && Object.values(v).forEach(collect));
  collect(JSON.parse(readFileSync(ogTextPath, 'utf8')).map((o) => o.data));
  const ogText = leaves.join('\n');
  for (const [m, from] of markers) {
    if (ogText.includes(m)) problems.push(`share-image data: contains private text from ${from}: "${m.slice(0, 60)}…"`);
  }
  scanned++;
}
for (const f of files) {
  // og/ holds build-time PNG share images and nothing else; they are binary, so
  // there is no text to match, but any other file there is a stray.
  if (f.startsWith(join(dist, 'og') + '/')) {
    if (!f.endsWith('.png')) problems.push(`${relative(root, f)}: only .png files are allowed in og/`);
    continue;
  }
  // compare/ is index.html pages only, like the other page trees.
  if (/^\/(city|best|cities|compare)\//.test('/' + relative(dist, f)) && !f.endsWith('/index.html')) {
    problems.push(`${relative(root, f)}: unexpected non-page file in a generated tree`);
    continue;
  }
  scanned++;
  const text = decode(readFileSync(f, 'utf8'));
  for (const [m, from] of markers) {
    if (text.includes(m)) problems.push(`${relative(root, f)}: contains private text from ${from}: "${m.slice(0, 60)}…"`);
  }
}

if (problems.length) {
  console.error(`[seo leak-check] ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 40)) console.error('  ' + p);
  process.exit(1);
}
console.log(`[seo leak-check] ok — ${scanned} files clean against ${markers.size} private strings`);
