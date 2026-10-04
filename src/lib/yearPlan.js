// Pure helpers and copy for the itinerary generator on My Year: the places a
// user can say they must be in, a plain sentence per "Build me a year" style, and
// the one-line "why" shown beside each generated stay and each city-picker row.
//
// Imports only from data.svelte.js (cityByKey, scoring, formatters), so it runs
// straight from Node through Vite's SSR loader — see scripts/check-seeds.mjs.
// Costs are USD (data.svelte.js fmtMoney); copy is plain, sentence-case, specific.
import {
  MONTHS,
  regions,
  cityByKey,
  cityCost,
  qolFor,
  band,
  eventsInMonth,
  fmtMoney,
  stayMonths,
  monthOccupancy,
  schengenCheck
} from './data.svelte.js';

// ---- Anchors: "I must be in <place> in <month>" ----
// Broad groups first (the way people actually say it), then every region as-is.
// Each group keeps only regions the dataset has, and is dropped if none remain.
const GROUPS = [
  { id: 'europe', label: 'Europe', regions: ['E Europe', 'S Europe', 'W Europe', 'N Europe'] },
  { id: 'asia', label: 'Asia', regions: ['SE Asia', 'E Asia', 'W Asia', 'Central Asia'] },
  { id: 'latam', label: 'Latin America', regions: ['LATAM', 'S America'] }
];

export const ANCHOR_PLACES = [
  ...GROUPS.map((g) => ({ ...g, regions: g.regions.filter((r) => regions.includes(r)) })).filter(
    (g) => g.regions.length
  ),
  ...regions.map((r) => ({ id: 'r:' + r, label: r, regions: [r] }))
];

// [{place: id, month: 0-11}] → engine anchors [{month, regions, label}]; unknown ids are skipped.
export function resolveAnchors(list) {
  const out = [];
  for (const a of list ?? []) {
    const place = ANCHOR_PLACES.find((p) => p.id === a?.place);
    if (place) out.push({ month: a.month, regions: [...place.regions], label: place.label });
  }
  return out;
}

// One plain sentence per style: how it picks.
export const STYLE_BLURBS = {
  quality:
    'Each stretch takes the highest-scoring city that keeps the year Schengen-legal and under 183 days in any one country, nudged toward new regions.',
  value: 'Each stretch takes the best Score for the money, with cost weighted by the dial above.',
  festival: 'Like Best quality, but leans toward stretches that land a major festival when the Score is close.',
  nonschengen: 'Only cities outside the Schengen Area, so the 90/180 rule never applies.',
  favorites: 'Only cities you have saved, under the same Schengen and 183-day limits.'
};

// 'Bali (Canggu/Ubud)' → 'Bali'. Names with no trailing parenthetical pass through.
export const shortName = (name) => String(name ?? '').replace(/\s*\([^)]*\)\s*$/, '');

const nameOf = (key) => shortName(cityByKey.get(key)?.name ?? key);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// The headline event of the given months: highest tier first, earliest month on
// ties (months are in the order the stay runs). → { name, month } | null
function topEvent(city, months, minTier) {
  let best = null;
  for (const m of months) {
    const ev = eventsInMonth(city, m, minTier)[0]; // already highest tier first
    if (ev && (!best || ev.tier > best.tier)) best = { name: shortName(ev.name), tier: ev.tier, month: m };
  }
  return best;
}

const listMonths = (ms) => ms.map((m) => MONTHS[m]).join(' and ');

// Why the generator put this stay here: bits joined ' · ', at most four, in the
// order anchor → merit/festival → how it fit → runner-up → new region.
// leg: an entry of planYear().legs. opts: { style, preset }.
export function legWhy(leg, { style = 'quality', preset = 'balanced' } = {}) {
  const c = cityByKey.get(leg.key);
  if (!c) return '';
  const months = stayMonths(leg);
  const bits = [];

  if (leg.anchor) {
    const m = leg.anchorMonth ?? months[0];
    bits.push(`${leg.anchor} in ${MONTHS[m]}, as you asked`);
  }

  const q = Math.round(avg(months.map((m) => qolFor(c, m, preset))));
  const merit =
    style === 'value'
      ? `Score ${q} at ${fmtMoney(avg(months.map((m) => cityCost(c.months[m]))))}/mo`
      : `Score ${q}`;
  const ev = topEvent(c, months, 3);
  const fest = ev ? (leg.len > 1 ? `${ev.name} in ${MONTHS[ev.month]}` : ev.name) : null;
  if (style === 'festival') {
    if (fest) bits.push(fest);
    bits.push(merit);
  } else {
    bits.push(merit);
    if (fest) bits.push(fest);
  }

  if (leg.trimmed) bits.push(`${leg.len} months keeps you under 90/180`);
  else if (leg.kind === 'gap') bits.push(`fills ${MONTHS[leg.start]}`);
  if (leg.stretched?.length) bits.push(`stretched into ${listMonths(leg.stretched)}`);

  bits.push(leg.runnerUp ? `next best: ${nameOf(leg.runnerUp)}` : 'the only city that fit');
  if (leg.newRegion) bits.push('new region for the year');
  return bits.slice(0, 4).join(' · ');
}

const PHASE = { Peak: 'peak season', In: 'in season', Shoulder: 'shoulder season', Off: 'off season' };

// Why THIS candidate is worth adding for the window it would fill, for the My Year
// city-picker rows. prospect: { start, len } | null; stays: the user's current
// stays (may include this very city). At most three bits; '' when nothing is
// worth saying (or there is no window).
export function pickWhy(city, prospect, stays, preset = 'balanced') {
  if (!city || !prospect) return '';
  const months = stayMonths(prospect);
  const bits = [];

  const ev = topEvent(city, months, 2);
  if (ev) bits.push(prospect.len > 1 ? `${ev.name} in ${MONTHS[ev.month]}` : ev.name);

  // Only ever says "cheaper" — a dearer candidate is just not mentioned.
  const occ = monthOccupancy(stays ?? []);
  const nb = occ[(prospect.start + 11) % 12] ?? occ[(prospect.start + prospect.len) % 12];
  const nbCity = nb && nb.key !== city.key ? cityByKey.get(nb.key) : null;
  if (nbCity) {
    const nbCost = avg(stayMonths(nb).map((m) => cityCost(nbCity.months[m])));
    const diff = nbCost - avg(months.map((m) => cityCost(city.months[m])));
    if (diff >= 100) bits.push(`${fmtMoney(diff)}/mo cheaper than your ${shortName(nbCity.name)} stay`);
  }

  if (!city.schengen) {
    const sch = schengenCheck(stays ?? []);
    if (sch.anySchengen && sch.remaining < 30) bits.push('outside Schengen');
  }

  if (months.every((m) => band(qolFor(city, m, preset)) === 'great')) {
    const first = MONTHS[months[0]];
    const last = MONTHS[months[months.length - 1]];
    bits.push(months.length === 1 ? `great in ${first}` : `great all ${first}–${last}`);
  }

  if (stays?.length && !stays.some((s) => cityByKey.get(s.key)?.region === city.region)) {
    bits.push('new region for your year');
  }

  if (!bits.length) {
    const phase = PHASE[city.months[months[0]]?.season];
    if (phase) bits.push(phase);
  }
  return bits.slice(0, 3).join(' · ');
}
