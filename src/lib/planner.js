// Candidate filters + auto-planner for the My Year surface.
// Depends only on core-tier fields (methodology §9): months[].{cost2,air,risk},
// safety.score, english.tier, swim, schengen — never the lazy detail layer.
import { cities, cityByKey, regions, qolFor, valueFor, schengenCheck, cityCost, MONTHS } from './data.svelte.js';

export const DEFAULT_FILTERS = {
  regions: [...regions], // all selected by default; deselecting one excludes it
  maxCost: '',
  minSafety: '',
  minAir: '',
  maxRain: '', // rainy-days/mo cap; see RAIN_OPTIONS (12 / 8 / 4 = heavy / moderate / light)
  englishOk: false, // keep only cities where English works day-to-day (tier >= 2)
  nonSchengen: false,
  swimOnly: false
};

// Fresh copy so callers can reassign fields without sharing the regions array.
export const defaultFilters = () => structuredClone(DEFAULT_FILTERS);

// The discrete choices offered by the My Year filter dropdowns — the single
// source of truth shared by the UI and the saved-value migration below. Budget
// caps scale with party size (the displayed cost figure is solo or couple).
export const COST_OPTIONS = {
  solo: [1500, 2000, 2500, 3000],
  couple: [2000, 2500, 3000, 3500, 4000]
};
export const SAFETY_OPTIONS = [
  { v: 70, label: 'Fair (70+)' },
  { v: 80, label: 'Safe (80+)' },
  { v: 90, label: 'Very safe (90+)' }
];
export const AIR_OPTIONS = [
  { v: 70, label: 'Mediocre+ (70)' },
  { v: 82, label: 'Moderate+ (82)' },
  { v: 97, label: 'Good only (97)' }
];
// maxRain caps the rainy-days-per-month a kept month may have; listed loosest
// (heavy) to strictest (light), roughly the 75th / 50th / 25th percentile.
export const RAIN_OPTIONS = [
  { v: 12, label: 'Avoid heavy rain (≤12 d/mo)' },
  { v: 8, label: 'Avoid moderate rain (≤8 d/mo)' },
  { v: 4, label: 'Only light rain (≤4 d/mo)' }
];

// A cleared number input binds null rather than '', so normalize before comparing.
export function filtersActive(f) {
  return Object.keys(DEFAULT_FILTERS).some((k) => {
    const d = DEFAULT_FILTERS[k];
    return Array.isArray(d) ? f[k].length !== d.length : (f[k] ?? '') !== d;
  });
}

const num = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};

// Smallest option ≥ v (round up); '' when v exceeds every option.
const ceilTo = (v, opts) => opts.find((o) => o >= v) ?? '';
// Largest option ≤ v (round down); '' when v is below every option.
const floorTo = (v, opts) => opts.reduce((r, o) => (o <= v ? o : r), '');

// Snap saved filter values onto the current dropdown options. A free-typed cap
// like 2350 (from the old number inputs) would otherwise leave the <select>
// blank, so we migrate it to a real option. Direction is chosen to never make a
// saved filter stricter than intended: the budget cap rounds UP to the next
// available cap (2350 → 2500, 1950 → 2000), while min-safety/air round DOWN to
// the nearest floor. Already-valid values and cleared ones pass through.
export function normalizeFilters(f, party = 'solo') {
  const out = { ...f };
  const costOpts = COST_OPTIONS[party] ?? COST_OPTIONS.solo;
  const safetyOpts = SAFETY_OPTIONS.map((o) => o.v);
  const airOpts = AIR_OPTIONS.map((o) => o.v);
  const rainOpts = RAIN_OPTIONS.map((o) => o.v).sort((a, b) => a - b);
  const cost = num(f.maxCost);
  if (cost != null) out.maxCost = ceilTo(cost, costOpts);
  const rain = num(f.maxRain);
  if (rain != null) out.maxRain = ceilTo(rain, rainOpts);
  const saf = num(f.minSafety);
  if (saf != null) out.minSafety = floorTo(saf, safetyOpts);
  const air = num(f.minAir);
  if (air != null) out.minAir = floorTo(air, airOpts);
  return out;
}

// Month-independent criteria.
export function cityPasses(c, f) {
  if (!f.regions.includes(c.region)) return false;
  if (f.nonSchengen && c.schengen) return false;
  if (f.englishOk && (c.english?.tier ?? 0) < 2) return false;
  const ms = num(f.minSafety);
  if (ms != null && (c.safety?.score ?? 0) < ms) return false;
  return true;
}

// Month-dependent criteria.
export function monthPasses(c, mIdx, f) {
  const m = c.months[mIdx];
  const mc = num(f.maxCost);
  if (mc != null && cityCost(m) > mc) return false;
  const ma = num(f.minAir);
  if (ma != null && m.air < ma) return false;
  const mr = num(f.maxRain);
  if (mr != null && m.rain != null && m.rain > mr) return false;
  if (f.swimOnly && !(c.swim?.months?.includes(mIdx + 1) ?? false)) return false;
  return true;
}

export function stayPasses(c, start, len, f) {
  if (!cityPasses(c, f)) return false;
  for (let j = 0; j < len; j++) if (!monthPasses(c, (start + j) % 12, f)) return false;
  return true;
}

const EARTH_R = 6371;

function distKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(s));
}

// Total hop distance over a full cyclic year, including the Dec→Jan leg.
export function routeTravelKm(stays) {
  let km = 0;
  for (let i = 0; i < stays.length; i++) {
    const a = cityByKey.get(stays[i].key);
    const b = cityByKey.get(stays[(i + 1) % stays.length].key);
    if (a?.lat != null && b?.lat != null) km += distKm(a, b);
  }
  return km;
}

