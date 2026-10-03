// Data-derived facts for the static pages. Every sentence a page prints is
// composed from what these functions return — real per-city / per-month values
// run through the app's own scoring (qolFor, band, stripCells, whyNow,
// eventsInMonth, stripSummary). Nothing here re-implements scoring; it only
// ranks, groups and picks.
import { MONTHS, slug, fmtMoney, qolFor, band, stripCells, whyNow, eventsInMonth } from '../lib/data.svelte.js';
import { stripSummary } from '../lib/stripSummary.js';
import { monthParam } from '../lib/urlState.js';

export const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const SITE = 'https://monsoon.fyi';
export const monthSlug = (i) => `where-to-be-in-${MONTHS_LONG[i].toLowerCase()}`;
export const monthPath = (i) => `/best/${monthSlug(i)}/`;
export const cityPath = (key) => `/city/${key}/`;
export const regionSlug = (r) => r.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
export const appCityUrl = (key, i) => `/?city=${encodeURIComponent(key)}&m=${monthParam(i)}`;
export const appMonthUrl = (i) => `/?m=${monthParam(i)}`;
export const APP_YEAR_URL = '/?view=year';

// Cyclic runs of true flags → [[start, len], …] (a Dec→Jan run stays one run).
export function runs(flags) {
  if (flags.every(Boolean)) return [[0, 12]];
  const out = [];
  for (let i = 0; i < 12; i++) {
    if (!flags[i] || flags[(i + 11) % 12]) continue;
    let len = 1;
    while (len < 12 && flags[(i + len) % 12]) len++;
    out.push([i, len]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

export const fmtRun = ([s, len]) =>
  len === 12 ? 'all year' : len === 1 ? MONTHS[s] : `${MONTHS[s]}–${MONTHS[(s + len - 1) % 12]}`;

export const fmtRuns = (flags) => runs(flags).map(fmtRun).join(', ');

// [6, 7, 8] (1-based, as events and swim store them) → "Jun–Aug"; [2] → "Feb".
export const monthsText = (months) => fmtRuns(Array.from({ length: 12 }, (_, i) => months?.includes(i + 1) ?? false));

export const hazardText = (m) => m.riskNote || (m.risk >= 2 ? 'Severe hazard season' : 'Elevated hazard season');

// ---- One city, twelve months ----
export function cityYear(city) {
  const cells = stripCells(city, 'balanced');
  const q = cells.map((c) => c.q);
  let best = 0;
  let worst = 0;
  q.forEach((v, i) => {
    if (v > q[best]) best = i;
    if (v < q[worst]) worst = i;
  });

  // Hazard flags, grouped by the note the data carries ("Typhoon season": Aug–Oct).
  const byNote = new Map();
  city.months.forEach((m, i) => {
    if (m.risk >= 1) {
      const t = hazardText(m);
      if (!byNote.has(t)) byNote.set(t, Array(12).fill(false));
      byNote.get(t)[i] = true;
    }
  });
  const hazards = [...byNote].map(([note, flags]) => ({ note, when: fmtRuns(flags), severe: city.months.some((m, i) => flags[i] && m.risk >= 2) }));

  const c1 = city.months.map((m) => m.cost1);
  const c2 = city.months.map((m) => m.cost2);
  const max1 = Math.max(...c1);
  const min1 = Math.min(...c1);
  const cost = {
    solo: [min1, max1],
    couple: [Math.min(...c2), Math.max(...c2)],
    priciest: max1 > min1 ? fmtRuns(c1.map((v) => v === max1)) : null,
    cheapest: max1 > min1 ? fmtRuns(c1.map((v) => v === min1)) : null
  };

  const bands = cells.map((c) => c.band);
  const avoid = bands.includes('bad') ? fmtRuns(bands.map((b) => b === 'bad')) : null;

  return {
    cells,
    q,
    best,
    worst,
    summary: stripSummary(cells),
    standout: bands.some((b) => b === 'great' || b === 'good'),
    avoid,
    hazards,
    cost,
    peakSeason: city.months.some((m) => m.season === 'Peak') ? fmtRuns(city.months.map((m) => m.season === 'Peak')) : null,
    majorEvents: (city.events ?? []).filter((e) => e.tier >= 3)
  };
}

// 3–5 related cities: same region first, ranked by how closely their twelve
// monthly Scores track this city's (mean absolute difference); topped up from
// the nearest profiles elsewhere when the region is small.
export function relatedCities(city, all, n = 4) {
  const qa = stripCells(city).map((c) => c.q);
  const dist = (o) => {
    const qb = stripCells(o).map((c) => c.q);
    return qa.reduce((s, v, i) => s + Math.abs(v - qb[i]), 0) / 12;
  };
  const scored = all.filter((o) => o.key !== city.key).map((o) => ({ city: o, d: dist(o), sameRegion: o.region === city.region }));
  scored.sort((a, b) => a.d - b.d || a.city.name.localeCompare(b.city.name));
  const same = scored.filter((s) => s.sameRegion).slice(0, n);
  const rest = scored.filter((s) => !s.sameRegion).slice(0, Math.max(0, Math.max(3, n) - same.length));
  return [...same, ...rest];
}

// ---- One month, every city ----
const HAZARD_GROUPS = [
  ['Typhoon or hurricane season', /typhoon|hurricane/i],
  ['Heavy rain or flooding', /rain|wet|flood|monsoon/i],
  ['Heat', /heat|hot/i],
  ['Haze or winter smog', /haze|smoke|dust|inversion|fog/i]
];

export function rankMonth(all, mIdx) {
  return all
    .map((c) => ({ city: c, q: qolFor(c, mIdx, 'balanced') }))
    .sort((a, b) => b.q - a.q || a.city.name.localeCompare(b.city.name))
    .map((r, i) => ({ ...r, rank: i + 1, band: band(r.q), m: r.city.months[mIdx], why: whyNow(r.city, mIdx) }));
}

export function monthFacts(ranked, mIdx, topN = 25) {
  const top = ranked.slice(0, topN);
  const great = ranked.filter((r) => r.band === 'great');

  const countBy = (rows) => {
    const n = new Map();
    for (const r of rows) n.set(r.city.region, (n.get(r.city.region) ?? 0) + 1);
    return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  const leadRegions = countBy(great.length >= 5 ? great : top).slice(0, 2);

  // Hazard flags across all cities this month, grouped by what the note says.
  const groups = HAZARD_GROUPS.map(([label]) => ({ label, cities: [] }));
  const other = { label: 'Other seasonal hazards', cities: [] };
  for (const r of ranked) {
    if (r.m.risk < 1) continue;
    const t = hazardText(r.m);
    const gi = HAZARD_GROUPS.findIndex(([, re]) => re.test(t));
    (gi >= 0 ? groups[gi] : other).cities.push({ ...r, note: t });
  }
  const hazards = [...groups, other].filter((g) => g.cities.length);

  const badAir = ranked.filter((r) => /unhealthy|hazardous/i.test(r.m.airCat ?? ''));

  const festivals = [];
  for (const r of top) {
    const ev = eventsInMonth(r.city, mIdx, 3)[0];
    if (ev) festivals.push({ ...r, event: ev });
  }

  const cheapestTop = [...top].sort((a, b) => a.m.cost1 - b.m.cost1)[0];
  const peakTop = top.filter((r) => r.m.season === 'Peak').length;

  return {
    total: ranked.length,
    great: great.length,
    leader: ranked[0],
    leadRegions,
    hazards,
    badAir,
    festivals,
    cheapestTop,
    peakTop,
    bottom: ranked.slice(-3).reverse()
  };
}

// ---- Region hubs: /best/<attribute>-in-<region>/ ----
//
// A hub ranks the cities of one region on one attribute. Each hub is gated on
// substance: a page is only emitted when the data says something worth a page
// (enough cities with the metric, and a real spread between the best and the
// rest). Failing hubs are returned with a reason, never emitted.
export const MIN_REGION_CITIES = 8;
export const MIN_HUB_CITIES = 8; // cities that must carry the metric
export const NORTHERN_SHARE = 0.75; // winter/summer hubs need this share of cities north of the equator
export const GATES = {
  cheapestBelowMedian: 0.15, // the cheapest is at least this far below the regional median
  safetySpread: 10, // top-to-bottom points
  airRatio: 1.5, // max / min annual PM2.5
  seasonLeader: 75, // the leader's average Score
  seasonSpread: 10 // top-to-bottom points
};
export const GOOD_PM25 = 12; // µg/m³: the top of the "Good" air band in the data
export const BEST_INDEX = '/best/';

// Region labels in the data are short ("SE Asia"); pages spell them out.
const REGION_NAMES = {
  'SE Asia': 'Southeast Asia',
  'E Asia': 'East Asia',
  'W Asia': 'West Asia',
  'S Asia': 'South Asia',
  'E Europe': 'Eastern Europe',
  'S Europe': 'Southern Europe',
  'W Europe': 'Western Europe',
  'N Europe': 'Northern Europe',
  'C Europe': 'Central Europe',
  LATAM: 'Latin America',
  'S America': 'South America',
  'N America': 'North America',
  'C America': 'Central America',
  'N Africa': 'North Africa'
};
export const regionName = (r) => REGION_NAMES[r] ?? r;
export const regionHubSlug = (r) => (REGION_NAMES[r] ? regionSlug(REGION_NAMES[r]) : regionSlug(r));
// The SPA's own region= value (slug() from data.svelte.js, as urlState.js writes it).
export const appRegionUrl = (region, mIdx = null) =>
  `/?region=${encodeURIComponent(slug(region))}${mIdx != null ? `&m=${monthParam(mIdx)}` : ''}`;

const WINTER = [11, 0, 1];
const SUMMER = [5, 6, 7];
const seasonMonths = (idxs) => fmtRuns(Array.from({ length: 12 }, (_, i) => idxs.includes(i)));

export const HUB_ATTRS = {
  cheapest: { prefix: 'cheapest-cities', label: 'cheapest cities' },
  safest: { prefix: 'safest-cities', label: 'safest cities' },
  air: { prefix: 'cleanest-air', label: 'cleanest air' },
  winter: { prefix: 'winter', label: 'winter', months: WINTER },
  summer: { prefix: 'summer', label: 'summer', months: SUMMER }
};
export const hubPath = (attr, region) => `/best/${HUB_ATTRS[attr].prefix}-in-${regionHubSlug(region)}/`;

const avg = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
const rnd = (x) => Math.round(x);

// Which attribute hubs a region is a candidate for, before the data gates.
// Winter and summer only mean Dec–Feb and Jun–Aug where the region is mostly
// north of the equator.
export function candidateAttrs(regionCities) {
  const attrs = ['cheapest', 'safest', 'air'];
  const north = regionCities.filter((c) => c.lat != null && c.lat > 0).length / regionCities.length;
  if (north >= NORTHERN_SHARE) attrs.push('winter', 'summer');
  return attrs;
}

// items: [{ p (public city), year (cityYear) }] — all cities of one region.
// Returns { ok: false, path, reason } or { ok: true, hub }.
export function computeHub(attr, region, items) {
  const R = regionName(region);
  const path = hubPath(attr, region);
  const fail = (reason) => ({ ok: false, path, reason });

  // The metric per city; cities without it are left out of the ranking.
  let measured; // [{ it, v }]
  let desc; // true: higher value ranks first
  if (attr === 'cheapest') {
    measured = items.map((it) => ({ it, v: avg(it.p.months.map((m) => m.cost1)) }));
    desc = false;
  } else if (attr === 'safest') {
    measured = items.filter((it) => it.p.safety.score != null).map((it) => ({ it, v: it.p.safety.score }));
    desc = true;
  } else if (attr === 'air') {
    measured = items
      .filter((it) => it.p.months.every((m) => m.pm25 != null))
      .map((it) => ({ it, v: avg(it.p.months.map((m) => m.pm25)) }));
    desc = false;
  } else {
    const idxs = HUB_ATTRS[attr].months;
    measured = items.map((it) => ({ it, v: avg(idxs.map((i) => it.year.q[i])) }));
    desc = true;
  }
  const n = measured.length;
  if (n < MIN_HUB_CITIES) return fail(`only ${n} cities with the metric (need ${MIN_HUB_CITIES})`);
  measured.sort((a, b) => (desc ? b.v - a.v : a.v - b.v) || a.it.p.name.localeCompare(b.it.p.name));
  const vals = measured.map((x) => x.v);
  const first = measured[0];
  const last = measured[n - 1];
  const med = median(vals);

  // Substance gates.
  if (attr === 'cheapest') {
    const below = 1 - first.v / med;
    if (below < GATES.cheapestBelowMedian) return fail(`cheapest is ${(below * 100).toFixed(1)}% below the median (need ${GATES.cheapestBelowMedian * 100}%)`);
  } else if (attr === 'safest') {
    const spread = first.v - last.v;
    if (spread < GATES.safetySpread) return fail(`safety spread is ${spread.toFixed(1)} points (need ${GATES.safetySpread})`);
  } else if (attr === 'air') {
    const ratio = last.v / first.v;
    if (ratio < GATES.airRatio) return fail(`PM2.5 max/min is ${ratio.toFixed(2)} (need ${GATES.airRatio})`);
  } else {
    if (first.v < GATES.seasonLeader) return fail(`leader averages ${first.v.toFixed(1)} (need ${GATES.seasonLeader})`);
    const spread = first.v - last.v;
    if (spread < GATES.seasonSpread) return fail(`spread is ${spread.toFixed(1)} points (need ${GATES.seasonSpread})`);
  }

  const monthIdxs = HUB_ATTRS[attr].months;
  const span = monthIdxs ? seasonMonths(monthIdxs) : null;
  const money = fmtMoney;
  const rangeText = ([a, b]) => (a === b ? `${money(a)} all year` : `${money(a)}–${money(b)} across the year`);

  const rows = measured.map(({ it, v }, k) => {
    const { p, year } = it;
    const soloAvg = avg(p.months.map((m) => m.cost1));
    const coupleAvg = avg(p.months.map((m) => m.cost2));
    const row = {
      rank: k + 1,
      p,
      cells: year.cells,
      best: year.best,
      bestMonth: MONTHS_LONG[year.best],
      bestQ: rnd(year.q[year.best]),
      soloAvg,
      coupleAvg
    };
    if (attr === 'cheapest') {
      Object.assign(row, {
        valueText: money(v),
        unit: '/mo solo, avg',
        aux: `${money(coupleAvg)}/mo couple`,
        detail: `Solo ${rangeText(year.cost.solo)}`
      });
    } else if (attr === 'safest') {
      const hr = p.safety.violent?.homicideRate;
      Object.assign(row, {
        valueText: String(rnd(v)),
        unit: p.safety.label ?? 'safety score',
        aux: `${money(soloAvg)}/mo solo`,
        detail: hr != null ? `Homicides: ${hr} per 100,000` : null
      });
    } else if (attr === 'air') {
      const good = p.months.filter((m) => m.pm25 <= GOOD_PM25).length;
      Object.assign(row, {
        valueText: v.toFixed(1),
        unit: 'µg/m³ PM2.5, annual mean',
        aux: `${money(soloAvg)}/mo solo`,
        detail: `${good} of 12 months rated Good (${GOOD_PM25} µg/m³ or less)`
      });
    } else {
      Object.assign(row, {
        valueText: String(rnd(v)),
        unit: `avg Score, ${span}`,
        aux: `${money(soloAvg)}/mo solo`,
        detail: monthIdxs.map((i) => `${MONTHS[i]} ${rnd(year.q[i])}`).join(' · ')
      });
    }
    return row;
  });

  const A = rows[0];
  const B = rows[n - 1];
  const link = (r) => ({ name: r.p.name, key: r.p.key });
  const ofN = `of ${n} cities in ${R}`;
  let parts; // string | {name, key}
  let measure;
  let title;
  let blurb;
  let kicker;
  if (attr === 'cheapest') {
    const belowPct = rnd((1 - first.v / med) * 100);
    title = `Cheapest cities in ${R}: ${n} ranked by monthly cost`;
    kicker = `${n} cities ranked · monthly cost`;
    parts = [
      link(A), ` is the cheapest ${ofN} at ${money(first.v)}/mo solo on average, ${belowPct}% below the regional median of ${money(med)}. `,
      link(B), ` is the priciest at ${money(last.v)}. A couple in `, link(A), ` averages ${money(A.coupleAvg)}/mo.`
    ];
    blurb = `${A.p.name} is cheapest at ${money(first.v)}/mo solo.`;
    measure = [
      'Cost is the average of the twelve monthly figures for one person, in US dollars, with the cheapest and priciest month shown as the range. Each city’s base cost is itemized line by line (rent, food, transport, utilities and so on), and only rent is adjusted by season. The couple figure shares rent and utilities and scales per-person items. Some line items are labelled estimates on the city page.'
    ];
  } else if (attr === 'safest') {
    title = `Safest cities in ${R}: ${n} ranked by safety score`;
    kicker = `${n} cities ranked · safety`;
    const hrA = A.p.safety.violent?.homicideRate;
    const hrB = B.p.safety.violent?.homicideRate;
    parts = [
      link(A), ` has the highest safety score ${ofN}: ${rnd(first.v)} of 100 (${A.p.safety.label}). `,
      link(B), ` is lowest at ${rnd(last.v)} (${B.p.safety.label}), a spread of ${rnd(first.v) - rnd(last.v)} points around a regional median of ${rnd(med)}.`
    ];
    if (hrA != null && hrB != null) parts.push(` Intentional homicides per 100,000: ${hrA} in ${A.p.name}, ${hrB} in ${B.p.name}.`);
    blurb = `${A.p.name} leads at ${rnd(first.v)} of 100.`;
    measure = [
      'The safety score is Monsoon’s own 0–100 index: homicide-anchored violent-crime safety, a hand-set property-crime sub-score and a visitor-risk modifier. Homicide rates come from World Bank/UNODC data with a WHO modelled fallback, and the scope (country or city) is shown on each city page. The property sub-score and visitor modifier are editorial estimates.',
      'The U.S. State Department advisory appears on city pages for reference only and never changes a score. Women’s street-safety is shown separately on city pages and is not part of this ranking.'
    ];
  } else if (attr === 'air') {
    const nGood = vals.filter((v) => v <= GOOD_PM25).length;
    title = `Cleanest air in ${R}: ${n} cities ranked by PM2.5`;
    kicker = `${n} cities ranked · air quality`;
    parts = [
      link(A), ` has the cleanest air ${ofN}, with an annual mean PM2.5 of ${first.v.toFixed(1)} µg/m³. `,
      link(B), ` is the most polluted at ${last.v.toFixed(1)}, ${(last.v / first.v).toFixed(1)} times as much. `,
      nGood === 0
        ? `No city averages ${GOOD_PM25} µg/m³ or less, the range Monsoon rates Good.`
        : `${nGood} of ${n} cities average ${GOOD_PM25} µg/m³ or less, the range Monsoon rates Good.`
    ];
    blurb = `${A.p.name} leads at ${first.v.toFixed(1)} µg/m³.`;
    measure = [
      `Cities are ranked by annual mean PM2.5 in µg/m³, the average of the twelve monthly values; lower is cleaner. Monthly values follow the CAMS seasonal pattern scaled to each city’s WHO ground-monitor annual mean, and a value that could not be verified keeps its earlier editorial estimate, labelled as such on the city page. Months at ${GOOD_PM25} µg/m³ or below are rated Good. Cities with no PM2.5 value are left out.`
    ];
  } else {
    const W = attr === 'winter' ? 'winter' : 'summer';
    const south = rows.filter((r) => r.p.lat < 0);
    const nGood = vals.filter((v) => v >= 75).length;
    title = `Where to spend ${W} in ${R}: ${n} cities ranked for ${span}`;
    kicker = `${n} cities ranked · ${span}`;
    parts = [
      link(A), ` leads ${R} for ${W} (${span}) with an average Score of ${rnd(first.v)}. `,
      link(B), ` is last at ${rnd(last.v)}, a spread of ${rnd(first.v) - rnd(last.v)} points. ${nGood} of ${n} cities average 75 or higher across those three months.`
    ];
    blurb = `${A.p.name} leads ${W} at ${rnd(first.v)}.`;
    measure = [
      `Each city’s Score for ${monthIdxs.map((i) => MONTHS_LONG[i]).join(', ').replace(/, ([^,]*)$/, ' and $1')} is the default Balanced Score the app uses (weather, safety, air, season and events, scaled down when safety is low), and cities are ranked by the average of those three months, highest first.`,
      `${W === 'winter' ? 'Winter' : 'Summer'} is read as ${span}, so this page exists only for regions where at least ${rnd(NORTHERN_SHARE * 100)}% of the cities are in the northern hemisphere.${south.length ? ` ${south.map((r) => r.p.name).join(', ')} ${south.length === 1 ? 'is' : 'are'} south of the equator and ${south.length === 1 ? 'is' : 'are'} ranked on the same calendar months, so the local season is the opposite.` : ''}`
    ];
  }
  const ledeText = parts.map((x) => (typeof x === 'string' ? x : x.name)).join('');
  const description = `${ledeText.length > 260 ? ledeText.slice(0, 257).replace(/\s+\S*$/, '') + '…' : ledeText} Each city ranked with its best month, solo cost and 12-month strip.`;

  const firstMonth = monthIdxs?.[0];
  return {
    ok: true,
    hub: {
      attr,
      region,
      regionName: R,
      path,
      label: HUB_ATTRS[attr].label,
      shortTitle: `${HUB_ATTRS[attr].label[0].toUpperCase()}${HUB_ATTRS[attr].label.slice(1)} in ${R}`,
      title,
      kicker,
      parts,
      ledeText,
      description,
      blurb,
      measure,
      rows,
      // What the bare number beside each name in "The rest of the ranking" is.
      valueLabel: {
        cheapest: 'average monthly cost for one person, US dollars',
        safest: 'safety score out of 100',
        air: 'annual mean PM2.5 in µg/m³'
      }[attr] ?? `average Score across ${span}`,
      n,
      cta: {
        href: appRegionUrl(region, firstMonth ?? null),
        text: firstMonth != null ? `See ${R} in ${MONTHS_LONG[firstMonth]} in Monsoon →` : `Filter the app to ${R} →`
      }
    }
  };
}
