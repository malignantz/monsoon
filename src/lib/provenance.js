// "Where this comes from": turns what the data actually carries into rows for
// the city sheet's source disclosures. Pure functions — no rationale, source or
// confidence is made up here. A hand-set input says "Editorial estimate" and
// shows only the note text stored with it; a metric with no provenance record
// says so plainly.
//
// Confidence chips (methodology page explains the rule):
//   high / medium / low — from the data where it carries one (cost components,
//                         per-city prov); otherwise by source type: official
//                         statistics with a stored URL = high, modelled
//                         estimates and secondary city figures = medium,
//                         unsourced estimates = low.
//   editorial           — a hand-set judgment.

// Feedback goes to public GitHub issues, prefilled with city, month and metric.
export const FEEDBACK_REPO = 'https://github.com/malignantz/monsoon';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const CHIP_LABEL = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  editorial: 'Editorial estimate'
};

export function normConfidence(c) {
  const s = String(c ?? '').toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'med' || s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  return null;
}

// "2026-06" -> "Jun 2026", "2026-10-03" -> "3 Oct 2026". Anything else passes through.
export function fmtDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(d));
  if (!m) return String(d);
  const mon = MON[Number(m[2]) - 1];
  return m[3] ? `${Number(m[3])} ${mon} ${m[1]}` : `${mon} ${m[1]}`;
}

// "2015-01-01..2024-12-31" -> "2015–2024"; "2022-09-01..2026-08-31" -> "Sep 2022 – Aug 2026".
export function fmtWindow(w) {
  if (!w) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})\s*(?:\.\.|–|-|to)\s*(\d{4})-(\d{2})-(\d{2})$/.exec(String(w).trim());
  if (!m) return String(w);
  if (m[2] === '01' && m[3] === '01' && m[5] === '12' && m[6] === '31') {
    return m[1] === m[4] ? m[1] : `${m[1]}–${m[4]}`;
  }
  return `${MON[Number(m[2]) - 1]} ${m[1]} – ${MON[Number(m[5]) - 1]} ${m[4]}`;
}

// Per-city provenance for a metric family. Tolerates both shapes the pipeline
// may write: a bare source key ("era5-om") or an object
// {source | sources, asOf, confidence, note, station, distanceKm, reanalysis}.
const PROV_KEYS = {
  climate: ['climate', 'temp', 'weather'],
  pm25: ['pm25', 'air']
};

export function provFor(city, metric, sources) {
  const p = city?.prov;
  if (!p) return null;
  let raw = null;
  for (const k of PROV_KEYS[metric] ?? [metric]) {
    if (p[k] != null) {
      raw = p[k];
      break;
    }
  }
  if (raw == null) return null;
  const o = typeof raw === 'string' ? { source: raw } : Array.isArray(raw) ? { sources: raw } : raw;
  const keys = [o.source, ...(Array.isArray(o.sources) ? o.sources : [o.sources])].filter(
    (k) => typeof k === 'string' && k
  );
  const srcs = keys.map((k) => {
    const s = sources?.[k];
    return s ? { key: k, ...s } : { key: k, name: k };
  });
  const text = srcs.map((s) => `${s.name ?? ''} ${s.method ?? ''}`).join(' ').toLowerCase();
  // A named station is a measurement, whatever the source's general method says.
  const station = o.station && o.station !== 'reanalysis' ? o.station : null;
  const reanalysis = !station && (o.reanalysis === true || o.station === 'reanalysis' || /reanalysis/.test(text));
  const modelled = !station && (reanalysis || /\bcams\b|model|forecast/.test(text));
  return {
    srcs,
    asOf: o.asOf ?? null,
    confidence: normConfidence(o.confidence) ?? (modelled ? 'medium' : station ? 'high' : null),
    note: o.note ?? null,
    station,
    distanceKm: o.distanceKm ?? o.distance ?? null,
    reanalysis,
    type: station ? 'Measured' : modelled ? 'Modelled' : null
  };
}

function provRowBits(pv) {
  const when = [];
  const win = pv.srcs.map((s) => fmtWindow(s.window)).filter(Boolean);
  if (win.length) when.push(`${[...new Set(win)].join(', ')} average`);
  if (pv.asOf) when.push(`as of ${fmtDate(pv.asOf)}`);
  else {
    const got = pv.srcs.map((s) => s.retrieved).filter(Boolean).sort().at(-1);
    if (got) when.push(`retrieved ${fmtDate(got)}`);
  }
  const notes = [];
  if (pv.station) notes.push(`Station: ${pv.station}${pv.distanceKm != null ? ` (${pv.distanceKm} km away)` : ''}`);
  else if (pv.reanalysis) notes.push('Reanalysis grid cell, not a weather station.');
  if (pv.note) notes.push(pv.note);
  return {
    sources: pv.srcs.map((s) => ({ name: s.name, url: s.url ?? null })),
    when: when.join(' · '),
    chip: pv.confidence,
    type: pv.type,
    rationale: notes.join(' ') || null,
    licence: [...new Set(pv.srcs.map((s) => s.licence).filter(Boolean))].join('; ') || null
  };
}

