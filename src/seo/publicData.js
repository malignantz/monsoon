// The Value Floor's public-field allowlist (GROWTH_ENGINE_PLAN §3.2, §7.4).
//
// The static SEO pages render ONLY what passes through publicCity(). Templates
// never see the raw city object or the detail layer: every field a page can
// print is named below, so adding a field to a page means adding it here, on
// purpose. Scoring (qolFor, stripCells, …) still runs on the full core city —
// numbers derived from private inputs are fine; the inputs themselves are not.
//
// Deliberately NOT public here (scripts/seo/leak-check.mjs fails the build if
// any of their text shows up in a generated page):
//   • cost-evidence component notes and evidence receipts (data/cost-evidence)
//   • safety editorial notes: property/women's/visitor rationale, audit notes,
//     the safety `note` bake string (data/safety-inputs-v3.json)
//   • media credits/paths (no photos on these pages yet)

const pick = (obj, keys) =>
  obj ? Object.fromEntries(keys.filter((k) => obj[k] != null).map((k) => [k, obj[k]])) : null;

export const PUBLIC_FIELDS = {
  city: ['key', 'name', 'country', 'region', 'timezone', 'schengen', 'solo', 'couple', 'rent', 'var', 'util', 'vibe', 'draw', 'lat', 'lng'],
  english: ['tier', 'note'],
  swim: ['name', 'months'],
  event: ['name', 'months', 'tier', 'blurb'],
  month: ['airCat', 'risk', 'riskNote', 'season', 'evtTier', 'cost1', 'cost2', 'rain', 'high', 'low', 'pm25'],
  safety: ['score', 'label', 'asOf', 'advisory', 'advisoryLevel', 'date', 'source', 'url'],
  violent: ['sub', 'homicideRate', 'scope', 'source', 'url'],
  subScore: ['sub'], // property / visitor: the number only, never the rationale text
  tourist: ['modifier'],
  womens: ['sub', 'cs', 'dataSource', 'url'],
  drawDetail: ['narrative'],
  // Cost line items: label, amount, where it came from, how sure. No notes.
  costItem: ['label', 'usd', 'source', 'url', 'asOf', 'confidence'],
  costProv: ['asOf', 'lowest']
};

const F = PUBLIC_FIELDS;

// city: the core city from data.svelte.js; detail: its entry in travel-detail.json.
export function publicCity(city, detail = {}) {
  const saf = detail.safety ?? city.safety ?? {};
  const cp = detail.costProv;
  return {
    ...pick(city, F.city),
    english: pick(city.english, F.english),
    swim: pick(city.swim, F.swim),
    events: (city.events ?? []).map((e) => pick(e, F.event)),
    months: city.months.map((m, i) => pick({ ...m, ...(detail.months?.[i] ?? {}) }, F.month)),
    safety: {
      ...pick(saf, F.safety),
      violent: pick(saf.violent, F.violent),
      property: pick(saf.property, F.subScore),
      tourist: pick(saf.tourist, F.tourist),
      womensSafety: pick(saf.womensSafety, F.womens)
    },
    narrative: detail.drawDetail?.narrative ?? null,
    costProv: cp ? { ...pick(cp, F.costProv), items: (cp.items ?? []).map((i) => pick(i, F.costItem)) } : null,
    prov: detail.prov ?? null // provenance records (source keys, dates, stations) — public by design
  };
}
