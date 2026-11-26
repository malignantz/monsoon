// This month's filters, each defined exactly once.
//
// Every surface that shows, counts, clears or applies a filter reads this
// registry: the `filtered` pass in ThisMonth, the desktop filter row and its
// popovers, the applied-filter chips, the phone Refine sheet and its count, the
// empty state, and the URL (urlState.js). Adding a filter is one entry here.
//
// A filter:
//   id         state field in `filterState`
//   key        short query-string key (defaults are never written); null keeps
//              the filter out of the URL
//   label      plain name ("Max budget"); also the Remove chip's noun
//   group      section it sits under (GROUPS below)
//   kind       'toggle' | 'select' | 'multi'
//   options    (ctx) → [{ v, label }] for select/multi; may depend on context
//   default    the "no filter" value
//   isActive   (v) → boolean
//   test       (city, ctx, v) → keep the city?
//   chipLabel  (v, ctx) → the set value in words ("≤ $2,000", "Good air only")
//   short      optional shorter name for the desktop button ("Budget")
//   chipNoun   optional noun the chip puts before a bare value ("Budget: ≤ $2,000")
//   toUrl      (v, ctx) → string | null    fromUrl (str, ctx) → value
//   normalize  (v, ctx) → value, re-snapped after a context change (party,
//              currency, units), always rounding toward the looser filter
//
// ctx = { month, preset, party, currency, units } — see filterCtx().
//
// Values are plain data (arrays, numbers, booleans) so the state object can be
// compared, copied and written to the URL without special cases. Search text is
// deliberately not a filter: it stays local and out of the URL.
import { regions, cities, cityCost, qolFor, swimNow, favorites, prefs, fmtMoney, fmtTemp, MONTHS, slug } from './data.svelte.js';
import { RATES, isCurrency } from './currency.js';
import { RAIN_OPTIONS } from './planner.js';

export const GROUPS = [
  { id: 'show', label: 'Show' },
  { id: 'regions', label: 'Regions' },
  { id: 'budget', label: 'Budget and score' },
  { id: 'weather', label: 'Weather' },
  { id: 'airsafety', label: 'Air and safety' },
  { id: 'stay', label: 'Stay' }
];

// ── Budget: clean round steps in the display currency ──
// The USD ladders (shared with My year) set the range; each currency then gets
// its own even ladder of round amounts over that range, so a euro visitor sees
// €1,500 / €2,000 / €2,500 rather than converted oddments like €1,639. The
// stored value is the USD equivalent, which is what the test compares against.
const USD_LADDER = { solo: [1500, 2000, 2500, 3000], couple: [2000, 2500, 3000, 3500, 4000] };
const BUDGET_STEP = 500;
export function budgetOptions(ctx) {
  const cur = isCurrency(ctx.currency) ? ctx.currency : 'USD';
  const rate = RATES[cur];
  const usd = USD_LADDER[ctx.party] ?? USD_LADDER.solo;
  const lo = Math.max(BUDGET_STEP, Math.round((usd[0] * rate) / BUDGET_STEP) * BUDGET_STEP);
  const hi = Math.max(lo, Math.round((usd.at(-1) * rate) / BUDGET_STEP) * BUDGET_STEP);
  const out = [];
  for (let a = lo; a <= hi; a += BUDGET_STEP) out.push({ v: a / rate, amount: a, label: `≤ ${fmtMoney(a / rate)}` });
  return out;
}

// ── Max daytime high: round steps in the display unit ──
// Highs are stored in °F; the value is kept in °F so it survives a units switch.
const HIGH_STEPS = { F: [75, 80, 85, 90], C: [24, 27, 30, 32] };
const cToF = (c) => (c * 9) / 5 + 32;
const fToC = (f) => ((f - 32) * 5) / 9;
const shownTemp = (f, units) => Math.round(units === 'C' ? fToC(f) : f);
function highOptions(ctx) {
  const u = ctx.units === 'C' ? 'C' : 'F';
  return HIGH_STEPS[u].map((d) => {
    const f = u === 'C' ? cToF(d) : d;
    return { v: f, label: `≤ ${fmtTemp(f)}` };
  });
}

