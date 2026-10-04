// Compare: the in-progress selection (2–3 cities) and the plain-words findings
// the comparison leads with. All maths goes through data.svelte.js (qolFor,
// valueFor, cityCost, stripCells) so a comparison always agrees with the cards,
// the table and the city sheet under the same lens, party and value model.
import { cityByKey, canonicalKey, qolFor, valueFor, cityCost, partyWord, stripCells, fmtMoney, MONTHS } from './data.svelte.js';

export const MAX_COMPARE = 3;

// Session-only: a half-built comparison survives a reload or a trip into a
// city sheet, but a new visit starts clean (sessionStorage, not localStorage).
const SESSION_KEY = 'atlas.compare.v1';

// Renamed cities migrate, unknown keys drop, duplicates collapse, max three.
export function sanitizeCompare(keys) {
  if (!Array.isArray(keys)) return [];
  const out = [];
  for (const raw of keys) {
    if (typeof raw !== 'string') continue;
    const key = canonicalKey(raw.toLowerCase());
    if (!cityByKey.has(key) || out.includes(key)) continue;
    out.push(key);
    if (out.length === MAX_COMPARE) break;
  }
  return out;
}

export function loadCompare() {
  try {
    return sanitizeCompare(JSON.parse(sessionStorage.getItem(SESSION_KEY))?.keys);
  } catch {
    return [];
  }
}

export function saveCompare(keys) {
  try {
    if (keys.length) sessionStorage.setItem(SESSION_KEY, JSON.stringify({ keys }));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}

// Indexes of the best value(s) in a row, or an empty set when the row doesn't
// separate the cities (all equal, or fewer than two comparable values).
// dir: 'high' | 'low'. Values compare as displayed (pass rounded numbers), so
// two cells that read the same are never told apart.
export function bestOf(values, dir) {
  const nums = values.map((v, i) => [v, i]).filter(([v]) => typeof v === 'number' && Number.isFinite(v));
  if (nums.length < 2) return new Set();
  const target = dir === 'low' ? Math.min(...nums.map(([v]) => v)) : Math.max(...nums.map(([v]) => v));
  const winners = nums.filter(([v]) => v === target).map(([, i]) => i);
  return winners.length === nums.length ? new Set() : new Set(winners);
}

const list = (names) =>
  names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

// A few plain sentences that say what the grid shows, in the order a slow
// traveller weighs it: the month's Score, the money, value, the shape of the
// year, then the visa catch. Kept to the differences that actually exist.
export function compareFindings(cities, month, preset, costWeight) {
  if (cities.length < 2) return [];
  const mon = MONTHS[month];
  const party = partyWord() === 'solo' ? 'solo' : 'for a couple';
  const rows = cities.map((c) => ({
    name: c.name,
    q: Math.round(qolFor(c, month, preset)),
    v: valueFor(c, month, preset, costWeight),
    cost: Math.round(cityCost(c.months[month])),
    good: stripCells(c, preset).filter((x) => x.q >= 75).length,
    schengen: !!c.schengen
  }));
  const out = [];

  // Score for the month.
  const byQ = [...rows].sort((a, b) => b.q - a.q);
  const top = byQ.filter((r) => r.q === byQ[0].q);
  if (top.length === rows.length) {
    out.push(`${list(rows.map((r) => r.name))} score the same in ${mon} (${byQ[0].q}).`);
  } else if (top.length > 1) {
    out.push(`${list(top.map((r) => r.name))} tie for the top Score in ${mon} (${byQ[0].q}).`);
  } else if (rows.length === 2) {
    const gap = byQ[0].q - byQ[1].q;
    out.push(`${byQ[0].name} scores ${gap} higher in ${mon}.`);
  } else {
    const rest = byQ.slice(1).map((r) => `${byQ[0].q - r.q} above ${r.name}`);
    out.push(`${byQ[0].name} scores highest in ${mon} — ${list(rest)}.`);
  }

  // Monthly cost for the user's party. Gaps under $25 (US dollars, whatever the
  // display currency) read as "the same".
  const byCost = [...rows].sort((a, b) => a.cost - b.cost);
  const cheap = byCost[0];
  const spread = byCost[byCost.length - 1].cost - cheap.cost;
  if (spread < 25) {
    out.push(`They cost about the same in ${mon}: ${fmtMoney(cheap.cost)}/mo ${party}.`);
  } else if (rows.length === 2) {
    out.push(`${cheap.name} is ${fmtMoney(spread)}/mo cheaper ${party}.`);
  } else {
    const rest = byCost.slice(1).filter((r) => r.cost - cheap.cost >= 25).map((r) => `${fmtMoney(r.cost - cheap.cost)}/mo less than ${r.name}`);
    out.push(`${cheap.name} is the cheapest ${party} — ${list(rest)}.`);
  }

  // Best Value, only when it points somewhere the Score doesn't.
  const byV = [...rows].sort((a, b) => b.v - a.v);
  if (top.length === 1 && byV[0].name !== top[0].name && byV[0].v.toFixed(1) !== byV[1].v.toFixed(1)) {
    out.push(`${byV[0].name} is the ${rows.length === 2 ? 'better' : 'best'} value for ${mon}, though.`);
  }

  // The shape of the year: good-or-great months under the same lens.
  const goods = new Set(rows.map((r) => r.good));
  if (goods.size > 1) {
    const parts = [...rows].sort((a, b) => b.good - a.good).map((r, i) => (i === 0 ? `${r.name} has ${r.good} good-or-great months` : `${r.name} ${r.good}`));
    out.push(`Across the year, ${list(parts)}.`);
  }

  // Schengen: only worth a line when the cities differ.
  const sch = rows.filter((r) => r.schengen);
  if (sch.length && sch.length < rows.length) {
    out.push(
      sch.length === 1
        ? `Only ${sch[0].name} counts toward the Schengen 90/180 limit.`
        : `${list(sch.map((r) => r.name))} count toward Schengen 90/180; ${list(rows.filter((r) => !r.schengen).map((r) => r.name))} doesn't.`
    );
  }

  return out;
}