// Soft travel penalty, in score points per 1000 km of hop distance. Halved for
// the Best Value objective, whose monthly scores run about half the Score scale.
const TRAVEL_LAMBDA = { off: 0, some: 2, strict: 6 };

const K_PER_SLOT = 12; // candidate cities kept per (start, len) slot
const BEAM = 250;

// Any complete 6-month window inside the filled Jan-anchored prefix with more
// than three Schengen months (>90 of 180 days) is already a violation.
function schengenBlocked(mask, filledTo) {
  for (let i = 0; i + 6 <= filledTo; i++) {
    let n = 0;
    for (let j = 0; j < 6; j++) if (mask & (1 << (i + j))) n++;
    if (n > 3) return true;
  }
  return false;
}

// Beam search for full-year routes: partition Jan→Dec into stays of
// minLen..maxLen months, maximize summed per-month score under the active
// filters, enforce Schengen 90/180 (cyclic check at the end), and return up
// to `count` proposals with mostly-distinct city sets.
export function proposeRoutes(
  filters,
  { preset = 'balanced', objective = 'qol', minLen = 2, maxLen = 4, travel = 'some', count = 3 } = {}
) {
  const scoreFn = objective === 'value' ? valueFor : qolFor;
  const lam = (TRAVEL_LAMBDA[travel] ?? 0) * (objective === 'value' ? 0.5 : 1);
  const hopCost = (fromKey, toKey) => (lam ? (lam * distKm(cityByKey.get(fromKey), cityByKey.get(toKey))) / 1000 : 0);

  const sc = cities
    .filter((c) => cityPasses(c, filters))
    .map((c) => ({
      key: c.key,
      schengen: !!c.schengen,
      m: Array.from({ length: 12 }, (_, i) => (monthPasses(c, i, filters) ? scoreFn(c, i, preset) : -Infinity))
    }));
  if (!sc.length) return { routes: [], reason: 'No city passes the current filters.' };

  const dead = MONTHS.filter((_, m) => !sc.some((s) => s.m[m] > -Infinity));
  if (dead.length) {
    return { routes: [], reason: `No city passes your filters in ${dead.join(', ')} — relax a filter to plan the full year.` };
  }

  // Top candidates for every (start month, stay length) slot.
  const cand = [];
  for (let start = 0; start < 12; start++) {
    cand[start] = [];
    for (let len = minLen; len <= maxLen && start + len <= 12; len++) {
      const rows = [];
      for (const s of sc) {
        let sum = 0;
        for (let j = 0; j < len; j++) sum += s.m[start + j];
        if (sum > -Infinity) rows.push({ key: s.key, len, sum, schengen: s.schengen });
      }
      rows.sort((a, b) => b.sum - a.sum);
      cand[start].push(...rows.slice(0, K_PER_SLOT));
    }
  }

  // State: months filled from Jan, Schengen-month bitmask, last city. Future
  // extensions depend only on that triple, so dedupe keeps the best per triple.
  // With a travel penalty the cyclic Dec→Jan leg also depends on the first
  // city, so it joins the signature.
  let beam = [{ month: 0, stays: [], mask: 0, sum: 0, last: null }];
  while (beam.some((s) => s.month < 12)) {
    const next = [];
    for (const st of beam) {
      if (st.month >= 12) {
        next.push(st);
        continue;
      }
      for (const cd of cand[st.month]) {
        const end = st.month + cd.len;
        const rem = 12 - end;
        if (rem !== 0 && rem < minLen) continue;
        if (cd.key === st.last) continue; // adjacent repeat is just one longer stay
        let mask = st.mask;
        if (cd.schengen) for (let j = st.month; j < end; j++) mask |= 1 << j;
        if (schengenBlocked(mask, end)) continue;
        let sum = st.sum + cd.sum;
        if (st.last) sum -= hopCost(st.last, cd.key);
        // The year is cyclic, so a finished route also pays the Dec→Jan leg.
        if (end === 12 && st.stays.length) sum -= hopCost(cd.key, st.stays[0].key);
        next.push({
          month: end,
          mask,
          sum,
          last: cd.key,
          stays: [...st.stays, { key: cd.key, start: st.month, len: cd.len }]
        });
      }
    }
    next.sort((a, b) => b.sum - a.sum);
    const seen = new Set();
    beam = [];
    for (const st of next) {
      const sig = st.month + ':' + st.mask + ':' + st.last + (lam ? ':' + st.stays[0]?.key : '');
      if (seen.has(sig)) continue;
      seen.add(sig);
      beam.push(st);
      if (beam.length >= BEAM) break;
    }
    if (!beam.length) break;
  }

  // schengenBlocked only covers Jan-anchored windows; the cyclic check
  // catches windows that wrap Dec→Jan.
  const done = beam.filter((s) => s.month === 12 && schengenCheck(s.stays).ok);
  if (!done.length) {
    return {
      routes: [],
      reason: 'No full-year route satisfies the Schengen 90/180 rule with these filters — try non-Schengen cities or shorter stays.'
    };
  }

  const picks = [];
  for (const st of done) {
    const set = new Set(st.stays.map((s) => s.key));
    const similar = picks.some((p) => {
      const ps = new Set(p.stays.map((s) => s.key));
      let inter = 0;
      for (const k of set) if (ps.has(k)) inter++;
      return inter / Math.max(set.size, ps.size) > 0.6;
    });
    if (!similar) picks.push(st);
    if (picks.length >= count) break;
  }
  // If diversity left open slots, backfill with the next-best routes anyway.
  for (const st of done) {
    if (picks.length >= count) break;
    if (!picks.includes(st)) picks.push(st);
  }
  picks.sort((a, b) => b.sum - a.sum);

  return { routes: picks.map((p) => ({ stays: p.stays })), reason: '' };
}
