// Split data/travel-data.json into a two-tier payload:
//   src/generated/travel-core.json   — bundled; everything the list surfaces
//                                      render on first paint
//   src/generated/travel-detail.json — fetched in the background after mount;
//                                      CitySheet-only depth (full safety
//                                      breakdown, narrative, climate table)
// Detail entries align with core entries by array index — both are emitted
// from the same source in the same pass. Fields the app never reads
// (stored qol/qolBase/value, airColor, mo/moNum; visa, which no surface shows
// yet; media, since no photos ship) are dropped from both files;
// data/travel-data.json stays the source of truth for the bake scripts.
//
// Provenance ("where this number comes from", city sheet + methodology):
//   core.sources      — top-level source table {key: {name, url, licence,
//                       window, retrieved, method}} written by the climate/air
//                       pipeline; null until that lands.
//   detail prov       — per-city, per-metric provenance from the same pipeline
//                       (a source key, or {source(s), asOf, confidence, note,
//                       station…}); omitted when absent.
//   detail costProv   — compact summary of data/cost-evidence/<slug>.json,
//                       derived here at build time (display only — the cost
//                       numbers themselves are still baked by build_costs.py).
//   detail month evt  — the per-month events string that drives eventScore,
//                       so the sheet can name what an Events score counts.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE_CITY = [
  'name', 'country', 'region', 'timezone', 'schengen', 'solo', 'couple',
  'rent', 'var', 'util', 'vibe', 'draw', 'english', 'swim', 'events',
  'lat', 'lng'
];
// rain (avg rainy days/mo) is core, not detail: the My Year rain filter and the
// city sheet read it, and they must never depend on the lazy layer.
const CORE_MONTH = [
  'airCat', 'risk', 'riskNote', 'season', 'evtTier',
  'weather', 'air', 'seasonScore', 'eventScore', 'cost1', 'cost2', 'rain'
];
const DETAIL_MONTH = ['high', 'low', 'hum', 'pm25'];

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

// ---- Cost provenance summary (from the cost-evidence store) ----
const COST_LABELS = {
  rent: 'Rent',
  utilities: 'Utilities',
  groceries: 'Groceries',
  diningOut: 'Eating out',
  transit: 'Local transport',
  coworking: 'Coworking',
  simData: 'SIM & data',
  misc: 'Everything else'
};
const CONF_RANK = { low: 0, med: 1, medium: 1, high: 2 };
const DOMAIN_RE = /(?:[a-z0-9-]+\.)+[a-z]{2,}/g;

