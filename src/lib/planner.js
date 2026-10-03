// Candidate filters for the My Year surface (plus the shared budget-cap options
// This month uses too). Depends only on core-tier fields (see scripts/split-data.mjs):
// months[].{cost1,cost2,air,rain}, safety.score, english.tier, swim, schengen —
// never the lazy detail layer.
import { regions, cityCost } from './data.svelte.js';

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

// Snap a budget cap onto the party's dropdown options, rounding UP so a snap
// never makes the filter stricter (solo 1500 → couple 2000; a cap above every
// option clears to '' = Any). Needed whenever party size changes: the couple
// list doesn't contain the solo caps, so an unsnapped value would keep
// filtering while the <select> showed blank. Cleared values pass through.
export function snapCostCap(v, party = 'solo') {
  const n = num(v);
  return n == null ? v : ceilTo(n, COST_OPTIONS[party] ?? COST_OPTIONS.solo);
}

// Snap saved filter values onto the current dropdown options. A free-typed cap
// like 2350 (from the old number inputs) would otherwise leave the <select>
// blank, so we migrate it to a real option. Direction is chosen to never make a
// saved filter stricter than intended: the budget cap rounds UP to the next
// available cap (2350 → 2500, 1950 → 2000), while min-safety/air round DOWN to
// the nearest floor. Already-valid values and cleared ones pass through. Re-run
// it when party size changes (see snapCostCap).
export function normalizeFilters(f, party = 'solo') {
  const out = { ...f };
  const safetyOpts = SAFETY_OPTIONS.map((o) => o.v);
  const airOpts = AIR_OPTIONS.map((o) => o.v);
  const rainOpts = RAIN_OPTIONS.map((o) => o.v).sort((a, b) => a - b);
  out.maxCost = snapCostCap(f.maxCost, party);
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
