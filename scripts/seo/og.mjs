// Build-time share-image renderer. Turns the SVG cards from src/seo/ogCard.js
// into PNGs with @resvg/resvg-js, using the TTFs in scripts/seo/fonts/ (build
// inputs only; nothing here ships to dist/).
//
//   import { renderOgImages, cards, measure } from './og.mjs'
//   const svg = cards.cityCard({...});              // measure pre-bound
//   await renderOgImages([{ path: 'og/city/lisbon.png', svg }], { outDir: 'dist' })
//
// CLI:
//   node scripts/seo/og.mjs --default public/og.png   # site card, counts from travel-core.json (the build regenerates dist/og.png itself)
//   node scripts/seo/og.mjs --preview                 # sample cards into tmp/og-preview/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { Resvg } from '@resvg/resvg-js';
import * as card from '../../src/seo/ogCard.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FONT_DIR = path.join(HERE, 'fonts');
// Bump to invalidate every cached PNG when the rendering pipeline changes.
const RENDER_VERSION = 'og-1';

const FONT_FILES = fs
  .readdirSync(FONT_DIR)
  .filter((f) => f.endsWith('.ttf'))
  .sort()
  .map((f) => path.join(FONT_DIR, f));

const resvgVersion = createRequire(import.meta.url)('@resvg/resvg-js/package.json').version;

let signature;
function pipelineSignature() {
  if (!signature) {
    const h = crypto.createHash('sha1');
    h.update(`${RENDER_VERSION}|resvg ${resvgVersion}|`);
    for (const f of FONT_FILES) h.update(path.basename(f) + '|').update(fs.readFileSync(f));
    signature = h.digest('hex');
  }
  return signature;
}

const fontOptions = {
  fontFiles: FONT_FILES,
  loadSystemFonts: false,
  defaultFontFamily: card.FONT.body
};

