// Shareable, bookmarkable browse state in the query string.
//
// Params this module owns (all optional; app defaults emit none, so a fresh
// visit stays at a clean URL):
//   view=year            My year (This month is the default; `view=month` only
//                        appears alongside a shared `?i=` route, whose default
//                        surface is My year)
//   m=oct                selected month (omitted when it is the current month)
//   sort=value           Best Value ranking (Highest Score is the default)
//   cw=0.2               Best Value cost weight (the exponent on cost); only
//                        written with sort=value and a non-default weight, and
//                        absent means the default
//   layout=table         table density (cards is the default)
//   region=se-asia,latam region filter, slugged and comma-joined
//   city=<key>           open city sheet (pre-existing, unchanged)
//   compare=lisbon,porto open the comparison (2–3 city keys, comma-joined, in
//                        the order picked); like `city`, it pins `m` so a shared
//                        comparison opens on the sender's month. Always rides on
//                        This month — the comparison opens over the ranking.
//
// Everything else in the query (`i`, `route`, `n`, utm_*, …) is passed through
// untouched, so shared-route and campaign links keep working.
import { MONTHS, slug, snapCostWeight, DEFAULT_COST_WEIGHT } from './data.svelte.js';

const MONTH_PARAMS = MONTHS.map((m) => m.toLowerCase());
const OWNED = ['view', 'm', 'sort', 'cw', 'layout', 'region', 'city', 'compare'];

export function parseMonth(v) {
  if (v == null || v === '') return null;
  const i = MONTH_PARAMS.indexOf(String(v).toLowerCase().slice(0, 3));
  if (i >= 0) return i;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n - 1 : null;
}

export const monthParam = (i) => MONTH_PARAMS[i];

// Read the owned params. Each field is null when absent so callers can fall
// back to saved prefs / defaults field by field.
export function readUrlState(search = location.search, regionList = []) {
  const q = new URLSearchParams(search);
  const view = q.get('view');
  const sort = q.get('sort');
  const layout = q.get('layout');
  const cw = q.has('cw') ? Number(q.get('cw')) : Number.NaN;
  const regionSlugs = (q.get('region') ?? '').split(',').filter(Boolean);
  const bySlug = new Map(regionList.map((r) => [slug(r), r]));
  return {
    view: view === 'year' || view === 'month' ? view : null,
    month: parseMonth(q.get('m')),
    mode: sort === 'value' || sort === 'score' ? (sort === 'value' ? 'value' : 'quality') : null,
    costWeight: Number.isFinite(cw) && cw > 0 && cw <= 1 ? snapCostWeight(cw) : null,
    density: layout === 'table' || layout === 'cards' ? layout : null,
    regions: q.has('region') ? regionSlugs.map((s) => bySlug.get(s)).filter(Boolean) : null,
    city: q.get('city') || null,
    // Raw keys (unvalidated, possibly stale spellings); App canonicalises them
    // against the bundle and decides whether there are enough to open.
    compare: q.has('compare') ? (q.get('compare') ?? '').split(',').map((k) => k.trim()).filter(Boolean) : null
  };
}

// Build path+query for the given state, preserving params we don't own.
export function buildUrl(state, { defaultView = 'month', currentMonth, search = location.search } = {}) {
  const q = new URLSearchParams(search);
  for (const k of OWNED) q.delete(k);
  if (state.view !== defaultView) q.set('view', state.view);
  const compare = state.view === 'month' && state.compare?.length ? state.compare : null;
  if (compare) q.set('compare', compare.join(','));
  if (state.city) q.set('city', state.city);
  // A city or comparison link always pins its month, so a shared sheet opens on
  // the month the sharer was looking at; list views only pin a non-current month.
  if (state.city || compare || (state.view === 'month' && state.month !== currentMonth)) q.set('m', monthParam(state.month));
  if (state.view === 'month') {
    if (state.mode === 'value') {
      q.set('sort', 'value');
      if (Number.isFinite(state.costWeight) && state.costWeight !== DEFAULT_COST_WEIGHT) q.set('cw', String(state.costWeight));
    }
    if (state.density === 'table') q.set('layout', 'table');
    const regions = [...(state.regions ?? [])]; // Set or array
    if (regions.length) q.set('region', regions.map(slug).sort().join(','));
  }
  const qs = q.toString().replace(/%2C/gi, ',');
  return location.pathname + (qs ? `?${qs}` : '') + location.hash;
}

// Share link for one city's sheet at a given month — what the sheet's Share
// button should emit (?city=<key>&m=<mon>). Clean origin+path, no other state.
export function cityShareUrl(key, month) {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('city', key);
  if (Number.isInteger(month) && month >= 0 && month < 12) u.searchParams.set('m', monthParam(month));
  return u.toString();
}

// Share link for a comparison (?compare=a,b&m=<mon>) — what the comparison's
// Share button emits. Clean origin+path, no other state.
export function compareShareUrl(keys, month) {
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('compare', keys.join(','));
  if (Number.isInteger(month) && month >= 0 && month < 12) u.searchParams.set('m', monthParam(month));
  return u.toString().replace(/%2C/gi, ',');
}
