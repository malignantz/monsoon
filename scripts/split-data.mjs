// Split data/travel-data.json into a two-tier payload (methodology §9):
//   src/generated/travel-core.json   — bundled; everything the list surfaces
//                                      render on first paint
//   src/generated/travel-detail.json — fetched in the background after mount;
//                                      CitySheet-only depth (full safety
//                                      breakdown, narrative, climate table)
// Detail entries align with core entries by array index — both are emitted
// from the same source in the same pass. Fields the app never reads
// (stored qol/qolBase/value, airColor, mo/moNum, per-month events strings)
// are dropped from both files; data/travel-data.json stays the source of
// truth for the bake scripts.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const CORE_CITY = [
  'name', 'country', 'region', 'timezone', 'schengen', 'solo', 'couple',
  'rent', 'var', 'util', 'vibe', 'draw', 'english', 'visa', 'swim', 'events',
  'lat', 'lng'
];
// rain (avg rainy days/mo) is core, not detail: the My Year filters and
// auto-planner read it, and they must never depend on the lazy layer.
const CORE_MONTH = [
  'airCat', 'risk', 'riskNote', 'season', 'evtTier',
  'weather', 'air', 'seasonScore', 'eventScore', 'cost1', 'cost2', 'rain'
];
const DETAIL_MONTH = ['high', 'low', 'hum', 'pm25'];

const pick = (obj, keys) =>
  Object.fromEntries(keys.filter((k) => k in obj).map((k) => [k, obj[k]]));

export function splitTravelData() {
  const raw = JSON.parse(readFileSync(join(root, 'data/travel-data.json'), 'utf8'));

  const core = {
    settings: raw.settings,
    months: raw.months,
    cities: raw.cities.map((c) => ({
      ...pick(c, CORE_CITY),
      // Slim safety: just what qolFor and the list/table views read.
      safety: c.safety && {
        score: c.safety.score,
        label: c.safety.label,
        womensSafety: c.safety.womensSafety && { sub: c.safety.womensSafety.sub }
      },
      months: c.months.map((m) => pick(m, CORE_MONTH))
    }))
  };

  const detail = {
    cities: raw.cities.map((c) => ({
      safety: c.safety,
      drawDetail: c.drawDetail,
      media: c.media,
      months: c.months.map((m) => pick(m, DETAIL_MONTH))
    }))
  };

  const out = join(root, 'src/generated');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'travel-core.json'), JSON.stringify(core));
  writeFileSync(join(out, 'travel-detail.json'), JSON.stringify(detail));
  return { cities: raw.cities.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { cities } = splitTravelData();
  console.log(`split travel-data.json (${cities} cities) -> src/generated/`);
}
