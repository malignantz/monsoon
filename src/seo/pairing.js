// Pairing & quality engine for the programmatic comparison pages
// (GROWTH_ENGINE_PLAN §1.3 Value Floor, §7). Decides WHICH `subject vs anchor`
// pages exist and what each one truthfully claims.
//
// Contract
//   • One page per pair, covering all 12 months: /compare/<subject>-vs-<anchor>/.
//     The month-by-month verdict is on the page; a month only counts for the
//     subject when the claim is true in that month (a "win", see GATE).
//   • One direction: subject (a non-anchor) vs anchor. Never anchor-vs-anchor,
//     never subject-vs-subject. Anchors come from data/seo/fame.json.
//   • All scoring goes through the app's own qolFor (balanced lens) and
//     compareFindings. Nothing here re-implements scoring.
//   • selectPairs / pairStory are pure and deterministic: no I/O, sorted by
//     subject name then anchor name.
//   • Static pages run solo: BEFORE calling selectPairs (qolFor reads
//     prefs.womensSafety) and pairStory (compareFindings reads prefs.party),
//     the caller sets prefs.party = 'solo' and prefs.womensSafety = false.
//     src/seo/entry.js buildSite already does this; so does the report script.
import { MONTHS, qolFor, eventsInMonth, fmtMoney } from '../lib/data.svelte.js';
import { compareFindings } from '../lib/compare.js';
import { fmtRuns, MONTHS_LONG } from './derive.js';

// ---------------------------------------------------------------------------
// The gate. Exported so the report, tests and page copy can name the numbers.
// ---------------------------------------------------------------------------
export const GATE = {
  // --- the arbitrage must be real ---
  // Subject must be at least this much cheaper than the anchor, on BOTH the
  // solo base cost (city.solo) and the annual average of months[].cost1.
  minSavings: 0.2,

  // --- same comparison frame (legibility) ---
  // Same `region`, OR same macro-area AND |lat difference| <= nearbyLatDeg.
  nearbyLatDeg: 8,
  // Same-region pairs are also capped on latitude: a region label alone makes
  // "Cuenca vs Buenos Aires" or "Agadir vs Cape Town" (opposite hemispheres,
  // 30 to 65 degrees apart) read as a frame when it is not.
  sameRegionMaxLatDeg: 20,

  // --- what counts as a month the subject wins ---
  // Balanced-lens Score AS DISPLAYED (rounded) at least this many points
  // higher for the subject ...
  winMargin: 3,
  // ... AND the subject's solo cost that month <= this x the anchor's.
  winCostRatio: 0.8,
  // |rounded Score difference| below this is "even". A month that is
  // >= winMargin ahead but not cheap enough is also "even" (never an anchor
  // win): it is not a win for the subject, but the anchor did not beat it.
  evenMargin: 3,

  // A pair needs at least this many win months ...
  minWinMonths: 3,
  // ... and its best win month (largest Score margin) must lead by at least
  // this many points: no "technically 3 points higher" headline month.
  minBestMargin: 5,
  // 1 = the subject must win more months than the anchor wins outright
  // (anchor win = anchor ahead by >= evenMargin). A page that says "Sarande
  // scores higher in 2 months" while Krakow wins 4 is not a recommendation.
  winsMustExceedAnchor: 1,

  // --- the best win month must show material axes where the subject beats the anchor ---
  // Cost always counts as one, so minAxes = 2 means at least one non-cost axis.
  // Axis values are compared as displayed (rounded).
  minAxes: 2,
  // Because the Score margin is itself an axis (and minBestMargin makes it
  // always present), also require this many axes that are neither cost nor the
  // Score margin (PM2.5, heat, rain days, safety): the sentence must be able to
  // say WHY, not just "higher and cheaper".
  minSpecificAxes: 1,
  axes: {
    cost: { minSavings: 0.2 }, // that month's cost1 at least 20% lower
    pm25: { minDrop: 3, minDropFrac: 0.2 }, // >= 3 ug/m3 AND >= 20% lower
    heat: {
      hotAnchorHigh: 86, hotMinCooler: 4, // anchor high >= 86F and subject >= 4F cooler
      coldAnchorHigh: 60, coldMinWarmer: 5 // anchor high <= 60F and subject >= 5F warmer
    },
    rain: { minFewerDays: 3 }, // >= 3 fewer rain days
    safety: { minPoints: 5 }, // safety score >= 5 points higher (city-level)
    score: { minMargin: 5 } // Score margin itself >= 5
  },

  // --- fan-out caps ---
  maxAnchorsPerSubject: 3, // prefer same region, then more win months, then larger savings
  maxSubjectsPerAnchor: 8 // prefer more win months, then larger savings
};

