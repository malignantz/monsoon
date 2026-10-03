// Best Value, said in plain words. When the cards are sorted by Best Value, a
// city that ranks high is usually there because it costs less than somewhere
// with the same weather — so say that, instead of leaving a unitless index to
// speak for itself. One sentence, one percentage, never a Score next to it.
//
// The rule, per city, against the other cities in the list being ranked:
//   - If another city scores the same or better AND costs the same or less, this
//     city is beaten on both counts: no label.
//   - Otherwise look at the cities scoring from level up to two points above it
//     (rounded). The reference is the cheapest of those — the cheapest way to
//     get at least this Score elsewhere in the list, not the flashiest. None:
//     no label.
//   - The saving is how much cheaper this city is than that reference. Under 10%
//     is noise: no label.
// All maths goes through data.svelte.js (qolFor, cityCost), so the label always
// agrees with the cards under the same lens, month and party size.
import { qolFor, cityCost } from './data.svelte.js';

// "Bali (Canggu/Ubud)" → "Bali"; a name without a parenthetical is unchanged.
const shortName = (name) => name.replace(/\s*\([^)]*\)\s*$/, '').trim() || name;

// list: the cities currently being ranked (the filtered list), month index,
// preset key. Returns Map<cityKey, label> holding only the cities with an
// honest label.
export function valueWins(list, month, preset) {
  const rows = list.map((c) => ({
    c,
    q: Math.round(qolFor(c, month, preset)),
    cost: cityCost(c.months[month])
  }));

  const wins = new Map();
  for (const r of rows) {
    let beaten = false;
    let ref = null;
    for (const o of rows) {
      if (o === r) continue;
      if (o.q >= r.q && o.cost <= r.cost) {
        beaten = true;
        break;
      }
      if (o.q >= r.q && o.q <= r.q + 2 && (!ref || o.cost < ref.cost)) ref = o;
    }
    if (beaten || !ref || !(ref.cost > 0)) continue;

    const p = Math.round((1 - r.cost / ref.cost) * 100);
    if (p < 10) continue;
    const same = ref.q === r.q ? 'the same score' : 'nearly the same score';
    wins.set(r.c.key, `${p}% cheaper than ${shortName(ref.c.name)} for ${same}`);
  }
  return wins;
}