// Score floors share the strip's band vocabulary (great 85+, good 75+, ok 65+).
const SCORE_OPTIONS = [
  { v: 65, label: 'OK (65+)' },
  { v: 75, label: 'Good (75+)' },
  { v: 85, label: 'Great (85+)' }
];

// The safety labels the city sheet shows (scripts/safety_v3.py label_for).
const SAFETY_OPTIONS = [
  { v: 58, label: 'Safe or better (58+)' },
  { v: 70, label: 'Very safe (70+)' }
];

// The month's air category (CAMS PM2.5 bands as shown in the sheet and strip).
const AIR_OK = { good: ['Good'], moderate: ['Good', 'Moderate'] };
const AIR_OPTIONS = [
  { v: 'moderate', label: 'Moderate or better' },
  { v: 'good', label: 'Good air only' }
];

// Ascending (strictest first), like the other ladders; ceilOption needs the order.
const RAIN_STEPS = [...RAIN_OPTIONS].sort((a, b) => a.v - b.v).map((o) => ({ v: o.v, label: `≤ ${o.v} rain days` }));

// Smallest option ≥ v (never stricter than asked); null past the last one.
const near = (a, b) => Math.abs(a - b) < 0.01;
function ceilOption(v, opts) {
  if (v == null) return null;
  const hit = opts.find((o) => o.v >= v - 0.01);
  return hit ? hit.v : null;
}

// "2000" (USD) or "2000eur"; "28c" / "82" (°F) — a number and an optional unit.
function parseAmount(str) {
  const m = /^(\d+(?:\.\d+)?)([a-z]*)$/i.exec(String(str ?? '').trim());
  return m ? { n: Number(m[1]), unit: m[2].toUpperCase() } : null;
}

const toggle = (id, key, label, group, test, chip = label, glyph = null) => ({
  id,
  key,
  label,
  group,
  glyph, // decorative mark beside the text label (aria-hidden)
  kind: 'toggle',
  default: false,
  isActive: (v) => v === true,
  test,
  chipLabel: typeof chip === 'function' ? chip : () => chip,
  toUrl: (v) => (v ? '1' : null),
  fromUrl: (s) => s === '1' || s === 'true'
});

const select = (def) => ({
  kind: 'select',
  default: null,
  isActive: (v) => v != null,
  same: (a, b) => a === b,
  toUrl: (v) => (v == null ? null : String(v)),
  normalize: (v) => v,
  ...def
});

