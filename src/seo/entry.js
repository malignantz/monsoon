// Static SEO surface (GROWTH_ENGINE_PLAN §3 Option B). Loaded by
// scripts/seo/build-seo.mjs through Vite's SSR module loader, so this file and
// everything it imports — data.svelte.js (runes, JSON imports), MonthStrip.svelte,
// the app's scoring helpers — run exactly as the SPA bundles them. Returns
// [{path, content}] for the caller to write into dist/; does no I/O itself.
import { render } from 'svelte/server';
import {
  cities,
  regions,
  MONTHS,
  sources,
  settings,
  dataAsOf,
  prefs,
  PRESETS,
  stripCells,
  eventsInMonth,
  fmtMoney
} from '../lib/data.svelte.js';
import fame from '../../data/seo/fame.json';
import { provFor, fmtDate, fmtWindow, normConfidence, CHIP_LABEL, reportUrl, FEEDBACK_REPO } from '../lib/provenance.js';
import { METHOD_VERSION, LAST_UPDATED } from '../lib/changelog.js';
import { CITY_IDS_V1 } from '../lib/cityIds.v1.js';
import { publicCity } from './publicData.js';
import {
  SITE,
  MONTHS_LONG,
  monthPath,
  monthSlug,
  cityPath,
  cityYear,
  relatedCities,
  rankMonth,
  monthFacts,
  hazardText,
  BEST_INDEX,
  MIN_REGION_CITIES,
  HUB_ATTRS,
  regionName,
  candidateAttrs,
  computeHub,
  COMPARE_INDEX,
  comparePath,
  shortName,
  appCityUrl,
  appCompareUrl,
  fmtRuns
} from './derive.js';
import { selectPairs, pairStory, GATE } from './pairing.js';
import { BASE_CSS, minify } from './styles.js';
import { documentHtml, breadcrumbLd } from './head.js';
import CityPage from './CityPage.svelte';
import MonthPage from './MonthPage.svelte';
import CitiesPage from './CitiesPage.svelte';
import BestIndexPage from './BestIndexPage.svelte';
import RegionPage from './RegionPage.svelte';
import ComparePage from './ComparePage.svelte';
import CompareIndexPage from './CompareIndexPage.svelte';

const TOP_N = 25;
const pct = (x) => Math.round(x * 100);

