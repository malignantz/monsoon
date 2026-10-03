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
import { provFor, fmtDate, fmtWindow, normConfidence, CHIP_LABEL, reportUrl, FEEDBACK_REPO } from '../lib/provenance.js';
import { METHOD_VERSION, LAST_UPDATED } from '../lib/changelog.js';
import { CITY_IDS_V1 } from '../lib/cityIds.v1.js';
import { publicCity } from './publicData.js';
import {
  SITE,
  MONTHS_LONG,
  monthPath,
  cityPath,
  cityYear,
  relatedCities,
  rankMonth,
  monthFacts,
  hazardText
} from './derive.js';
import { BASE_CSS, minify } from './styles.js';
import { documentHtml, breadcrumbLd } from './head.js';
import CityPage from './CityPage.svelte';
import MonthPage from './MonthPage.svelte';
import CitiesPage from './CitiesPage.svelte';

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
  notes.push({ label: 'Season phase and event tiers', chip: CHIP_LABEL.editorial, text: 'Hand-set per city and month.', links: [] });
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

export function buildSite({ detail, now = new Date() }) {
  // Deterministic lens: the app's defaults (solo, women's-safety blend off),
  // whatever a local Node storage shim might hold.
  prefs.party = 'solo';
  prefs.womensSafety = false;

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
    lastUpdated: LAST_UPDATED ? fmtDate(LAST_UPDATED) : null,
    costAsOf: fmtDate(dataAsOf.cost) || '—',
    safetyAsOf: fmtDate(dataAsOf.safety) || '—',
    feedback: `${FEEDBACK_REPO}/issues`,
    reportUrl: (name) => reportUrl({ city: name, month: '(which month?)', metric: '(which number?)' })
  };

  const out = [];
  const pages = []; // {path, title} for the sitemap / llms.txt
  const emit = (path, title, description, Component, props, jsonLd, ogType) => {
    const { body, css } = renderPage(Component, { ...props, site });
    out.push({ path: `${path}index.html`, content: documentHtml({ path, title, description, ogType, jsonLd, css, body, cityCount: cities.length }) });
    pages.push({ path, title, description });
  };

  const HOME = { name: 'Monsoon', href: '/' };
  const CITIES = { name: 'Cities', href: '/cities/' };

  // ---- City pages ----
  const years = new Map(cities.map((c) => [c.key, cityYear(c)]));
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
    emit(cityPath(p.key), title, description, CityPage, { c: p, year, rows, related, sources: sourceNotes(p, year), safety, cost, crumbs }, jsonLd, 'article');
  }

  // ---- Month pages ----
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
    const crumbs = [HOME, { name: `Where to be in ${M}`, href: monthPath(i) }];
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
    emit(monthPath(i), title, description, MonthPage, { mIdx: i, facts: pubFacts, top, rest, crumbs }, jsonLd);
  }

  // ---- Cities index ----
  const groups = regions.map((region) => ({
    region,
    cities: cities
      .filter((c) => c.region === region)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ c: P(c.key), cells: years.get(c.key).cells, summary: years.get(c.key).summary, minSolo: minCost(P(c.key)) }))
  }));
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
      breadcrumbLd(crumbs)
    ];
    emit('/cities/', title, description, CitiesPage, { groups, crumbs }, jsonLd);
  }

  // ---- sitemap.xml ----
  const urls = ['/', ...pages.map((p) => p.path)];
  const sitemap =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => `  <url><loc>${SITE}${u}</loc>${lastUpdated ? `<lastmod>${lastUpdated}</lastmod>` : ''}</url>`).join('\n') +
    '\n</urlset>\n';
  out.push({ path: 'sitemap.xml', content: sitemap });

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
    `- [All cities](${SITE}/cities/): every city grouped by region, with its 12-month Score strip`,
    `- [The app](${SITE}/): interactive ranking, city sheets and a year planner with a Schengen meter`,
    '',
    '## Where to be, by month',
    '',
    ...MONTHS_LONG.map((M, i) => `- [Where to be in ${M}](${SITE}${monthPath(i)}): all ${cities.length} cities ranked for ${M}`),
    '',
    '## Cities',
    '',
    ...groups.flatMap((g) => g.cities.map((o) => `- [${o.c.name}, ${o.c.country}](${SITE}${cityPath(o.c.key)}): ${o.summary} From ${fmtMoney(o.minSolo)}/mo solo.`)),
    ''
  ].join('\n');
  out.push({ path: 'llms.txt', content: llms });

  return { files: out, pages: pages.length, months: MONTHS.length };
}