// ---- Text measurement ------------------------------------------------------
// Width of `text` in the real font: resvg's ink bounding box of a text-only SVG,
// measured once at a 100px reference size and scaled (glyph widths are linear in
// font size). Cached per (text, family, weight).
// The cache persists in tmp/og-cache/ (keyed by the font/renderer signature):
// measuring is most of a warm build's og time, and the widths only change
// with the fonts.
const REF = 100;
const MEASURE_CACHE = path.join(ROOT, 'tmp', 'og-cache', 'measure.json');
let widthCache;
let widthCacheDirty = false;
function widths() {
  if (!widthCache) {
    widthCache = new Map();
    try {
      const j = JSON.parse(fs.readFileSync(MEASURE_CACHE, 'utf8'));
      if (j.sig === pipelineSignature()) widthCache = new Map(Object.entries(j.widths));
    } catch {}
  }
  return widthCache;
}
function saveWidths() {
  if (!widthCacheDirty) return;
  fs.mkdirSync(path.dirname(MEASURE_CACHE), { recursive: true });
  fs.writeFileSync(MEASURE_CACHE, JSON.stringify({ sig: pipelineSignature(), widths: Object.fromEntries(widthCache) }));
  widthCacheDirty = false;
}
export function measure(text, family, weight, size) {
  text = String(text ?? '');
  if (!text) return 0;
  const key = `${family}|${weight}|${text}`;
  let w = widths().get(key);
  if (w === undefined) {
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="300" viewBox="0 0 4000 300">` +
      `<text x="0" y="200" font-family="${card.esc(family)}" font-weight="${weight}" font-size="${REF}" xml:space="preserve">${card.esc(text)}</text></svg>`;
    const bbox = new Resvg(svg, { font: fontOptions }).getBBox();
    // Ink bbox excludes side bearings; add a little so trailing/leading space and
    // anchors do not collide with neighbours.
    w = bbox ? bbox.width + 0.02 * REF : text.length * REF * 0.55;
    widthCache.set(key, w);
    widthCacheDirty = true;
  }
  return (w * size) / REF;
}

// The four card builders with the accurate measurer pre-bound.
export const cards = {
  defaultCard: (d) => card.defaultCard(d, { measure }),
  cityCard: (d) => card.cityCard(d, { measure }),
  monthCard: (d) => card.monthCard(d, { measure }),
  compareCard: (d) => card.compareCard(d, { measure })
};

export function renderSvg(svg) {
  return new Resvg(svg, {
    font: fontOptions,
    fitTo: { mode: 'width', value: card.W },
    shapeRendering: 2, // geometricPrecision
    textRendering: 2
  })
    .render()
    .asPng();
}

// items: [{ path: 'og/city/lisbon.png', svg }]. Unchanged cards (same svg, fonts,
// renderer) are copied from cacheDir instead of re-rendered.
export async function renderOgImages(items, { outDir, cacheDir = path.join(ROOT, 'tmp', 'og-cache') } = {}) {
  const t0 = performance.now();
  const sig = pipelineSignature();
  fs.mkdirSync(cacheDir, { recursive: true });
  let rendered = 0;
  let cached = 0;
  let bytes = 0;
  for (const it of items) {
    const key = crypto.createHash('sha1').update(sig).update('\0').update(it.svg).digest('hex');
    const cachePath = path.join(cacheDir, key + '.png');
    const dest = path.join(outDir, it.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(cachePath)) {
      fs.copyFileSync(cachePath, dest);
      cached++;
    } else {
      const png = renderSvg(it.svg);
      fs.writeFileSync(cachePath, png);
      fs.writeFileSync(dest, png);
      rendered++;
    }
    bytes += fs.statSync(dest).size;
  }
  saveWidths();
  return { rendered, cached, bytes, ms: Math.round(performance.now() - t0) };
}

// ---- CLI -------------------------------------------------------------------
function loadCore() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/travel-core.json'), 'utf8'));
}

// Balanced-lens Score recomputed from the stored component scores (same formula
// as qolFor in src/lib/data.svelte.js, defaults: women's-safety blend off, floor
// 55 / 0.6). The real build passes the app's own numbers; this exists for the
// --preview and --default CLI so they can run without Vite.
function approxCells(city) {
  const saf = city.safety?.score ?? 50;
  const floor = saf >= 55 ? 1 : 0.6 + 0.4 * (saf / 55);
  return city.months.map((m) => {
    const base = 0.35 * m.weather + 0.24 * saf + 0.18 * m.air + 0.13 * m.seasonScore + 0.1 * m.eventScore;
    const q = Math.max(0, floor * base); // Balanced has no peak penalty
    return { q, band: card.bandOf(q) };
  });
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/ł/g, 'l').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function cityData(c) {
  const cells = approxCells(c);
  const bi = cells.reduce((m, x, i) => (x.q > cells[m].q ? i : m), 0);
  return {
    name: c.name,
    country: c.country,
    region: c.region,
    cells,
    best: { month: MONTHS[bi], q: Math.round(cells[bi].q) },
    fromSolo: '$' + Math.round(Math.min(...c.months.map((m) => m.cost1))).toLocaleString('en-US'),
    safety: c.safety ? { score: c.safety.score, label: c.safety.label } : undefined
  };
}

async function preview() {
  const core = loadCore();
  const by = (n) => core.cities.find((c) => c.name === n);
  const names = [
    'Lisbon', 'Chiang Mai', 'Lake Atitlán (Panajachel)', 'San Miguel de Allende', 'Bali (Canggu/Ubud)',
    'Costa Adeje (Tenerife)', 'Ho Chi Minh City', 'Kraków', 'Sarandë', 'Mérida', 'Málaga', 'Wrocław',
    'Gdańsk', 'Querétaro', 'João Pessoa', 'Medellín', 'Florianópolis'
  ];
  const items = [];
  const missing = [];
  for (const n of names) {
    const c = by(n) ?? core.cities.find((x) => x.name.startsWith(n.split(' (')[0]));
    if (!c) { missing.push(n); continue; }
    items.push({ path: `city-${slug(c.name)}.png`, svg: cards.cityCard(cityData(c)) });
  }
  // Names that may not exist in the catalog: force the long strings through the layout.
  const base = cityData(by('Lisbon') ?? core.cities[0]);
  for (const n of missing) items.push({ path: `city-synthetic-${slug(n)}.png`, svg: cards.cityCard({ ...base, name: n }) });
  items.push({
    path: 'city-synthetic-very-long.png',
    svg: cards.cityCard({ ...base, name: 'Playa del Carmen and the Riviera Maya (Quintana Roo)', country: 'Dominican Republic', region: 'Central America & Caribbean' })
  });

  const monthIdx = (i) => {
    const rows = core.cities.map((c) => {
      const cells = approxCells(c);
      return { c, q: cells[i].q, cost: c.months[i].cost1 };
    });
    rows.sort((a, b) => b.q - a.q);
    return {
      month: MONTHS[i],
      leaders: rows.slice(0, 5).map((r) => ({ name: r.c.name, country: r.c.country, q: r.q, cost: r.cost })),
      great: rows.filter((r) => r.q >= 85).length,
      total: rows.length
    };
  };
  items.push({ path: 'month-june.png', svg: cards.monthCard(monthIdx(5)) });
  items.push({ path: 'month-january.png', svg: cards.monthCard(monthIdx(0)) });
  const m3 = monthIdx(11);
  m3.leaders = m3.leaders.slice(0, 3);
  items.push({ path: 'month-december-3.png', svg: cards.monthCard(m3) });
  const long = monthIdx(8);
  long.leaders[0] = { name: 'Lake Atitlán (Panajachel)', country: 'Guatemala', q: 91, cost: 1420 };
  long.leaders[1] = { name: 'Costa Adeje (Tenerife)', country: 'Spain', q: 88, cost: 1980 };
  items.push({ path: 'month-long-names.png', svg: cards.monthCard(long) });

  const cmp = (an, bn, claim) => {
    const A = by(an), B = by(bn);
    if (!A || !B) return null;
    const ca = approxCells(A), cb = approxCells(B);
    const winMonths = ca.map((x, i) => (x.q > cb[i].q ? i : -1)).filter((i) => i >= 0);
    const avg = (c) => c.months.reduce((s, m) => s + m.cost1, 0) / 12;
    return cards.compareCard({
      a: { name: A.name, cells: ca, cost: Math.round(avg(A)) },
      b: { name: B.name, cells: cb, cost: Math.round(avg(B)) },
      claim: claim ?? `${A.name} scores higher in ${winMonths.length} months and costs ${Math.round((1 - avg(A) / avg(B)) * 100)}% less`,
      winMonths
    });
  };
  for (const [an, bn, file] of [
    ['Lisbon', 'Chiang Mai', 'compare-lisbon-chiang-mai'],
    ['Hoi An', 'Da Nang', 'compare-hoi-an-da-nang'],
    ['Lake Atitlán (Panajachel)', 'San Miguel de Allende', 'compare-long'],
    ['Costa Adeje (Tenerife)', 'Bali (Canggu/Ubud)', 'compare-long-2']
  ]) {
    const svg = cmp(an, bn);
    if (svg) items.push({ path: file + '.png', svg });
  }

  const outDir = path.join(ROOT, 'tmp', 'og-preview');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  for (const it of items) fs.writeFileSync(path.join(outDir, it.path.replace(/\.png$/, '.svg')), it.svg);
  const stats = await renderOgImages(items, { outDir });
  console.log(`preview: ${items.length} cards in ${path.relative(ROOT, outDir)}/`, stats, missing.length ? `(synthetic names: ${missing.join(', ')})` : '');
}

async function writeDefault(dest) {
  const core = loadCore();
  const cityCount = core.cities.length;
  const regionCount = new Set(core.cities.map((c) => c.region)).size;
  // Decorative strip: the real city whose year shows the most Score bands, then
  // the most great months, ties by name (a strip with some spread reads as data).
  // build-seo.mjs makes the same pick from the app's own Scores for dist/og.png,
  // so public/og.png (the committed fallback) stays byte-identical to it.
  const bands = (c) => new Set(approxCells(c).map((x) => x.band)).size;
  const greats = (c) => approxCells(c).filter((x) => x.band === 'great').length;
  const pick = core.cities.slice().sort((a, b) => bands(b) - bands(a) || greats(b) - greats(a) || a.name.localeCompare(b.name))[0];
  const cells = approxCells(pick).map((c) => ({ q: Math.round(c.q), band: c.band }));
  const svg = cards.defaultCard({ cityCount, regionCount, cells });
  const png = renderSvg(svg);
  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
  fs.writeFileSync(dest, png);
  console.log(`wrote ${dest} (${png.length} bytes; ${cityCount} cities, ${regionCount} regions)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--preview')) await preview();
  else if (args.includes('--default')) await writeDefault(args[args.indexOf('--default') + 1] ?? 'public/og.png');
  else console.log('usage: node scripts/seo/og.mjs --preview | --default <out.png>');
}