export const FILTERS = [
  // Favorites are the viewer's own, so a shared link must not carry this one:
  // key null keeps it in memory only.
  toggle('favOnly', null, 'Favorites only', 'show', (c) => favorites.has(c.key), 'Favorites'),
  {
    id: 'regions',
    key: 'region', // kept from the first URL scheme: slugged, comma-joined
    label: 'Regions',
    group: 'regions',
    kind: 'multi',
    default: [],
    options: () => regions.map((r) => ({ v: r, label: r })),
    isActive: (v) => v.length > 0,
    test: (c, _ctx, v) => v.includes(c.region),
    chipLabel: (v) => (v.length === 1 ? v[0] : `${v[0]} +${v.length - 1}`),
    toUrl: (v) => (v.length ? v.map(slug).sort().join(',') : null),
    fromUrl: (s) => {
      const want = new Set(s.split(',').filter(Boolean));
      return regions.filter((r) => want.has(slug(r)));
    },
    normalize: (v) => regions.filter((r) => v.includes(r))
  },
  select({
    id: 'maxBudget',
    key: 'b',
    label: 'Max budget',
    short: 'Budget',
    chipNoun: 'Budget',
    legend: (ctx) => `Max budget, ${ctx.party} per month`,
    group: 'budget',
    options: budgetOptions,
    same: (a, b) => a != null && b != null && near(a, b),
    test: (c, ctx, v) => cityCost(c.months[ctx.month]) <= v + 0.01,
    chipLabel: (v) => `≤ ${fmtMoney(v)}`,
    toUrl: (v, ctx) => {
      if (v == null) return null;
      const cur = isCurrency(ctx.currency) ? ctx.currency : 'USD';
      const amount = Math.round(v * RATES[cur]);
      return cur === 'USD' ? String(amount) : `${amount}${cur.toLowerCase()}`;
    },
    fromUrl: (s, ctx) => {
      const p = parseAmount(s);
      if (!p) return null;
      const cur = p.unit && isCurrency(p.unit) ? p.unit : 'USD';
      return ceilOption(p.n / RATES[cur], budgetOptions(ctx));
    },
    normalize: (v, ctx) => ceilOption(v, budgetOptions(ctx))
  }),
  select({
    id: 'minScore',
    key: 'score',
    label: 'Min score',
    short: 'Score',
    chipNoun: 'Score',
    group: 'budget',
    options: () => SCORE_OPTIONS,
    test: (c, ctx, v) => qolFor(c, ctx.month, ctx.preset) >= v,
    chipLabel: (v) => `${SCORE_OPTIONS.find((o) => o.v === v)?.label ?? `${v}+`}`,
    fromUrl: (s) => {
      const n = Number(s);
      return SCORE_OPTIONS.reduce((r, o) => (o.v <= n ? o.v : r), null);
    }
  }),
  toggle('swimOnly', 'swim', 'Swimmable', 'weather', (c, ctx) => swimNow(c, ctx.month), (_v, ctx) => `Swimmable in ${MONTHS[ctx.month]}`, '≋'),
  select({
    id: 'maxHigh',
    key: 'hi',
    label: 'Max daytime high',
    short: 'Daytime high',
    group: 'weather',
    options: highOptions,
    same: (a, b) => a != null && b != null && near(a, b),
    // Compared as displayed, so a city shown at 80°F passes "≤ 80°F".
    test: (c, ctx, v) => {
      const h = c.months[ctx.month].high;
      return h == null || shownTemp(h, ctx.units) <= shownTemp(v, ctx.units);
    },
    chipLabel: (v) => `Highs ≤ ${fmtTemp(v)}`,
    toUrl: (v, ctx) => (v == null ? null : ctx.units === 'C' ? `${Math.round(fToC(v))}c` : String(Math.round(v))),
    fromUrl: (s, ctx) => {
      const p = parseAmount(s);
      if (!p) return null;
      return ceilOption(p.unit === 'C' ? cToF(p.n) : p.n, highOptions(ctx));
    },
    normalize: (v, ctx) => ceilOption(v, highOptions(ctx))
  }),
  select({
    id: 'maxRain',
    key: 'rain',
    label: 'Max rain days',
    short: 'Rain days',
    group: 'weather',
    options: () => RAIN_STEPS,
    test: (c, ctx, v) => {
      const r = c.months[ctx.month].rain;
      return r == null || r <= v;
    },
    chipLabel: (v) => `≤ ${v} rain days`,
    fromUrl: (s) => ceilOption(Number(s), RAIN_STEPS)
  }),
  select({
    id: 'air',
    key: 'air',
    label: 'Air quality',
    short: 'Air',
    group: 'airsafety',
    options: () => AIR_OPTIONS,
    test: (c, ctx, v) => AIR_OK[v].includes(c.months[ctx.month].airCat),
    chipLabel: (v) => (v === 'good' ? 'Good air only' : 'Air moderate or better'),
    fromUrl: (s) => (Object.hasOwn(AIR_OK, s) ? s : null)
  }),
  select({
    id: 'minSafety',
    key: 'safety',
    label: 'Min safety',
    short: 'Safety',
    group: 'airsafety',
    options: () => SAFETY_OPTIONS,
    test: (c, _ctx, v) => (c.safety?.score ?? 0) >= v,
    chipLabel: (v) => (v >= 70 ? 'Very safe' : 'Safe or better'),
    fromUrl: (s) => {
      const n = Number(s);
      return SAFETY_OPTIONS.reduce((r, o) => (o.v <= n ? o.v : r), null);
    }
  }),
  toggle('nonSchengen', 'ns', 'Non-Schengen', 'stay', (c) => !c.schengen, 'Outside Schengen', '◆')
];