const ESTIMATE_SOURCE = 'Estimate — being replaced with measured data';

// ---- Month group: score, weather, hazard, air, season, events ----
export function monthRows(city, mIdx, { sources, settings, weights, presetLabel, peakPenalty, detailReady, fmtTemp }) {
  const m = city.months[mIdx];
  const s = settings ?? {};
  const pct = (x) => Math.round(x * 100);
  const rows = [];

  rows.push({
    label: 'Score',
    input: `The five sub-scores below, weighted by the ${presetLabel} lens.`,
    sources: [],
    sourceText: 'Computed on this page from the inputs below',
    method: `Weather ${pct(weights.weather)}% · safety ${pct(weights.safety)}% · air ${pct(weights.air)}% · season ${pct(weights.season)}% · events ${pct(weights.events)}%${peakPenalty ? `, minus ${peakPenalty} in peak season` : ''}. Safety below ${s.safety_floor_threshold ?? 55} scales the whole score down.`
  });

  const clim = provFor(city, 'climate', sources);
  rows.push({
    label: 'Weather',
    value: Math.round(m.weather),
    input: detailReady
      ? `Day ${fmtTemp(m.high)} / night ${fmtTemp(m.low)} · humidity ${m.hum}% · ${m.rain} rain days (monthly averages)`
      : `${m.rain} rain days (monthly average)`,
    ...(clim ? provRowBits(clim) : { sources: [], sourceText: ESTIMATE_SOURCE, chip: 'low' }),
    method: 'Temperature 40% (day high 60%, night low 40%, each against a comfort band), humidity 25%, rain days 35% on a tiered penalty.'
  });

  if (m.risk >= 1) {
    rows.push({
      label: m.risk >= 2 ? 'Severe hazard flag' : 'Hazard flag',
      input: m.riskNote || 'Seasonal hazard month',
      sources: [],
      chip: 'editorial',
      method: `Multiplies the weather score by ${m.risk >= 2 ? s.extreme_severe_mult ?? 0.55 : s.extreme_elevated_mult ?? 0.8}.`
    });
  }

  const air = provFor(city, 'pm25', sources);
  rows.push({
    label: 'Air',
    value: Math.round(m.air),
    input: detailReady ? `PM2.5 ${m.pm25} µg/m³ monthly mean (${m.airCat})` : `${m.airCat} PM2.5`,
    ...(air ? provRowBits(air) : { sources: [], sourceText: ESTIMATE_SOURCE, chip: 'low' }),
    method: `100 up to ${s.air_clean_pm ?? 10} µg/m³; −${s.air_pen_per_ug ?? 1.2} per µg/m³ to ${s.air_moderate_pm ?? 35}, then −${(s.air_pen_per_ug ?? 1.2) + (s.air_extra_pen_per_ug ?? 1.8)} per µg/m³ above. Thresholds follow the WHO 2021 guideline and interim targets.`
  });

  rows.push({
    label: 'Season',
    value: Math.round(m.seasonScore),
    input: `${m.season} season`,
    sources: [],
    chip: 'editorial',
    method: `Peak ${s.season_Peak ?? 100} · In ${s.season_In ?? 90} · Shoulder ${s.season_Shoulder ?? 70} · Off ${s.season_Off ?? 40}. The phase is hand-set per city and month.`
  });

  const tier = m.evtTier ?? 0;
  rows.push({
    label: 'Events',
    value: Math.round(m.eventScore),
    input: tier > 0
      ? `${m.evt ? `${m.evt} — ` : ''}tier ${tier} of 3`
      : 'No notable event this month (tier 0)',
    sources: [],
    chip: 'editorial',
    method: `${s.event_base ?? 50} + ${s.event_per_tier ?? 16.67} per tier. The month scores the biggest event on this city’s calendar; event dates and tiers are hand-set.`
  });

  return rows;
}

