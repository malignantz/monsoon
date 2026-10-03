// Pairing report: runs the pairing & quality engine (src/seo/pairing.js) over
// the full catalog and writes the review artefacts to tmp/seo/ (gitignored).
//
//   tmp/seo/pairs.csv     every published pair with its verdict and copy
//   tmp/seo/pairs.json    the same, machine-readable (months, axes, full story)
//   tmp/seo/rejected.csv  every frame-eligible pair that failed, and why
//
// Loads modules through Vite's SSR loader exactly like build-seo.mjs does (the
// scoring helpers use Svelte runes and Vite-only imports). Needs no `vite build`
// output, only src/generated/travel-detail.json (npm run build / the app's
// split-data step writes it).
//
// Usage: node scripts/seo/pairing-report.mjs [--set minWinMonths=3 --set axes.score.minMargin=6 ...]
//   --set overrides a GATE value for this run only (threshold tuning).
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = join(root, 'tmp/seo');

const vite = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  plugins: [svelte({ compilerOptions: { css: 'injected' } })]
});

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows) => rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';

let pairs, rejected, stories, GATE, MONTHS;
try {
  const data = await vite.ssrLoadModule('/src/lib/data.svelte.js');
  const pairing = await vite.ssrLoadModule('/src/seo/pairing.js');
  const { publicCity } = await vite.ssrLoadModule('/src/seo/publicData.js');
  const { fmtRuns } = await vite.ssrLoadModule('/src/seo/derive.js');
  const { cities, prefs } = data;
  ({ GATE, MONTHS } = { GATE: pairing.GATE, MONTHS: data.MONTHS });

  // Same deterministic lens as entry.js buildSite.
  prefs.party = 'solo';
  prefs.womensSafety = false;
  prefs.units = 'F';

  // Optional threshold overrides for tuning runs.
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--set') continue;
    const [path, val] = argv[++i].split('=');
    const keys = path.split('.');
    let o = GATE;
    for (const k of keys.slice(0, -1)) o = o[k];
    if (!(keys.at(-1) in o)) throw new Error(`unknown GATE key ${path}`);
    o[keys.at(-1)] = Number(val);
    console.log(`[override] GATE.${path} = ${val}`);
  }

  const detail = JSON.parse(readFileSync(join(root, 'src/generated/travel-detail.json'), 'utf8'));
  if (detail.cities.length !== cities.length) throw new Error('travel-detail.json is out of step with travel-core.json');
  const pubByKey = new Map(cities.map((c, i) => [c.key, publicCity(c, detail.cities[i])]));
  const fame = JSON.parse(readFileSync(join(root, 'data/seo/fame.json'), 'utf8'));

  ({ pairs, rejected } = pairing.selectPairs(cities, pubByKey, fame));
  stories = pairs.map((p) => ({ p, s: pairing.pairStory(p, pubByKey.get(p.subject.key), pubByKey.get(p.anchor.key)) }));

  // Every story must clear the copy gate (>= 2 numeric deltas).
  const thin = stories.filter(({ s }) => s.numericDeltas < 2);
  if (thin.length) throw new Error(`stories under 2 numeric deltas: ${thin.map(({ p }) => p.slug).join(', ')}`);

  const flagsOf = (ms) => fmtRuns(Array.from({ length: 12 }, (_, i) => ms.includes(i)));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'pairs.csv'),
    csv([
      ['slug', 'frame', 'savings_pct', 'win_months', 'anchor_months', 'best_month', 'axes', 'title', 'claim'],
      ...stories.map(({ p, s }) => [
        p.slug, p.frame, Math.round(p.savings * 100), flagsOf(p.winMonths), flagsOf(p.anchorMonths), MONTHS[p.bestMonth],
        p.axes.map((a) => a.key).join('+'), s.title, s.claim
      ])
    ])
  );
  // Machine-readable copy of everything above (for spot-check scripts and the page builder to diff against).
  writeFileSync(
    join(outDir, 'pairs.json'),
    JSON.stringify(
      stories.map(({ p, s }) => ({
        slug: p.slug, subject: p.subject.key, anchor: p.anchor.key, frame: p.frame, savings: p.savings,
        winMonths: p.winMonths, anchorMonths: p.anchorMonths, bestMonth: p.bestMonth,
        months: p.months, axes: p.axes, story: s
      })),
      null, 1
    )
  );
  writeFileSync(join(outDir, 'rejected.csv'), csv([['subject', 'anchor', 'reason'], ...rejected.map((r) => [r.subject, r.anchor, r.reason])]));

  // ---- summary ----
  console.log('\nGATE', JSON.stringify(GATE));
  const subjects = new Set(pairs.map((p) => p.subject.key));
  console.log(`\npairs: ${pairs.length} · subjects: ${subjects.size} · anchors used: ${new Set(pairs.map((p) => p.anchor.key)).size} / ${fame.anchor.length}`);
  const count = (items, f) => {
    const m = new Map();
    for (const it of items) m.set(f(it), (m.get(f(it)) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
  };
  console.log('\nper anchor:', count(pairs, (p) => p.anchor.name).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('per subject: ', count(pairs, (p) => p.subject.name).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('frames:', count(pairs, (p) => p.frame).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('win months:', count(pairs, (p) => p.winMonths.length).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('axes in best month:', count(pairs.flatMap((p) => p.axes), (a) => a.key).map(([k, v]) => `${k} ${v}`).join(', '));
  const kind = (r) => r.reason.replace(/:.*/, '');
  console.log(`\nrejected: ${rejected.length}`, count(rejected, kind).map(([k, v]) => `${k} ${v}`).join(', '));
  // Break the savings reason down by which cost basis failed.
  console.log('  savings basis:', count(rejected.filter((r) => kind(r) === 'savings'), (r) => (/solo base/.test(r.reason) ? 'solo base' : 'annual avg')).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log('  caps:', count(rejected.filter((r) => kind(r) === 'cap'), (r) => (/preferred anchors/.test(r.reason) ? 'subject cap' : 'anchor cap')).map(([k, v]) => `${k} ${v}`).join(', '));

  // 8 samples in full, spread across the list.
  const picks = Array.from({ length: Math.min(8, stories.length) }, (_, i) => stories[Math.floor((i * stories.length) / 8)]);
  console.log('\n---- 8 sample stories ----');
  for (const { p, s } of picks) {
    console.log(`\n${p.slug} [${p.frame}, ${Math.round(p.savings * 100)}% cheaper, wins ${p.winMonths.length}, anchor wins ${p.anchorMonths.length}]`);
    console.log(`  title:      ${s.title}`);
    console.log(`  claim:      ${s.claim}`);
    console.log(`  bestMonth:  ${s.bestMonth.sentence}`);
    console.log(`  findings:   ${s.bestMonth.findings.join(' ')}`);
    console.log(`  events:     ${s.bestMonth.events.join('; ') || '(none)'}`);
    console.log(`  anchorSide: ${s.anchorSide}`);
    console.log(`  evenSide:   ${s.evenSide ?? '(none)'}`);
    console.log(`  deltas:     ${s.numericDeltas}`);
  }
  console.log(`\nwrote ${outDir.replace(root + '/', '')}/pairs.csv, pairs.json, rejected.csv`);
} finally {
  await vite.close();
}
