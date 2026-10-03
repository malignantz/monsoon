// Leak guard for the static SEO surface (GROWTH_ENGINE_PLAN §3.2 / §7.4).
//
// The generator renders only allowlisted public fields (src/seo/publicData.js).
// This check proves it from the other side: it collects the text of the
// private inputs and fails if any of it appears in a generated page,
// sitemap.xml or llms.txt.
//
//   • data/cost-evidence/*.json — component notes, evidence claims & quotes, _doc
//   • data/safety-inputs-v3.json — property / women's / visitor rationale, audit notes
//   • data/travel-data.json      — the safety bake `note` string
//
// (The SPA's own lazy JSON bundle in dist/assets is out of scope here; the
// file-name guard in scripts/build.sh covers raw files.)
//
// Usage: node scripts/seo/leak-check.mjs [--out dist]   (exit 1 on a leak)
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

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
const files = [
  ...['city', 'best', 'cities'].flatMap((d) => walk(join(dist, d))),
  ...['sitemap.xml', 'llms.txt'].map((f) => join(dist, f)).filter(existsSync)
];

const decode = (s) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const problems = [];
for (const f of files) {
  if (/\/(city|best|cities)\//.test(f) && !f.endsWith('/index.html')) {
    problems.push(`${relative(root, f)}: unexpected non-page file in a generated tree`);
    continue;
  }
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
console.log(`[seo leak-check] ok — ${files.length} files clean against ${markers.size} private strings`);