// Macro-areas for the "nearby latitude" frame (W Asia counts as Europe).
const MACRO = {
  'E Europe': 'Europe', 'S Europe': 'Europe', 'W Europe': 'Europe', 'N Europe': 'Europe', 'W Asia': 'Europe',
  'SE Asia': 'Asia', 'E Asia': 'Asia', 'Central Asia': 'Asia',
  LATAM: 'Americas', 'S America': 'Americas', 'N America': 'Americas',
  Africa: 'Africa',
  Oceania: 'Oceania'
};
const macroOf = (region) => MACRO[region] ?? region;

const r0 = Math.round;
const sum = (xs) => xs.reduce((s, x) => s + x, 0);
const pct = (x) => Math.round(x * 100);
const fmtPct = (x) => `${pct(x)}%`;

// "A, B and C"
const list = (xs) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function frameOf(s, a) {
  if (s.region === a.region) return Math.abs(s.lat - a.lat) <= GATE.sameRegionMaxLatDeg ? 'same-region' : null;
  if (macroOf(s.region) === macroOf(a.region) && Math.abs(s.lat - a.lat) <= GATE.nearbyLatDeg) return 'nearby-latitude';
  return null;
}

// Month-by-month verdict, numbers as the app displays them (rounded Score).
function monthRows(subject, anchor) {
  const rows = [];
  for (let m = 0; m < 12; m++) {
    const sq = r0(qolFor(subject, m, 'balanced'));
    const aq = r0(qolFor(anchor, m, 'balanced'));
    const diff = sq - aq;
    const sCost = subject.months[m].cost1;
    const aCost = anchor.months[m].cost1;
    const cheapEnough = sCost <= GATE.winCostRatio * aCost;
    let winner;
    if (diff >= GATE.winMargin && cheapEnough) winner = 'subject';
    else if (Math.abs(diff) < GATE.evenMargin) winner = 'even';
    else if (diff <= -GATE.evenMargin) winner = 'anchor';
    else winner = 'even';
    rows.push({ m, sq, aq, diff, sCost, aCost, winner });
  }
  return rows;
}

// The axes on which the subject materially beats the anchor in month m.
function axesFor(pubS, pubA, m, row) {
  const A = GATE.axes;
  const out = [];
  const sp = pubS.months[m];
  const ap = pubA.months[m];

  if (row.sCost <= (1 - A.cost.minSavings) * row.aCost) {
    out.push({
      key: 'cost', label: 'Cost', subject: r0(row.sCost), anchor: r0(row.aCost), unit: '$/mo solo',
      text: `${fmtMoney(row.sCost)} vs ${fmtMoney(row.aCost)} a month solo`
    });
  }
  const sPm = sp.pm25 != null ? r0(sp.pm25) : null;
  const aPm = ap.pm25 != null ? r0(ap.pm25) : null;
  if (sPm != null && aPm != null && aPm - sPm >= A.pm25.minDrop && sPm <= (1 - A.pm25.minDropFrac) * aPm) {
    out.push({ key: 'pm25', label: 'PM2.5', subject: sPm, anchor: aPm, unit: 'µg/m³', text: `PM2.5 ${sPm} vs ${aPm} µg/m³` });
  }
  const sH = sp.high != null ? r0(sp.high) : null;
  const aH = ap.high != null ? r0(ap.high) : null;
  if (sH != null && aH != null) {
    const cooler = aH >= A.heat.hotAnchorHigh && aH - sH >= A.heat.hotMinCooler;
    const warmer = aH <= A.heat.coldAnchorHigh && sH - aH >= A.heat.coldMinWarmer;
    if (cooler || warmer) {
      out.push({ key: 'heat', label: cooler ? 'Cooler highs' : 'Warmer highs', subject: sH, anchor: aH, unit: '°F', text: `highs of ${sH}°F vs ${aH}°F` });
    }
  }
  const sR = sp.rain != null ? r0(sp.rain) : null;
  const aR = ap.rain != null ? r0(ap.rain) : null;
  if (sR != null && aR != null && aR - sR >= A.rain.minFewerDays) {
    out.push({ key: 'rain', label: 'Rain days', subject: sR, anchor: aR, unit: 'days', text: `${sR} vs ${aR} rain days` });
  }
  const sSaf = pubS.safety?.score != null ? r0(pubS.safety.score) : null;
  const aSaf = pubA.safety?.score != null ? r0(pubA.safety.score) : null;
  if (sSaf != null && aSaf != null && sSaf - aSaf >= A.safety.minPoints) {
    out.push({ key: 'safety', label: 'Safety', subject: sSaf, anchor: aSaf, unit: 'pts', text: `safety score ${sSaf} vs ${aSaf}` });
  }
  if (row.diff >= A.score.minMargin) {
    out.push({ key: 'score', label: 'Score', subject: row.sq, anchor: row.aq, unit: 'pts', text: `Score ${row.sq} vs ${row.aq}` });
  }
  return out;
}

