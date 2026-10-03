// Days per country over the planned year — a tax-residency planning signal.
//
// Pure (no Svelte, no dataset import) so it runs straight from Node — see
// scripts/test-daycount.mjs. MyYear.svelte supplies the city → country lookup.
//
// Same conventions as schengen.js: the route is a template year of whole-month
// stays, February is 28 days, and every day is counted for real (Jul–Dec is
// 184 days, Jan–Jun 181). A month is counted once per country even if two
// stays somehow overlapped, so the total can never exceed 365.
//
// 183 days in a year is the most common residency trigger, but it is a rule of
// thumb: countries count calendar, fiscal or rolling 12-month years and apply
// other tests (home, family, centre of interests). The UI frames this as a
// planning signal, never as tax advice.
import { MONTH_DAYS } from './schengen.js';

export const RESIDENCY_DAYS = 183;
// From here a country is "approaching" — roughly five months, the point where
// one more month would usually cross 183.
export const RESIDENCY_NEAR = 150;

const stateOf = (days) => (days >= RESIDENCY_DAYS ? 'over' : days >= RESIDENCY_NEAR ? 'near' : 'ok');

function monthsOf(stay) {
  const out = [];
  const len = Math.max(0, Math.min(12, stay.len));
  for (let i = 0; i < len; i++) out.push((stay.start + i) % 12);
  return out;
}

function monthSets(stays, countryOf) {
  const by = new Map();
  for (const s of stays) {
    const country = countryOf(s.key);
    if (!country) continue;
    let set = by.get(country);
    if (!set) by.set(country, (set = new Set()));
    for (const m of monthsOf(s)) set.add(m);
  }
  return by;
}

const daysIn = (set) => {
  let n = 0;
  for (const m of set) n += MONTH_DAYS[m];
  return n;
};

// stays: [{key, start (0-11), len (1-12)}]; countryOf(key) → country name.
//
// Returns every country on the route, most days first (ties by name):
//   { rows: [{ country, days, state: 'ok' | 'near' | 'over' }],
//     top (the longest row, or null), over (rows ≥ 183), near (rows 150–182),
//     state (the worst row's state; 'ok' for an empty route) }
export function countryDays(stays, countryOf) {
  const rows = [...monthSets(stays, countryOf)]
    .map(([country, set]) => {
      const days = daysIn(set);
      return { country, days, state: stateOf(days) };
    })
    .sort((a, b) => b.days - a.days || a.country.localeCompare(b.country));
  const over = rows.filter((r) => r.state === 'over');
  const near = rows.filter((r) => r.state === 'near');
  return {
    rows,
    top: rows[0] ?? null,
    over,
    near,
    state: over.length ? 'over' : near.length ? 'near' : 'ok'
  };
}

// What the candidate `stay` would do to its own country's total if added to
// `stays`: { country, days, added, state }. `added` is the real days the stay
// contributes beyond months that country already holds.
export function countryImpact(stays, stay, countryOf) {
  const country = countryOf(stay.key);
  if (!country) return { country: null, days: 0, added: 0, state: 'ok' };
  const set = monthSets(stays, countryOf).get(country) ?? new Set();
  const before = daysIn(set);
  for (const m of monthsOf(stay)) set.add(m);
  const days = daysIn(set);
  return { country, days, added: days - before, state: stateOf(days) };
}