const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// A component's `source` is free text ("evncoworking.com / numbeo.com Yerevan",
// "Bamboo Routes / Bangkok-Housing.com", "estimated"). The page URLs live in the
// file's evidence[] receipts, so link the first named source that has one.
function linkSource(source, evidence) {
  const text = String(source ?? '').trim();
  const lower = text.toLowerCase();
  const domains = [...new Set(lower.match(DOMAIN_RE) ?? [])].map((d) => d.replace(/^www\./, ''));
  const urls = evidence.map((e) => e?.url).filter((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  for (const d of domains) {
    const hit = urls.find((u) => {
      const h = hostOf(u);
      return h === d || h.endsWith('.' + d) || d.endsWith('.' + h);
    });
    if (hit) return { domain: d, url: hit };
  }
  // Named but not as a domain ("Bamboo Routes" -> bambooroutes.com).
  for (const part of lower.split('/')) {
    const squashed = part.replace(/[^a-z0-9]/g, '');
    if (squashed.length < 6) continue;
    const hit = urls.find((u) => hostOf(u).replace(/[^a-z0-9]/g, '').includes(squashed));
    if (hit) return { domain: hostOf(hit), url: hit };
  }
  return { domain: domains[0] ?? null, url: null };
}

function loadCostProv() {
  const dir = join(root, 'data/cost-evidence');
  const byCity = new Map();
  if (!existsSync(dir)) return byCity;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json') || f.startsWith('_')) continue;
    let ev;
    try {
      ev = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    } catch {
      continue;
    }
    if (!ev?.city || !ev.components) continue;
    const evidence = Array.isArray(ev.evidence) ? ev.evidence : [];
    const comps = Object.entries(ev.components).filter(([k]) => !k.startsWith('_'));
    const dates = comps.map(([, c]) => c.asOf).filter(Boolean).sort();
    const asOf = ev.asOf ?? dates.at(-1) ?? null;
    let lowest = null;
    // Nulls and per-item dates equal to the file's asOf are left out to keep the
    // lazy bundle small; the sheet falls back to the city-level asOf.
    const items = comps.map(([k, c]) => {
      const { domain, url } = linkSource(c.source, evidence);
      const conf = c.confidence in CONF_RANK ? c.confidence : null;
      if (conf && (lowest == null || CONF_RANK[conf] < CONF_RANK[lowest])) lowest = conf;
      const item = { label: COST_LABELS[k] ?? k, usd: Math.round(c.usd ?? 0) };
      const source = domain ?? (String(c.source ?? '').trim() || null);
      if (source) item.source = source;
      if (url) item.url = url;
      if (c.asOf && c.asOf !== asOf) item.asOf = c.asOf;
      if (conf) item.confidence = conf;
      if (c.note) item.note = c.note;
      return item;
    });
    byCity.set(ev.city, { asOf, lowest, items });
  }
  return byCity;
}

// Dates for the methodology page's "refreshed" column, read from the private
// input files at build time (only the dates ship, never the files).
function readMeta(rel, pickDate) {
  try {
    return pickDate(JSON.parse(readFileSync(join(root, rel), 'utf8'))) ?? null;
  } catch {
    return null;
  }
}

const latest = (xs) => xs.filter(Boolean).sort().at(-1) ?? null;

export function splitTravelData() {
  const raw = JSON.parse(readFileSync(join(root, 'data/travel-data.json'), 'utf8'));

  const costProv = loadCostProv();
  const asOf = {
    safety: latest(raw.cities.map((c) => c.safety?.asOf)),
    advisory: latest(raw.cities.map((c) => c.safety?.date)),
    cost: latest([...costProv.values()].map((c) => c.asOf)),
    womens: readMeta('data/wps-community-safety.json', (j) => j._meta?.retrieved),
    swim: readMeta('data/swim-inputs.json', (j) => j._meta?.asOf),
    content: readMeta('data/city-content.json', (j) => j._meta?.asOf)
  };

  const core = {
    settings: raw.settings,
    // Top-level source table; absent until the climate/air pipeline writes it.
    sources: raw.sources ?? null,
    asOf,
    months: raw.months,
    cities: raw.cities.map((c) => ({
      ...pick(c, CORE_CITY),
      // Slim safety: just what qolFor and the list/table views read.
      safety: c.safety && {
        score: c.safety.score,
        label: c.safety.label,
        womensSafety: c.safety.womensSafety && { sub: c.safety.womensSafety.sub }
      },
      months: c.months.map((m) => pick(m, CORE_MONTH))
    }))
  };

  const detail = {
    cities: raw.cities.map((c) => ({
      safety: c.safety,
      drawDetail: c.drawDetail,
      ...(c.prov ? { prov: c.prov } : {}),
      ...(costProv.has(c.name) ? { costProv: costProv.get(c.name) } : {}),
      months: c.months.map((m) => ({
        ...pick(m, DETAIL_MONTH),
        ...(m.events ? { evt: m.events } : {})
      }))
    }))
  };

  const out = join(root, 'src/generated');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'travel-core.json'), JSON.stringify(core));
  writeFileSync(join(out, 'travel-detail.json'), JSON.stringify(detail));
  return { cities: raw.cities.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { cities } = splitTravelData();
  console.log(`split travel-data.json (${cities} cities) -> src/generated/`);
}