// Evaluate one frame-eligible (subject, anchor) pair. Returns { pair } or { reason }.
function evaluate(subject, anchor, frame, pubByKey) {
  const savings = 1 - subject.solo / anchor.solo;
  const avgS = sum(subject.months.map((x) => x.cost1)) / 12;
  const avgA = sum(anchor.months.map((x) => x.cost1)) / 12;
  const avgSavings = 1 - avgS / avgA;
  if (savings < GATE.minSavings) {
    return { reason: `savings: ${fmtPct(savings)} cheaper on solo base cost (${fmtMoney(subject.solo)} vs ${fmtMoney(anchor.solo)}), needs >= ${fmtPct(GATE.minSavings)}` };
  }
  if (avgSavings < GATE.minSavings) {
    return { reason: `savings: ${fmtPct(avgSavings)} cheaper on annual average cost1 (${fmtMoney(avgS)} vs ${fmtMoney(avgA)}), needs >= ${fmtPct(GATE.minSavings)}` };
  }

  const months = monthRows(subject, anchor);
  const winMonths = months.filter((r) => r.winner === 'subject').map((r) => r.m);
  const anchorMonths = months.filter((r) => r.winner === 'anchor').map((r) => r.m);
  if (winMonths.length < GATE.minWinMonths) {
    return { reason: `win months: ${winMonths.length} (needs >= ${GATE.minWinMonths}; a win is Score >= +${GATE.winMargin} and cost <= ${GATE.winCostRatio}x the anchor's)` };
  }

  if (GATE.winsMustExceedAnchor && winMonths.length <= anchorMonths.length) {
    return { reason: `balance: ${winMonths.length} win months vs ${anchorMonths.length} anchor wins; the subject must win more months than the anchor` };
  }

  // Best month = largest win margin (ties: more axes, then earliest).
  const pubS = pubByKey.get(subject.key);
  const pubA = pubByKey.get(anchor.key);
  let bestMonth = null;
  let bestAxes = [];
  for (const m of winMonths) {
    const ax = axesFor(pubS, pubA, m, months[m]);
    if (bestMonth == null || months[m].diff > months[bestMonth].diff || (months[m].diff === months[bestMonth].diff && ax.length > bestAxes.length)) {
      bestMonth = m;
      bestAxes = ax;
    }
  }
  if (months[bestMonth].diff < GATE.minBestMargin) {
    return { reason: `margin: best win month ${MONTHS[bestMonth]} leads by only ${months[bestMonth].diff} (needs >= ${GATE.minBestMargin})` };
  }
  if (bestAxes.length < GATE.minAxes) {
    return { reason: `axes: best win month ${MONTHS[bestMonth]} (+${months[bestMonth].diff}) shows ${bestAxes.length} material axis (${bestAxes.map((a) => a.key).join(', ') || 'none'}), needs >= ${GATE.minAxes}` };
  }
  const specific = bestAxes.filter((a) => a.key !== 'cost' && a.key !== 'score');
  if (specific.length < GATE.minSpecificAxes) {
    return { reason: `axes: best win month ${MONTHS[bestMonth]} (+${months[bestMonth].diff}) has no material reason beyond cost and Score (PM2.5, heat, rain days, safety), needs >= ${GATE.minSpecificAxes}` };
  }
  const ORDER = ['pm25', 'heat', 'rain', 'safety', 'score', 'cost'];
  bestAxes.sort((x, y) => ORDER.indexOf(x.key) - ORDER.indexOf(y.key));

  return {
    pair: { slug: `${subject.key}-vs-${anchor.key}`, subject, anchor, frame, savings, months, winMonths, anchorMonths, bestMonth, axes: bestAxes }
  };
}