// ---- Safety group: violent, property, visitor lens, women's, advisory ----
export function safetyRows(city) {
  const saf = city.safety ?? {};
  const v = saf.violent ?? {};
  const rows = [];

  const vsrc = String(v.source ?? '');
  const whoModel = /WHO GHO/i.test(vsrc);
  const official = /World Bank|UNODC/i.test(vsrc) && !whoModel;
  rows.push({
    label: 'Violent',
    value: v.sub != null ? Math.round(v.sub) : null,
    input: v.homicideRate != null ? `Intentional homicides: ${v.homicideRate} per 100k (${v.scope ?? 'country'} figure)` : 'Intentional-homicide rate',
    sources: vsrc ? [{ name: vsrc, url: v.url ?? null }] : [],
    when: saf.asOf ? `reviewed ${fmtDate(saf.asOf)}` : '',
    chip: v.url && official ? 'high' : vsrc ? 'medium' : null,
    type: whoModel ? 'Modelled' : official ? 'Measured' : vsrc ? 'Secondary source' : null,
    method: 'A piecewise curve: 1/100k → 100, 5 → 80, 10 → 65, 30 → 35, 60 → 10.'
  });

  const p = saf.property ?? {};
  rows.push({
    label: 'Property',
    value: p.sub != null ? Math.round(p.sub) : null,
    input: 'Petty and property crime, as it affects visitors',
    sources: p.url ? [{ name: p.url, url: p.url }] : [],
    chip: 'editorial',
    rationale: p.source || null,
    when: saf.asOf ? `set ${fmtDate(saf.asOf)}` : '',
    method: 'Hand-set 0–100. Weighted 45% (violent 55%) to make the local baseline.'
  });

  const t = saf.tourist ?? {};
  const tagText = (t.tags ?? []).map((x) => String(x).replace(/-/g, ' ')).join(', ');
  rows.push({
    label: 'Visitor lens',
    value: t.modifier != null ? `×${Number(t.modifier).toFixed(2)}` : null,
    input: `Local baseline ${Math.round(saf.base ?? 0)} → visitor score ${saf.score ?? '—'}`,
    sources: [],
    sourceText: t.source ? `Guidance consulted: ${t.source}` : null,
    chip: 'editorial',
    rationale: [t.rationale, tagText ? `Tags: ${tagText}.` : ''].filter(Boolean).join(' ') || null,
    method: 'Hand-set ×0.60–1.40 for whether visitors are more insulated (above 1) or more targeted (below 1) than locals.'
  });

  const w = saf.womensSafety ?? {};
  if (w.sub != null) {
    rows.push({
      label: "Women's street-safety",
      value: Math.round(w.sub),
      input: `${w.cs ?? '—'}% of women in ${city.country} say they feel safe walking alone at night → baseline ${Math.round(w.baseline ?? 0)}`,
      sources: [{ name: w.dataSource || 'Gallup World Poll via the Georgetown WPS Index', url: w.url ?? null }],
      chip: w.url ? 'high' : 'medium',
      type: 'Measured (survey, country level)',
      method: 'Shown beside safety, not in the score unless the setting is on (then blended 50/50).'
    });
    rows.push({
      label: 'City adjustment',
      value: w.adj ? `${w.adj > 0 ? '+' : ''}${w.adj}` : '0',
      input: "Moves the country baseline for this city's conditions",
      sources: [],
      chip: 'editorial',
      rationale: w.source || null
    });
  }

  if (saf.advisory) {
    rows.push({
      label: 'US advisory (not scored)',
      input: `${saf.advisory}${saf.advisoryLevel ? ` (Level ${saf.advisoryLevel})` : ''}`,
      sources: [{ name: saf.source || 'U.S. Department of State', url: saf.url ?? null }],
      when: saf.date ? `dated ${fmtDate(saf.date)}` : '',
      chip: saf.url ? 'high' : null,
      method: 'Shown for reference. Advisories never change the safety score.'
    });
  }
  return rows;
}

// ---- Cost group: the city's itemized components ----
export function costRows(city) {
  const cp = city.costProv;
  if (!cp?.items?.length) return [];
  return cp.items.map((i) => ({
    label: i.label,
    value: `$${i.usd.toLocaleString('en-US')}`,
    input: i.note || '',
    sources: i.url ? [{ name: i.source ?? i.url, url: i.url }] : [],
    sourceText: i.url ? null : i.source ? (/estimat/i.test(i.source) ? 'Estimated (no source named)' : `${i.source} (no page link stored)`) : 'No source named',
    when: fmtDate(i.asOf ?? cp.asOf),
    chip: normConfidence(i.confidence)
  }));
}

// The newest and oldest dates behind this city's numbers, for the sheet footer.
export function cityDataDates(city, sources, meta) {
  const ds = [city.safety?.asOf ?? meta.safety, city.costProv?.asOf ?? meta.cost];
  for (const metric of ['climate', 'pm25']) {
    const pv = provFor(city, metric, sources);
    if (pv) ds.push(pv.asOf ?? pv.srcs.map((s) => s.retrieved).filter(Boolean).sort().at(-1));
  }
  const ok = ds.filter(Boolean).map((d) => String(d).slice(0, 7)).sort();
  return { from: ok[0] ?? null, to: ok.at(-1) ?? null };
}

// Prefilled GitHub issue for "Report this number".
export function reportUrl({ city, month, metric, shown }) {
  const title = `Data: ${city} · ${month} · ${metric}`;
  const body = [
    `City: ${city}`,
    `Month: ${month}`,
    `Metric: ${metric}`,
    shown ? `Shown on the site: ${shown}` : '',
    '',
    'What looks wrong, and a source if you have one:',
    ''
  ]
    .filter((l, i, a) => l !== '' || a[i - 1] !== '')
    .join('\n');
  return `${FEEDBACK_REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