// Render a page component; fold the component CSS Svelte injects (MonthStrip's
// scoped styles) into the one inlined <style> block.
function renderPage(Component, props) {
  const { head, body } = render(Component, { props });
  const compCss = [...head.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => minify(m[1])).join('');
  // Strip cells carry a hover tooltip per month. These pages print the same
  // numbers in text (summary line, table), so drop the tooltips: they were
  // over a third of the bytes on list pages with a strip per city.
  return { body: body.replace(/(<span class="cell [^"]*") title="[^"]*"/g, '$1'), css: BASE_CSS + compCss };
}

function climateNote(label, pv) {
  if (!pv) {
    return {
      label,
      chip: CHIP_LABEL.low,
      text: 'Estimates without a citable source yet; they are being replaced with measured data.',
      links: []
    };
  }
  const editorial = pv.srcs.length > 0 && pv.srcs.every((s) => s.key === 'editorial');
  const wins = [...new Set(pv.srcs.map((s) => (s.window ? `${fmtWindow(s.window)} average` : '')).filter(Boolean))];
  const bits = [editorial ? 'Editorial estimate (held back)' : pv.type, ...wins, pv.asOf ? `as of ${fmtDate(pv.asOf)}` : ''];
  if (pv.station) bits.push(`station: ${pv.station}${pv.distanceKm != null ? ` (${pv.distanceKm} km away)` : ''}`);
  else if (pv.reanalysis) bits.push('reanalysis grid cell, not a weather station');
  if (pv.note) bits.push(pv.note);
  const licences = [...new Set(pv.srcs.map((s) => s.licence).filter(Boolean))];
  if (licences.length) bits.push(`Licence: ${licences.join('; ')}`);
  return {
    label,
    chip: pv.confidence ? CHIP_LABEL[pv.confidence] : null,
    text: bits.filter(Boolean).join(' · ') || 'Sourced.',
    links: pv.srcs.filter((s) => s.url).map((s) => ({ name: s.name, url: s.url }))
  };
}

function sourceNotes(p, year) {
  const w = PRESETS.balanced.w;
  const floor = settings.safety_floor_threshold ?? 55;
  const notes = [
    {
      label: 'Score',
      chip: null,
      text: `Computed from five 0–100 sub-scores with the default Balanced weights: weather ${pct(w.weather)}%, safety ${pct(w.safety)}%, air ${pct(w.air)}%, season ${pct(w.season)}%, events ${pct(w.events)}%. Safety below ${floor} scales the whole score down. Methodology ${METHOD_VERSION}.`,
      links: []
    },
    climateNote('Temperature, humidity and rain days', provFor(p, 'climate', sources)),
    climateNote('PM2.5', provFor(p, 'pm25', sources))
  ];
  if (year.hazards.length) {
    notes.push({
      label: 'Hazard flags',
      chip: CHIP_LABEL.editorial,
      text: `Hand-set per city and month. A flagged month multiplies the weather score by ${settings.extreme_elevated_mult ?? 0.8} (severe: ${settings.extreme_severe_mult ?? 0.55}).`,
      links: []
    });
  }
  notes.push({ label: 'Season phase and event tiers', chip: CHIP_LABEL.editorial, text: 'Hand-set. Each month scores the biggest event on the city’s event calendar.', links: [] });
  const v = p.safety.violent;
  notes.push({
    label: 'Safety',
    chip: null,
    text: `Homicide rate from ${v?.source ?? 'national statistics'}${p.safety.asOf ? `, reviewed ${fmtDate(p.safety.asOf)}` : ''}. The property sub-score and visitor modifier are editorial estimates informed by OSAC crime and safety reports and U.S. State Department guidance.`,
    links: v?.url ? [{ name: 'homicide data', url: v.url }] : []
  });
  const cp = p.costProv;
  if (cp?.items?.length) {
    const low = normConfidence(cp.lowest);
    notes.push({
      label: 'Cost',
      chip: low ? `${CHIP_LABEL[low]} (lowest item)` : null,
      text: `${cp.items.length} line items, each with its own source, date and confidence${cp.asOf ? `, as of ${fmtDate(cp.asOf)}` : ''}. The couple figure shares rent and utilities and scales per-person items.`,
      links: []
    });
  }
  return notes;
}

function costView(p) {
  const cp = p.costProv;
  const items = (cp?.items ?? []).map((i) => ({
    label: i.label,
    usd: i.usd,
    source: i.source ?? null,
    url: i.url ?? null,
    sourceText: i.source ? (/estimat/i.test(i.source) ? 'Estimated (no source named)' : `${i.source} (no page link stored)`) : 'No source named',
    asOf: i.asOf ? fmtDate(i.asOf) : null,
    confidence: normConfidence(i.confidence) ? CHIP_LABEL[normConfidence(i.confidence)] : null
  }));
  const sum = items.reduce((s, i) => s + i.usd, 0);
  return { items, asOf: cp?.asOf ? fmtDate(cp.asOf) : null, sumsToBase: items.length > 0 && sum === p.solo };
}

function safetyView(p) {
  const s = p.safety;
  return {
    score: s.score,
    label: s.label,
    asOf: s.asOf ? fmtDate(s.asOf) : null,
    violent: s.violent,
    property: s.property?.sub != null ? Math.round(s.property.sub) : null,
    visitor: s.tourist?.modifier != null ? Number(s.tourist.modifier).toFixed(2) : null,
    womens: s.womensSafety?.sub != null
      ? { sub: Math.round(s.womensSafety.sub), cs: s.womensSafety.cs ?? null, source: s.womensSafety.dataSource ?? 'Gallup World Poll via the Georgetown WPS Index', url: s.womensSafety.url ?? null }
      : null,
    advisory: s.advisory ?? null,
    advisoryLevel: s.advisoryLevel ?? null,
    advisoryDate: s.date ? fmtDate(s.date) : null,
    advisoryUrl: s.url ?? null
  };
}

const minCost = (p) => Math.min(...p.months.map((m) => m.cost1));

// <title> for a comparison: short display names (no trailing parenthetical),
// the claim in a clause; falls back to a shorter form when that runs long.
const TITLE_MAX = 75;
function compareTitle(pair) {
  const S = shortName(pair.subject.name);
  const A = shortName(pair.anchor.name);
  const n = pair.winMonths.length;
  const pctLess = Math.round(pair.savings * 100);
  const long = `${S} vs ${A}: ${S} scores higher ${n === 12 ? 'every month' : `in ${n} months`} for ${pctLess}% less | Monsoon`;
  if (long.length <= TITLE_MAX) return long;
  return `${S} vs ${A}, month by month: ${S} wins ${n === 12 ? 'every month' : `${n} months`} | Monsoon`;
}

// Meta description: the claim, then the best-month sentence. When both together
// run long, keep the sentence's lead ("In May X scores 80 and Y 72.") and drop
// its list of reasons; as a last resort cut at a word boundary.
const DESC_MAX = 240;
function compareDescription(story) {
  const full = `${story.claim} ${story.bestMonth.sentence}`;
  if (full.length <= DESC_MAX) return full;
  const lead = `${story.claim} ${story.bestMonth.sentence.split(':')[0]}.`;
  if (lead.length <= DESC_MAX) return lead;
  return `${lead.slice(0, DESC_MAX - 1).replace(/[\s,;:–—-]+\S*$/, '')}…`;
}

// Cells as the share cards need them: the Score the page prints plus its band
// (the band comes from the unrounded Score, as on the page strip).
const ogCells = (cells) => cells.map((c) => ({ q: Math.round(c.q), band: c.band }));

const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const goodMonths = (cells) => cells.filter((c) => c.band === 'great' || c.band === 'good').length;

export function buildSite({ detail, now = new Date() }) {
  // Deterministic lens: the app's defaults (solo, women's-safety blend off),
  // whatever a local Node storage shim might hold.
  prefs.party = 'solo';
  prefs.womensSafety = false;
  prefs.units = 'F'; // static pages don't vary by visitor locale
  prefs.currency = 'USD'; // static pages are always US dollars

  if (detail.cities.length !== cities.length) throw new Error('[seo] travel-detail.json is out of step with travel-core.json');
  // URLs reuse the frozen share-link slug vocabulary so /city/<slug>/ and
  // ?city=<slug> can never drift apart (GROWTH_ENGINE_PLAN §5.1).
  const frozen = new Set(CITY_IDS_V1);
  const unfrozen = cities.filter((c) => !frozen.has(c.key)).map((c) => c.key);
  if (unfrozen.length) throw new Error(`[seo] cities missing from cityIds.v1.js (run npm run check:ids): ${unfrozen.join(', ')}`);
  const pub = new Map(cities.map((c, i) => [c.key, publicCity(c, detail.cities[i])]));
  const P = (key) => pub.get(key);
  const lastUpdated = [LAST_UPDATED, ...Object.values(dataAsOf)].filter(Boolean).sort().at(-1);

  const site = {
    cityCount: cities.length,
    thisMonth: now.getUTCMonth(),
    methodVersion: METHOD_VERSION,
    compareCount: 0, // set once the comparisons are computed; the footer links /compare/ only when > 0
    lastUpdated: LAST_UPDATED ? fmtDate(LAST_UPDATED) : null,
    costAsOf: fmtDate(dataAsOf.cost) || '—',
    safetyAsOf: fmtDate(dataAsOf.safety) || '—',
    feedback: `${FEEDBACK_REPO}/issues`,
    reportUrl: (name) => reportUrl({ city: name, month: '(which month?)', metric: '(which number?)' })
  };

  const out = [];
  const og = []; // per-page share-image specs: {path, card, data}; scripts/seo/build-seo.mjs renders them (native renderer, so not here)
  const pages = []; // {path, title} for the sitemap / llms.txt
  // opts: { noindex } keeps a page out of every sitemap and adds a robots meta;
  // { ogImage: '/og/….png', ogAlt } swaps the default share image and its alt text.
  const emit = (path, title, description, Component, props, jsonLd, ogType, opts = {}) => {
    const { body, css } = renderPage(Component, { ...props, site });
    out.push({
      path: `${path}index.html`,
      content: documentHtml({ path, title, description, ogType, jsonLd, css, body, cityCount: cities.length, ...opts })
    });
    pages.push({ path, title, description, noindex: !!opts.noindex });
  };

  const HOME = { name: 'Monsoon', href: '/' };
  const CITIES = { name: 'Cities', href: '/cities/' };
  const BEST = { name: 'Best', href: BEST_INDEX };

  const years = new Map(cities.map((c) => [c.key, cityYear(c)]));

  // ---- Region hubs: computed first so city pages and /cities/ can link to the
  // ones that exist. A hub that fails its substance gate is not emitted. ----
  const skipped = []; // [{ path, reason }] — build-seo.mjs logs each with a "[seo] skip" prefix
  const hubs = []; // emitted hubs, in region then attribute order
  const regionCities = new Map(regions.map((r) => [r, cities.filter((c) => c.region === r)]));
  const smallRegions = [];
  for (const region of regions) {
    const rc = regionCities.get(region);
    if (rc.length < MIN_REGION_CITIES) {
      smallRegions.push(`${region} (${rc.length})`);
      continue;
    }
    const items = rc.map((c) => ({ p: P(c.key), year: years.get(c.key) }));
    const attrs = candidateAttrs(rc);
    for (const attr of Object.keys(HUB_ATTRS)) {
      if (!attrs.includes(attr)) {
        skipped.push({ path: `${attr} hub for ${region}`, reason: `fewer than 75% of its cities are in the northern hemisphere, so ${attr} is not a fixed Dec–Feb / Jun–Aug` });
        continue;
      }
      const res = computeHub(attr, region, items);
      if (res.ok) hubs.push(res.hub);
      else skipped.push({ path: res.path, reason: res.reason });
    }
  }
  if (smallRegions.length) skipped.push({ path: 'region hubs', reason: `regions under ${MIN_REGION_CITIES} cities: ${smallRegions.join(', ')}` });
  const hubLinks = (region) => hubs.filter((h) => h.region === region).map((h) => ({ path: h.path, label: h.label }));

  // ---- Comparisons: which pairs exist is pairing.js's call (the gate); a pair
  // whose story is thin or incomplete is skipped here, never emitted. Computed
  // before the city pages so each can link the comparisons it appears in. ----
  const { pairs: gatePairs, rejected: gateRejected } = selectPairs(cities, pub, fame);
  const comparisons = [];
  for (const pair of gatePairs) {
    const path = comparePath(pair.slug);
    const S = P(pair.subject.key);
    const A = P(pair.anchor.key);
    const story = pairStory(pair, S, A);
    const problems = [];
    if (story.numericDeltas < 2) problems.push(`only ${story.numericDeltas} numeric delta(s) in the best-month sentence (needs at least 2)`);
    if (!story.claim || !story.bestMonth?.sentence || !story.anchorSide) problems.push('story is missing its claim, best-month sentence or other-side paragraph');
    if (!S || !A || !years.get(pair.subject.key) || !years.get(pair.anchor.key)) problems.push('missing public city data');
    if (problems.length) {
      skipped.push({ path, reason: problems.join('; ') });
      continue;
    }
    comparisons.push({ pair, S, A, story, path, label: `${S.name} vs ${A.name}` });
  }
  const comparisonsFor = (key) =>
    comparisons
      .filter((o) => o.pair.subject.key === key || o.pair.anchor.key === key)
      .map((o) => ({ path: o.path, other: o.pair.subject.key === key ? o.A.name : o.S.name, label: o.label }));
  site.compareCount = comparisons.length;

  // ---- City pages ----
  for (const city of cities) {
    const p = P(city.key);
    const year = years.get(city.key);
    const rows = p.months.map((m, i) => ({
      m,
      hazard: m.risk >= 1 ? hazardText(m) : null,
      events: eventsInMonth(p, i, 2).map((e) => ({ name: e.name, tier: e.tier }))
    }));
    const related = relatedCities(city, cities, 4).map((r) => ({
      c: P(r.city.key),
      cells: years.get(r.city.key).cells,
      summary: years.get(r.city.key).summary,
      sameRegion: r.sameRegion,
      minSolo: minCost(P(r.city.key))
    }));
    const safety = safetyView(p);
    const cost = { ...costView(p), solo: year.cost.solo, couple: year.cost.couple };
    const crumbs = [HOME, CITIES, { name: p.name, href: cityPath(p.key) }];
    const bestQ = Math.round(year.q[year.best]);
    const title = `${p.name}, month by month: best time to stay | Monsoon`;
    const description =
      `${year.summary} ${p.name} peaks in ${MONTHS_LONG[year.best]} (Score ${bestQ}). ` +
      `${fmtMoney(year.cost.solo[0])}–${fmtMoney(year.cost.solo[1])}/mo solo; safety ${safety.score} (${safety.label}). ` +
      `Weather, PM2.5, rain and events for all 12 months.`;
    const jsonLd = [
      {
        '@type': 'TouristDestination',
        '@id': `${SITE}${cityPath(p.key)}#place`,
        name: p.name,
        url: SITE + cityPath(p.key),
        description: p.narrative ?? p.vibe ?? year.summary,
        geo: p.lat != null ? { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng } : undefined,
        containedInPlace: { '@type': 'Country', name: p.country }
      },
      breadcrumbLd(crumbs)
    ];
    // Share card: the same public numbers the page prints (rounded Score, band,
    // the cities index's "from $X/mo solo", the safety score and label).
    const ogPath = `/og/city/${p.key}.png`;
    og.push({
      path: ogPath.slice(1),
      card: 'cityCard',
      data: {
        name: p.name,
        country: p.country,
        region: regionName(city.region),
        cells: ogCells(year.cells),
        best: { month: MONTHS_LONG[year.best], q: bestQ },
        fromSolo: Math.round(minCost(p)),
        safety: { score: Math.round(safety.score), label: safety.label }
      }
    });
    const ogAlt = `${p.name}, month by month: Score strip for all 12 months, best in ${MONTHS_LONG[year.best]} (${bestQ})`;
    emit(cityPath(p.key), title, description, CityPage, { c: p, year, rows, related, sources: sourceNotes(p, year), safety, cost, hubs: hubLinks(city.region), regionLabel: regionName(city.region), comparisons: comparisonsFor(city.key), crumbs }, jsonLd, 'article', { ogImage: ogPath, ogAlt });
  }

  // ---- Month pages ----
  const monthSummaries = [];
  for (let i = 0; i < 12; i++) {
    const ranked = rankMonth(cities, i);
    const facts = monthFacts(ranked, i, TOP_N);
    // Public view for the template: swap core cities for their public copies.
    const pubRow = (r) => ({ ...r, city: P(r.city.key), m: P(r.city.key).months[i], cells: years.get(r.city.key).cells });
    const pubFacts = {
      ...facts,
      leader: pubRow(facts.leader),
      cheapestTop: facts.cheapestTop && pubRow(facts.cheapestTop),
      festivals: facts.festivals.map((f) => ({ ...pubRow(f), event: { name: f.event.name } })),
      hazards: facts.hazards.map((g) => ({ label: g.label, cities: g.cities.map((h) => ({ ...pubRow(h), note: h.note })) })),
      badAir: facts.badAir.map(pubRow),
      bottom: facts.bottom.map(pubRow)
    };
    const top = ranked.slice(0, TOP_N).map(pubRow);
    const rest = ranked.slice(TOP_N).map(pubRow);
    const M = MONTHS_LONG[i];
    const crumbs = [HOME, BEST, { name: `Where to be in ${M}`, href: monthPath(i) }];
    const title = `Where to be in ${M}: ${cities.length} cities ranked | Monsoon`;
    const description =
      `Top for ${M}: ${top.slice(0, 3).map((r) => `${r.city.name} (${Math.round(r.q)})`).join(', ')}. ` +
      `${facts.great} of ${cities.length} cities score 85+, ranked on weather, air, safety, season and events, with monthly cost.`;
    const jsonLd = [
      {
        '@type': 'ItemList',
        name: `Where to be in ${M}`,
        url: SITE + monthPath(i),
        itemListOrder: 'https://schema.org/ItemListOrderDescending',
        numberOfItems: top.length,
        itemListElement: top.map((r) => ({ '@type': 'ListItem', position: r.rank, name: r.city.name, url: SITE + cityPath(r.city.key) }))
      },
      breadcrumbLd(crumbs)
    ];
    // Share card: this month's top 5 as the page lists them (Score, solo cost) and the 85+ count.
    const ogPath = `/og/best/${monthSlug(i)}.png`;
    og.push({
      path: ogPath.slice(1),
      card: 'monthCard',
      data: {
        month: M,
        leaders: top.slice(0, 5).map((r) => ({ name: r.city.name, country: r.city.country, q: r.q, cost: Math.round(r.m.cost1) })),
        great: facts.great,
        total: facts.total
      }
    });
    emit(monthPath(i), title, description, MonthPage, { mIdx: i, facts: pubFacts, top, rest, crumbs }, jsonLd, 'website', { ogImage: ogPath, ogAlt: `Where to be in ${M}: top 5 cities by Score, with monthly cost` });
    monthSummaries.push({ i, name: M, path: monthPath(i), leader: { name: pubFacts.leader.city.name, q: Math.round(facts.leader.q) }, great: facts.great, total: facts.total });
  }

  // ---- Region hub pages ----
  for (const hub of hubs) {
    const siblings = hubs.filter((h) => h.region === hub.region && h.attr !== hub.attr).map((h) => ({ path: h.path, label: h.label }));
    const elsewhere = hubs.filter((h) => h.attr === hub.attr && h.region !== hub.region).map((h) => ({ path: h.path, regionName: h.regionName }));
    const crumbs = [HOME, BEST, { name: hub.title, href: hub.path }];
    const jsonLd = [
      {
        '@type': 'ItemList',
        name: hub.title,
        url: SITE + hub.path,
        itemListOrder: hub.attr === 'cheapest' || hub.attr === 'air' ? 'https://schema.org/ItemListOrderAscending' : 'https://schema.org/ItemListOrderDescending',
        numberOfItems: hub.rows.length,
        itemListElement: hub.rows.map((r) => ({ '@type': 'ListItem', position: r.rank, name: r.p.name, url: SITE + cityPath(r.p.key) }))
      },
      breadcrumbLd(crumbs)
    ];
    emit(hub.path, `${hub.title} | Monsoon`, hub.description, RegionPage, { hub, siblings, elsewhere, crumbs }, jsonLd);
  }

  // ---- /best/ index ----
  {
    const regionGroups = regions
      .filter((r) => hubs.some((h) => h.region === r))
      .map((r) => ({ region: r, regionName: regionName(r), n: regionCities.get(r).length, hubs: hubs.filter((h) => h.region === r) }));
    const crumbs = [HOME, BEST];
    const title = 'Where to be, by month and by region | Monsoon';
    const description =
      `Where to be in every month of the year, and the cheapest, safest, cleanest-air and best-season cities in ${regionGroups.length} regions. ` +
      `${cities.length} cities scored for each of 12 months on weather, air, safety, season and events.`;
    const items = [
      ...monthSummaries.map((m) => ({ name: `Where to be in ${m.name}`, path: m.path })),
      ...hubs.map((h) => ({ name: h.title, path: h.path }))
    ];
    const jsonLd = [
      {
        '@type': 'ItemList',
        name: 'Where to be, by month and by region',
        url: SITE + BEST_INDEX,
        numberOfItems: items.length,
        itemListElement: items.map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.name, url: SITE + o.path }))
      },
      breadcrumbLd(crumbs)
    ];
    emit(BEST_INDEX, title, description, BestIndexPage, { months: monthSummaries, regionGroups, hubCount: hubs.length, regionCount: regions.length, compareCount: comparisons.length, crumbs }, jsonLd);
  }

  // ---- Cities index ----
  const groups = regions.map((region) => ({
    region,
    regionName: regionName(region),
    hubs: hubLinks(region),
    cities: cities
      .filter((c) => c.region === region)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ c: P(c.key), cells: years.get(c.key).cells, summary: years.get(c.key).summary, minSolo: minCost(P(c.key)) }))
  }));
  // Dataset node (schema.org/Dataset) describing the whole city-month table the
  // directory lists. Counts and the variable list come from the data; no licence
  // or download distribution is claimed.
  const datasetLd = () => ({
    '@type': 'Dataset',
    '@id': `${SITE}/cities/#dataset`,
    name: 'Monsoon city-month scores',
    description:
      `${cities.length} cities in ${regions.length} regions, each scored for all 12 months (${(cities.length * 12).toLocaleString('en-US')} city-months). ` +
      `Every city-month has a 0–100 Score built from weather, air quality, safety, season and events sub-scores, alongside monthly temperature highs and lows, rain days, PM2.5 and itemized monthly cost for one person and for a couple. Methodology ${METHOD_VERSION}.`,
    url: `${SITE}/cities/`,
    creator: { '@type': 'Organization', name: 'Monsoon', url: SITE },
    isAccessibleForFree: true,
    version: METHOD_VERSION,
    dateModified: lastUpdated,
    keywords: ['best time to visit', 'seasonal travel', 'slow travel', 'digital nomad', 'climate by month', 'cost of living', 'air quality PM2.5', 'travel safety', 'Schengen 90/180'],
    variableMeasured: [
      { '@type': 'PropertyValue', name: 'Score', description: 'Headline 0–100 score for a city in a month: the default Balanced blend of the five sub-scores below, scaled down when safety is low.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Weather sub-score', description: 'Month-level weather comfort, 0–100, from temperature, humidity and rain, reduced in hazard-flagged months.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Air quality sub-score', description: 'Month-level air score, 0–100, from monthly PM2.5.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Safety sub-score', description: 'Annual 0–100 safety index per city: homicide-anchored violent-crime safety, hand-set property-crime safety and a visitor-risk modifier.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Season sub-score', description: 'Hand-set peak, shoulder or low season phase per month, scored 0–100.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'Events sub-score', description: 'Score for the biggest event on the city’s calendar in each month, 0–100.', minValue: 0, maxValue: 100 },
      { '@type': 'PropertyValue', name: 'PM2.5', description: 'Monthly mean fine particulate matter.', unitText: 'µg/m³' },
      { '@type': 'PropertyValue', name: 'Monthly cost, solo', description: 'Itemized cost of a month for one person, with rent adjusted by season.', unitText: 'USD per month' },
      { '@type': 'PropertyValue', name: 'Monthly cost, couple', description: 'Itemized cost of a month for two people, sharing rent and utilities.', unitText: 'USD per month' },
      { '@type': 'PropertyValue', name: 'Temperature, daily high and low', description: 'Monthly average daytime high and night-time low.', unitText: 'degrees Fahrenheit' },
      { '@type': 'PropertyValue', name: 'Rain days', description: 'Days with rain in the month.', unitText: 'days' }
    ],
    measurementTechnique:
      'Each city-month Score blends weather, safety, air, season and events sub-scores computed from sourced climate, PM2.5, homicide and price data plus hand-set season and event tiers; the methodology page lists every input and its source.'
  });

  {
    const crumbs = [HOME, CITIES];
    const title = `All ${cities.length} cities, scored month by month | Monsoon`;
    const description = `${cities.length} slow-travel cities in ${regions.length} regions (${groups
      .slice()
      .sort((a, b) => b.cities.length - a.cities.length)
      .slice(0, 3)
      .map((g) => `${g.region} ${g.cities.length}`)
      .join(', ')}…), each with a 12-month Score for weather, air, safety, season and events, plus monthly cost.`;
    const jsonLd = [
      {
        '@type': 'ItemList',
        name: `All ${cities.length} Monsoon cities`,
        url: `${SITE}/cities/`,
        numberOfItems: cities.length,
        itemListElement: groups.flatMap((g) => g.cities).map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.c.name, url: SITE + cityPath(o.c.key) }))
      },
      datasetLd(),
      breadcrumbLd(crumbs)
    ];
    emit('/cities/', title, description, CitiesPage, { groups, crumbs }, jsonLd);
  }

  // ---- Comparison pages + /compare/ index ----
  if (comparisons.length) {
    const COMPARE = { name: 'Compare', href: COMPARE_INDEX };
    for (const o of comparisons) {
      const { pair, S, A, story } = o;
      const bm = story.bestMonth.month;
      const yS = years.get(S.key);
      const yA = years.get(A.key);
      const mon = MONTHS[bm];
      const view = {
        S,
        A,
        story,
        regionLabel: regionName(pair.subject.region),
        cellsS: yS.cells,
        cellsA: yA.cells,
        costS: yS.cost.solo,
        costA: yA.cost.solo,
        winFlags: Array.from({ length: 12 }, (_, i) => pair.winMonths.includes(i)),
        winText: `${pair.winMonths.length === 12 ? 'every month' : `${pair.winMonths.length} ${pair.winMonths.length === 1 ? 'month' : 'months'}`} (${fmtRuns(Array.from({ length: 12 }, (_, i) => pair.winMonths.includes(i)))})`,
        rows: pair.months.map((r) => ({ ...r, sBand: yS.cells[r.m].band, aBand: yA.cells[r.m].band })),
        // compareFindings abbreviates the month ("Apr"); the page spells it out.
        findings: story.bestMonth.findings.map((f) => f.replace(` in ${mon}`, ` in ${MONTHS_LONG[bm]}`).replace(` for ${mon},`, ` for ${MONTHS_LONG[bm]},`)),
        glance: {
          savingsPct: Math.round(pair.savings * 100),
          safety: [
            { score: Math.round(S.safety.score), label: S.safety.label },
            { score: Math.round(A.safety.score), label: A.safety.label }
          ],
          schengen: !!S.schengen !== !!A.schengen ? [!!S.schengen, !!A.schengen] : null,
          solo: [avg(S.months.map((m) => m.cost1)), avg(A.months.map((m) => m.cost1))],
          couple: [avg(S.months.map((m) => m.cost2)), avg(A.months.map((m) => m.cost2))],
          good: [goodMonths(yS.cells), goodMonths(yA.cells)]
        },
        sameSubject: comparisons.filter((x) => x.pair.subject.key === S.key && x !== o).map((x) => ({ path: x.path, label: x.label })),
        sameAnchor: comparisons.filter((x) => x.pair.anchor.key === A.key && x !== o).map((x) => ({ path: x.path, label: x.label })),
        hubs: hubLinks(pair.subject.region),
        appCompare: appCompareUrl(S.key, A.key, bm),
        appCity: appCityUrl(S.key, bm)
      };
      const crumbs = [HOME, COMPARE, { name: o.label, href: o.path }];
      const title = compareTitle(pair);
      const description = compareDescription(story);
      const jsonLd = [
        {
          '@type': 'WebPage',
          '@id': `${SITE}${o.path}#page`,
          name: `${o.label}, month by month`,
          url: SITE + o.path,
          description: story.claim,
          about: [S, A].map((p) => ({ '@id': `${SITE}${cityPath(p.key)}#place` })),
          isPartOf: { '@type': 'WebSite', name: 'Monsoon', url: SITE }
        },
        breadcrumbLd(crumbs)
      ];
      // Share card: subject as A (its win months outlined), anchor as B, the page's dek as the claim,
      // average solo monthly cost per side (the page's "at a glance" figures).
      const ogPath = `/og/compare/${pair.slug}.png`;
      og.push({
        path: ogPath.slice(1),
        card: 'compareCard',
        data: {
          a: { name: shortName(S.name), cells: ogCells(yS.cells), cost: Math.round(view.glance.solo[0]) },
          b: { name: shortName(A.name), cells: ogCells(yA.cells), cost: Math.round(view.glance.solo[1]) },
          // The page's dek, with a parenthetical place name ("Lake Atitlán (Panajachel)") shortened so it fits one line.
          claim: story.claim.replace(S.name, shortName(S.name)).replace(A.name, shortName(A.name)),
          winMonths: [...pair.winMonths]
        }
      });
      emit(o.path, title, description, ComparePage, { v: view, crumbs }, jsonLd, 'article', {
        ogImage: ogPath,
        ogAlt: `${shortName(S.name)} vs ${shortName(A.name)}: Score by month for both cities`
      });
    }

    const bySubjectRegion = regions
      .map((region) => ({
        region,
        regionName: regionName(region),
        items: comparisons.filter((o) => o.pair.subject.region === region).map((o) => ({ path: o.path, label: o.label, claim: o.story.claim }))
      }))
      .filter((g) => g.items.length);
    const crumbs = [HOME, COMPARE];
    const title = `${comparisons.length} city comparisons, month by month | Monsoon`;
    const description =
      `${comparisons.length} lower-cost cities set beside better-known ones: which months each scores higher on weather, air, safety, season and events, and what a month costs. ` +
      `Published only when the cheaper city is at least ${Math.round(GATE.minSavings * 100)}% cheaper and wins at least ${GATE.minWinMonths} months.`;
    const jsonLd = [
      {
        '@type': 'ItemList',
        name: 'Monsoon city comparisons',
        url: SITE + COMPARE_INDEX,
        numberOfItems: comparisons.length,
        itemListElement: comparisons.map((o, k) => ({ '@type': 'ListItem', position: k + 1, name: o.label, url: SITE + o.path }))
      },
      breadcrumbLd(crumbs)
    ];
    emit(COMPARE_INDEX, title, description, CompareIndexPage, { groups: bySubjectRegion, count: comparisons.length, considered: gatePairs.length + gateRejected.length, crumbs }, jsonLd);
  }

  // ---- Default share card (dist/og.png) ----
  // Counts come from the data, so the card can never state a stale number. The
  // decorative strip is a real city picked deterministically: the most Score
  // bands in its year, then the most great months, ties by name
  // (scripts/seo/og.mjs --default makes the same pick for public/og.png).
  const nBands = (c) => new Set(years.get(c.key).cells.map((x) => x.band)).size;
  const nGreat = (c) => years.get(c.key).cells.filter((x) => x.band === 'great').length;
  const stripCity = cities.slice().sort((a, b) => nBands(b) - nBands(a) || nGreat(b) - nGreat(a) || a.name.localeCompare(b.name))[0];
  const ogDefault = {
    path: 'og.png',
    card: 'defaultCard',
    data: { cityCount: cities.length, regionCount: regions.length, cells: ogCells(years.get(stripCity.key).cells) }
  };

  // ---- sitemaps ----
  // sitemap.xml is an index of per-type sitemaps. A page marked noindex is in
  // none of them. /compare/ pages already route to sitemap-compare.xml, so the
  // compare generator only has to emit its pages through emit().
  const sitemapOf = (path) => {
    if (path === '/' || path === '/cities/' || path === BEST_INDEX) return 'core';
    if (path.startsWith('/city/')) return 'city';
    if (path.startsWith('/best/')) return 'best';
    if (path.startsWith('/compare/')) return 'compare';
    return 'core';
  };
  const SITEMAP_TYPES = ['core', 'city', 'best', 'compare']; // add a type here, plus its pages, for a new tree
  const byType = Object.fromEntries(SITEMAP_TYPES.map((t) => [t, t === 'core' ? ['/'] : []]));
  for (const pg of pages) if (!pg.noindex) byType[sitemapOf(pg.path)].push(pg.path);
  // Core keeps the app root first, then the hubs in the order they were emitted.
  const lastmod = lastUpdated ? `<lastmod>${lastUpdated}</lastmod>` : '';
  const XML = '<?xml version="1.0" encoding="UTF-8"?>\n';
  const sitemapFiles = SITEMAP_TYPES.filter((t) => byType[t].length).map((t) => ({
    type: t,
    path: `sitemap-${t}.xml`,
    urls: byType[t],
    content:
      XML +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      byType[t].map((u) => `  <url><loc>${SITE}${u}</loc>${lastmod}</url>`).join('\n') +
      '\n</urlset>\n'
  }));
  out.push({
    path: 'sitemap.xml',
    content:
      XML +
      '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      sitemapFiles.map((f) => `  <sitemap><loc>${SITE}/${f.path}</loc>${lastmod}</sitemap>`).join('\n') +
      '\n</sitemapindex>\n'
  });
  for (const f of sitemapFiles) out.push({ path: f.path, content: f.content });

  // ---- llms.txt ----
  const w = PRESETS.balanced.w;
  // A held-back value carries provenance too ("editorial"); count only named sources.
  const named = (pv) => pv && pv.srcs.some((s) => s.key !== 'editorial');
  const nClimate = cities.filter((c) => named(provFor(P(c.key), 'climate', sources))).length;
  const nAir = cities.filter((c) => named(provFor(P(c.key), 'pm25', sources))).length;
  const climateCoverage =
    nClimate + nAir === 0
      ? 'climate and PM2.5 figures are estimates without a citable source yet, being replaced with measured data.'
      : `climate figures carry a named source for ${nClimate} of ${cities.length} cities and PM2.5 for ${nAir}; the rest are estimates being replaced with measured data.`;
  const llms = [
    '# Monsoon',
    '',
    `> Monsoon (monsoon.fyi) is a seasonal planner for slow travelers and digital nomads. It scores ${cities.length} cities in ${regions.length} regions for every month of the year, so you can see when each place is at its best, and plan a year of one-to-three-month stays that respects the Schengen 90/180 rule.`,
    '',
    `Each month gets a 0–100 Score: weather ${pct(w.weather)}%, safety ${pct(w.safety)}%, air quality (PM2.5) ${pct(w.air)}%, season ${pct(w.season)}%, events ${pct(w.events)}%, scaled down when safety is below ${settings.safety_floor_threshold ?? 55}. Bands: 85+ great, 75+ good, 65+ ok. Monthly cost is itemized per city for one person and for a couple. Methodology ${METHOD_VERSION}${site.lastUpdated ? `, last updated ${site.lastUpdated}` : ''}. Some inputs are measured (homicide rates, women's safety survey), some are sourced estimates (cost), and several are editorial (season phase, event tiers, hazard flags); ${climateCoverage} Each city page says which is which.`,
    '',
    '## Hubs',
    '',
    `- [Where to be, by month and region](${SITE}${BEST_INDEX}): the twelve month rankings and the region pages`,
    `- [All cities](${SITE}/cities/): every city grouped by region, with its 12-month Score strip`,
    ...(comparisons.length ? [`- [City comparisons](${SITE}${COMPARE_INDEX}): ${comparisons.length} lower-cost cities set beside better-known ones, month by month`] : []),
    `- [The app](${SITE}/): interactive ranking, city sheets and a year planner with a Schengen meter`,
    '',
    '## Where to be, by month',
    '',
    ...MONTHS_LONG.map((M, i) => `- [Where to be in ${M}](${SITE}${monthPath(i)}): all ${cities.length} cities ranked for ${M}`),
    '',
    ...(hubs.length
      ? [
          '## Region pages',
          '',
          ...hubs.map((h) => `- [${h.title}](${SITE}${h.path}): ${h.blurb}`),
          ''
        ]
      : []),
    ...(comparisons.length
      ? [
          '## Comparisons',
          '',
          ...comparisons.map((o) => `- [${o.label}](${SITE}${o.path}): ${o.story.claim}`),
          ''
        ]
      : []),
    '## Cities',
    '',
    ...groups.flatMap((g) => g.cities.map((o) => `- [${o.c.name}, ${o.c.country}](${SITE}${cityPath(o.c.key)}): ${o.summary} From ${fmtMoney(o.minSolo)}/mo solo.`)),
    ''
  ].join('\n');
  out.push({ path: 'llms.txt', content: llms });

  return { files: out, og, ogDefault, pages: pages.length, months: MONTHS.length, skipped, hubs: hubs.map((h) => h.path) };
}