// cities: core city objects; pubByKey: Map key -> publicCity(...); fame: parsed fame.json.
// Returns { pairs, rejected }: rejected = [{ subject, anchor, reason }] (city names)
// for every frame-eligible pair that failed the gate or was dropped by a cap.
export function selectPairs(cities, pubByKey, fame) {
  const byKey = new Map(cities.map((c) => [c.key, c]));
  const anchorKeys = fame?.anchor ?? [];
  const unknown = anchorKeys.filter((k) => !byKey.has(k));
  if (unknown.length) throw new Error(`[pairing] fame.json names unknown city keys: ${unknown.join(', ')}`);
  for (const c of cities) if (!pubByKey.has(c.key)) throw new Error(`[pairing] no public data for ${c.key}`);

  const anchors = new Set(anchorKeys);
  const subjects = cities.filter((c) => !anchors.has(c.key));
  const anchorCities = anchorKeys.map((k) => byKey.get(k));

  const rejected = [];
  const passed = [];
  for (const subject of subjects) {
    for (const anchor of anchorCities) {
      const frame = frameOf(subject, anchor);
      if (!frame) continue;
      const res = evaluate(subject, anchor, frame, pubByKey);
      if (res.pair) passed.push(res.pair);
      else rejected.push({ subject: subject.name, anchor: anchor.name, reason: res.reason });
    }
  }

  // Cap 1: anchors per subject (same region first, then win months, then savings).
  const keep = [];
  const bySubject = new Map();
  for (const p of passed) {
    if (!bySubject.has(p.subject.key)) bySubject.set(p.subject.key, []);
    bySubject.get(p.subject.key).push(p);
  }
  for (const ps of bySubject.values()) {
    ps.sort(
      (a, b) =>
        (b.frame === 'same-region') - (a.frame === 'same-region') ||
        b.winMonths.length - a.winMonths.length ||
        b.savings - a.savings ||
        a.anchor.name.localeCompare(b.anchor.name)
    );
    ps.forEach((p, i) => {
      if (i < GATE.maxAnchorsPerSubject) keep.push(p);
      else {
        rejected.push({
          subject: p.subject.name,
          anchor: p.anchor.name,
          reason: `cap: ${p.subject.name} already has ${GATE.maxAnchorsPerSubject} preferred anchors (this one: ${p.winMonths.length} win months, ${fmtPct(p.savings)} cheaper)`
        });
      }
    });
  }

  // Cap 2: subjects per anchor (more win months, then savings).
  const final = [];
  const byAnchor = new Map();
  for (const p of keep) {
    if (!byAnchor.has(p.anchor.key)) byAnchor.set(p.anchor.key, []);
    byAnchor.get(p.anchor.key).push(p);
  }
  for (const ps of byAnchor.values()) {
    ps.sort((a, b) => b.winMonths.length - a.winMonths.length || b.savings - a.savings || a.subject.name.localeCompare(b.subject.name));
    ps.forEach((p, i) => {
      if (i < GATE.maxSubjectsPerAnchor) final.push(p);
      else {
        rejected.push({
          subject: p.subject.name,
          anchor: p.anchor.name,
          reason: `cap: ${p.anchor.name} already has ${GATE.maxSubjectsPerAnchor} subjects with more win months or savings (this one: ${p.winMonths.length} win months, ${fmtPct(p.savings)} cheaper)`
        });
      }
    });
  }

  final.sort((x, y) => x.subject.name.localeCompare(y.subject.name) || x.anchor.name.localeCompare(y.anchor.name));
  rejected.sort((x, y) => x.subject.localeCompare(y.subject) || x.anchor.localeCompare(y.anchor));
  return { pairs: final, rejected };
}