export const FILTER_BY_ID = Object.fromEntries(FILTERS.map((f) => [f.id, f]));
export const filtersIn = (group) => FILTERS.filter((f) => f.group === group);

const fresh = (f) => (Array.isArray(f.default) ? [...f.default] : f.default);
export const defaultFilterValues = () => Object.fromEntries(FILTERS.map((f) => [f.id, fresh(f)]));

// The one reactive object holding every filter value.
export const filterState = $state(defaultFilterValues());

// Everything a filter's options, test or label may depend on. Month and lens
// come from the page; party, currency and units from Settings.
export const filterCtx = (month, preset) => ({
  month,
  preset,
  party: prefs.party === 'couple' ? 'couple' : 'solo',
  currency: prefs.currency,
  units: prefs.units
});

// The applied chip's text, also used to name active filters in the empty state.
export function chipText(f, ctx) {
  const v = f.chipLabel(filterState[f.id], ctx);
  return f.chipNoun ? `${f.chipNoun}: ${v}` : v;
}

export const activeFilters = () => FILTERS.filter((f) => f.isActive(filterState[f.id]));
export const activeCount = () => activeFilters().length;

export function clearFilter(id) {
  filterState[id] = fresh(FILTER_BY_ID[id]);
}

export function clearAllFilters() {
  for (const f of FILTERS) filterState[f.id] = fresh(f);
}

export function setFilter(id, v) {
  filterState[id] = v;
}

export function applyFilters(list, ctx) {
  const on = activeFilters();
  if (!on.length) return list;
  return list.filter((c) => on.every((f) => f.test(c, ctx, filterState[f.id])));
}

// Re-snap values whose options depend on context (party, currency, units).
export function normalizeFilters(ctx) {
  for (const f of FILTERS) {
    if (!f.normalize) continue;
    const cur = filterState[f.id];
    const next = f.normalize(cur, ctx);
    const same = Array.isArray(cur) ? next.length === cur.length : f.same ? (cur == null ? next == null : f.same(cur, next)) : cur === next;
    if (!same) filterState[f.id] = next;
  }
}

// ── URL ──
const IN_URL = FILTERS.filter((f) => f.key);
export const FILTER_KEYS = IN_URL.map((f) => f.key);

// Values from a query string; absent keys are left out (callers fall back to
// defaults), so `null` means "no filter params at all".
export function filtersFromQuery(q, ctx) {
  const out = {};
  let any = false;
  for (const f of IN_URL) {
    if (!q.has(f.key)) continue;
    const v = f.fromUrl(q.get(f.key) ?? '', ctx);
    if (f.isActive(v)) {
      out[f.id] = v;
      any = true;
    }
  }
  return any ? out : null;
}

export function writeFiltersToQuery(q, values, ctx) {
  for (const f of IN_URL) {
    q.delete(f.key);
    const v = values?.[f.id];
    if (v == null || !f.isActive(v)) continue;
    const s = f.toUrl(v, ctx);
    if (s != null && s !== '') q.set(f.key, s);
  }
}

// Replace the URL-backed state from parsed URL values (missing ones reset).
// In-memory-only filters (no key) keep their value, e.g. across Back/Forward.
export function loadFilters(values) {
  for (const f of IN_URL) filterState[f.id] = values && values[f.id] !== undefined ? values[f.id] : fresh(f);
}

// Count of cities the registry would keep, for "N of M" lines.
export const totalCities = () => cities.length;
