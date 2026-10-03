// Data-derived facts for the static pages. Every sentence a page prints is
// composed from what these functions return — real per-city / per-month values
// run through the app's own scoring (qolFor, band, stripCells, whyNow,
// eventsInMonth, stripSummary). Nothing here re-implements scoring; it only
// ranks, groups and picks.
import { MONTHS, qolFor, band, stripCells, whyNow, eventsInMonth } from '../lib/data.svelte.js';
import { stripSummary } from '../lib/stripSummary.js';
import { monthParam } from '../lib/urlState.js';

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const SITE = 'https://monsoon.fyi';
export const monthSlug = (i) => `where-to-be-in-${MONTHS_LONG[i].toLowerCase()}`;
export const monthPath = (i) => `/best/${monthSlug(i)}/`;
export const cityPath = (key) => `/city/${key}/`;
export const regionSlug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const appCityUrl = (key, i) => `/?city=${encodeURIComponent(key)}&m=${monthParam(i)}`;
export const appMonthUrl = (i) => `/?m=${monthParam(i)}`;
export const APP_YEAR_URL = '/?view=year';

// Cyclic runs of true flags → [[start, len], …] (a Dec→Jan run stays one run).
export function runs(flags) {
  if (flags.every(Boolean)) return [[0, 12]];
  const out = [];
  for (let i = 0; i < 12; i++) {
    if (!flags[i] || flags[(i + 11) % 12]) continue;
    let len = 1;
    while (len < 12 && flags[(i + len) % 12]) len++;
    out.push([i, len]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export const fmtRun = ([s, len]) =>
  len === 12 ? 'all year' : len === 1 ? MONTHS[s] : `${MONTHS[s]}–${MONTHS[(s + len - 1) % 12]}`;

export const fmtRuns = (flags) => runs(flags).map(fmtRun).join(', ');

// [6, 7, 8] (1-based, as events and swim store them) → "Jun–Aug"; [2] → "Feb".
export const monthsText = (months) => fmtRuns(Array.from({ length: 12 }, (_, i) => months?.includes(i + 1) ?? false));

export const hazardText = (m) => m.riskNote || (m.risk >= 2 ? 'Severe hazard season' : 'Elevated hazard season');

// ---- One city, twelve months ----
export function cityYear(city) {
  const cells = stripCells(city, 'balanced');
  const q = cells.map((c) => c.q);
  let best = 0;
  let worst = 0;
  q.forEach((v, i) => {
    if (v > q[best]) best = i;
    if (v < q[worst]) worst = i;
  });

  // Hazard flags, grouped by the note the data carries ("Typhoon season": Aug–Oct).
  const byNote = new Map();
  city.months.forEach((m, i) => {
    if (m.risk >= 1) {
      const t = hazardText(m);
      if (!byNote.has(t)) byNote.set(t, Array(12).fill(false));
      byNote.get(t)[i] = true;
    }
  });
  const hazards = [...byNote].map(([note, flags]) => ({ note, when: fmtRuns(flags), severe: city.months.some((m, i) => flags[i] && m.risk >= 2) }));

  const c1 = city.months.map((m) => m.cost1);
  const c2 = city.months.map((m) => m.cost2);
  const max1 = Math.max(...c1);
  const min1 = Math.min(...c1);
  const cost = {
    solo: [min1, max1],
    couple: [Math.min(...c2), Math.max(...c2)],
    priciest: max1 > min1 ? fmtRuns(c1.map((v) => v === max1)) : null,
    cheapest: max1 > min1 ? fmtRuns(c1.map((v) => v === min1)) : null
  };

  const bands = cells.map((c) => c.band);
  const avoid = bands.includes('bad') ? fmtRuns(bands.map((b) => b === 'bad')) : null;

  return {
    cells,
    q,
    best,
    worst,
    summary: stripSummary(cells),
    standout: bands.some((b) => b === 'great' || b === 'good'),
    avoid,
    hazards,
    cost,
    peakSeason: city.months.some((m) => m.season === 'Peak') ? fmtRuns(city.months.map((m) => m.season === 'Peak')) : null,
    majorEvents: (city.events ?? []).filter((e) => e.tier >= 3)
  };
}

// 3–5 related cities: same region first, ranked by how closely their twelve
// monthly Scores track this city's (mean absolute difference); topped up from
// the nearest profiles elsewhere when the region is small.
export function relatedCities(city, all, n = 4) {
  const qa = stripCells(city).map((c) => c.q);
  const dist = (o) => {
    const qb = stripCells(o).map((c) => c.q);
    return qa.reduce((s, v, i) => s + Math.abs(v - qb[i]), 0) / 12;
  };
  const scored = all.filter((o) => o.key !== city.key).map((o) => ({ city: o, d: dist(o), sameRegion: o.region === city.region }));
  scored.sort((a, b) => a.d - b.d || a.city.name.localeCompare(b.city.name));
  const same = scored.filter((s) => s.sameRegion).slice(0, n);
  const rest = scored.filter((s) => !s.sameRegion).slice(0, Math.max(0, Math.max(3, n) - same.length));
  return [...same, ...rest];
}

// ---- One month, every city ----
const HAZARD_GROUPS = [
  ['Typhoon or hurricane season', /typhoon|hurricane/i],
  ['Heavy rain or flooding', /rain|wet|flood|monsoon/i],
  ['Heat', /heat|hot/i],
  ['Haze or winter smog', /haze|smoke|dust|inversion|fog/i]
];

export function rankMonth(all, mIdx) {
  return all
    .map((c) => ({ city: c, q: qolFor(c, mIdx, 'balanced') }))
    .sort((a, b) => b.q - a.q || a.city.name.localeCompare(b.city.name))
    .map((r, i) => ({ ...r, rank: i + 1, band: band(r.q), m: r.city.months[mIdx], why: whyNow(r.city, mIdx) }));
}

export function monthFacts(ranked, mIdx, topN = 25) {
  const top = ranked.slice(0, topN);
  const great = ranked.filter((r) => r.band === 'great');

  const countBy = (rows) => {
    const n = new Map();
    for (const r of rows) n.set(r.city.region, (n.get(r.city.region) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const leadRegions = countBy(great.length >= 5 ? great : top).slice(0, 2);

  // Hazard flags across all cities this month, grouped by what the note says.
  const groups = HAZARD_GROUPS.map(([label]) => ({ label, cities: [] }));
  const other = { label: 'Other seasonal hazards', cities: [] };
  for (const r of ranked) {
    if (r.m.risk < 1) continue;
    const t = hazardText(r.m);
    const gi = HAZARD_GROUPS.findIndex(([, re]) => re.test(t));
    (gi >= 0 ? groups[gi] : other).cities.push({ ...r, note: t });
  }
  const hazards = [...groups, other].filter((g) => g.cities.length);

  const badAir = ranked.filter((r) => /unhealthy|hazardous/i.test(r.m.airCat ?? ''));

  const festivals = [];
  for (const r of top) {
    const ev = eventsInMonth(r.city, mIdx, 3)[0];
    if (ev) festivals.push({ ...r, event: ev });
  }

  const cheapestTop = [...top].sort((a, b) => a.m.cost1 - b.m.cost1)[0];
  const peakTop = top.filter((r) => r.m.season === 'Peak').length;

  return {
    total: ranked.length,
    great: great.length,
    leader: ranked[0],
    leadRegions,
    hazards,
    badAir,
    festivals,
    cheapestTop,
    peakTop,
    bottom: ranked.slice(-3).reverse()
  };
}