const MAX_SENTENCE_REASONS = 3;
const flags = (months) => Array.from({ length: 12 }, (_, i) => months.includes(i));
const pts = (n) => `${n} ${n === 1 ? 'point' : 'points'}`;

// The data-derived copy for a pair's page. Every number comes from pair.months /
// pair.axes (rounded as the app displays them) or from compareFindings.
// Precondition: prefs.party === 'solo' (compareFindings reads it).
export function pairStory(pair, pubSubject, pubAnchor) {
  const S = pair.subject.name;
  const A = pair.anchor.name;
  const n = pair.winMonths.length;
  const savingsPct = pct(pair.savings);
  const winText = n === 12 ? 'in every month of the year' : `in ${n} months of the year (${fmtRuns(flags(pair.winMonths))})`;

  const title = `${S} vs ${A}: ${S} scores higher ${n === 12 ? 'every month' : `in ${n} months`} for ${savingsPct}% less`;
  const claim = `${S} scores higher than ${A} ${winText} and costs about ${savingsPct}% less, solo.`;

  // Best month: both Scores up front, then the material deltas (cost last).
  const bm = pair.bestMonth;
  const row = pair.months[bm];
  // Cost always; then at most MAX_SENTENCE_REASONS others in axis order, so the
  // sentence stays readable when five axes qualify. pair.axes keeps all of them.
  const reasons = pair.axes.filter((a) => a.key !== 'cost' && a.key !== 'score').slice(0, MAX_SENTENCE_REASONS);
  const shown = [...reasons, ...pair.axes.filter((a) => a.key === 'cost')];
  const deltas = shown.map((a) => a.text);
  const sentence = `In ${MONTHS_LONG[bm]} ${S} scores ${row.sq} and ${A} ${row.aq}: ${list(deltas)}.`;
  const findings = compareFindings([pair.subject, pair.anchor], bm, 'balanced');
  const events = eventsInMonth(pubSubject, bm, 3).map((e) => e.name);

  // The honest other side.
  let anchorSide;
  if (pair.anchorMonths.length) {
    const gaps = pair.anchorMonths.map((m) => -pair.months[m].diff);
    const lo = Math.min(...gaps);
    const hi = Math.max(...gaps);
    anchorSide = `${A} is the better pick in ${fmtRuns(flags(pair.anchorMonths))}, scoring ${lo === hi ? pts(lo) : `${lo} to ${pts(hi)}`} higher.`;
  } else {
    const ahead = pair.months.filter((r) => r.aq > r.sq);
    if (ahead.length) {
      const hi = Math.max(...ahead.map((r) => r.aq - r.sq));
      anchorSide = `${A} edges ahead of ${S} in ${fmtRuns(flags(ahead.map((r) => r.m)))}, by at most ${pts(hi)}, which is too close to call.`;
    } else {
      anchorSide = `${A} does not score higher than ${S} in any month.`;
    }
  }

  // Months that are neither a subject win nor an anchor win.
  // Months already named in the "edges ahead" sentence are not repeated here.
  const named = new Set(pair.anchorMonths.length ? [] : pair.months.filter((r) => r.aq > r.sq).map((r) => r.m));
  const close = pair.months.filter((r) => r.winner === 'even' && Math.abs(r.diff) < GATE.evenMargin && !named.has(r.m));
  const notCheap = pair.months.filter((r) => r.winner === 'even' && r.diff >= GATE.winMargin);
  const parts = [];
  if (close.length) {
    const gap = Math.max(...close.map((r) => Math.abs(r.diff)));
    const when = fmtRuns(flags(close.map((r) => r.m)));
    parts.push(gap === 0 ? `In ${when} the two Scores are equal.` : `In ${when} the two Scores are within ${pts(gap)} of each other.`);
  }
  if (notCheap.length) {
    parts.push(`In ${fmtRuns(flags(notCheap.map((r) => r.m)))} ${S} scores higher but is less than ${pct(1 - GATE.winCostRatio)}% cheaper.`);
  }
  const evenSide = parts.length ? parts.join(' ') : null;

  // Distinct numeric deltas in the best-month sentence: both Scores, plus each axis.
  const numericDeltas = new Set(['score', ...shown.map((a) => a.key)]).size;

  return { title, claim, bestMonth: { month: bm, sentence, findings, events }, anchorSide, evenSide, numericDeltas };
}
