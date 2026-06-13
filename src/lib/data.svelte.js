// Two-tier data load (methodology §9): travel-core.json is bundled and covers
// every list surface; travel-detail.json (full safety breakdown, narratives,
// climate-table fields) is fetched once the browser is idle and merged into
// the same reactive city objects, so any open CitySheet fills in live.
import core from '../generated/travel-core.json';
import detailUrl from '../generated/travel-detail.json?url';

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const MONTH_LETTERS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

export const settings = core.settings;

// ---- User settings (onboarding identity, not the exploratory lens) ----
// Persisted separately from the view/mode/preset "lens" that App.svelte owns:
// these are set-once-ish facts about the traveller that condense the UI (one
// price set) and tune scoring (women's-safety blend). Visa/passport is stubbed
// for now — see TODO below.
const SETTINGS_KEY = 'atlas.settings.v1';

function loadSettings() {
  if (typeof localStorage === 'undefined') return null;
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY));
  } catch {
    return null;
  }
}

const storedSettings = loadSettings();

// done flips true once the user has saved settings at least once; App.svelte
// shows first-run onboarding while it's false.
export const onboarded = $state({ done: storedSettings != null });

export const prefs = $state({
  party: storedSettings?.party ?? 'couple', // 'solo' | 'couple' — picks which cost field is shown everywhere
  womensSafety: storedSettings?.womensSafety ?? false, // blend the women's-safety signal into safety, orthogonal to any preset
  passport: storedSettings?.passport ?? null // TODO: visa data — would drive per-passport visa-free windows
});

export function saveSettings() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ party: prefs.party, womensSafety: prefs.womensSafety, passport: prefs.passport })
  );
  onboarded.done = true;
}

// The single monthly cost to show, per the traveller's party size. Reads prefs
// so any $derived/template that calls it re-runs when party changes.
export const cityCost = (m) => (prefs.party === 'solo' ? m.cost1 : m.cost2);
export const partyWord = () => (prefs.party === 'solo' ? 'solo' : 'couple');

export function slug(name) {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export const cities = $state(core.cities.map((c) => ({ ...c, key: slug(c.name) })));
export const cityByKey = new Map(cities.map((c) => [c.key, c]));
export const regions = [...new Set(cities.map((c) => c.region))].sort();

export const detailStatus = $state({ ready: false });

async function loadDetail() {
  const res = await fetch(detailUrl);
  if (!res.ok) throw new Error(`detail fetch failed: ${res.status}`);
  const detail = await res.json();
  // Detail entries align with core entries by index — both files are emitted
  // in one pass by scripts/split-data.mjs.
  detail.cities.forEach((d, i) => {
    const c = cities[i];
    if (d.safety) c.safety = d.safety;
    if (d.drawDetail) c.drawDetail = d.drawDetail;
    if (d.media) c.media = d.media;
    d.months?.forEach((dm, j) => Object.assign(c.months[j], dm));
  });
  detailStatus.ready = true;
}

if (typeof window !== 'undefined') {
  const kick = () => loadDetail().catch((e) => console.error('[atlas] detail layer failed to load', e));
  'requestIdleCallback' in window ? requestIdleCallback(kick) : setTimeout(kick, 1);
}

// ---- Priority presets: weights over stored component scores (methodology §6) ----
export const PRESETS = {
  balanced: {
    label: 'Balanced',
    blurb: 'The v5 defaults — weather first, safety and air close behind.',
    w: { weather: 0.35, safety: 0.24, air: 0.18, season: 0.13, events: 0.1 }
  },
  comfort: {
    label: 'Comfort-first',
    blurb: 'Chase the mildest weather; festivals barely matter.',
    w: { weather: 0.5, safety: 0.18, air: 0.2, season: 0.08, events: 0.04 }
  },
  settle: {
    label: 'Settle-in',
    blurb: 'Month-plus stays — breathable air and safe streets over buzz.',
    w: { weather: 0.3, safety: 0.26, air: 0.24, season: 0.1, events: 0.1 }
  },
  festival: {
    label: 'Festival-chaser',
    blurb: 'Be there when the city is celebrating.',
    w: { weather: 0.3, safety: 0.14, air: 0.1, season: 0.16, events: 0.3 }
  }
};

const FLOOR_T = settings.safety_floor_threshold ?? 55;
const FLOOR_MIN = settings.safety_floor_min ?? 0.6;
const VALUE_EXP = settings.value_cost_exponent ?? 0.55;

export function safetyInput(city) {
  const s = city.safety?.score ?? 50;
  // Women's-safety blend is now a global setting, orthogonal to the preset, so
  // any priority lens (comfort, festival, …) can run with it on or off.
  if (prefs.womensSafety && city.safety?.womensSafety?.sub != null) {
    return 0.5 * s + 0.5 * city.safety.womensSafety.sub;
  }
  return s;
}

export function safetyFloor(safety) {
  if (safety >= FLOOR_T) return 1;
  return FLOOR_MIN + (1 - FLOOR_MIN) * (safety / FLOOR_T);
}

// Recompute QoL client-side from stored component scores (methodology §6).
export function qolFor(city, mIdx, presetKey = 'balanced') {
  const m = city.months[mIdx];
  const w = PRESETS[presetKey].w;
  const saf = safetyInput(city);
  const base =
    w.weather * m.weather + w.safety * saf + w.air * m.air + w.season * m.seasonScore + w.events * m.eventScore;
  return safetyFloor(saf) * base;
}

export function valueFor(city, mIdx, presetKey = 'balanced', model = 'adjusted') {
  const m = city.months[mIdx];
  const qol = qolFor(city, mIdx, presetKey);
  const k = cityCost(m) / 1000;
  return qol / Math.pow(k, model === 'adjusted' ? VALUE_EXP : 1);
}

export function band(qol) {
  if (qol >= 85) return 'great';
  if (qol >= 75) return 'good';
  if (qol >= 65) return 'ok';
  return 'bad';
}

// Strip cells for a city under a preset: [{q, band, risk, fest}]
export function stripCells(city, presetKey = 'balanced') {
  return city.months.map((m, i) => {
    const q = qolFor(city, i, presetKey);
    return { q, band: band(q), risk: m.risk, fest: m.evtTier >= 3 };
  });
}

// Strip cells grouped into blocks of `size` consecutive months, each block
// averaging the quality of the months it covers (worst risk, any festival
// carried up). Mirrors a planned stay of `size` months so the picker strip
// reads as the blocks the user would actually book, not 12 single months.
// Each cell carries `from` (first month index) and `span` (months covered).
export function stripGroups(city, presetKey = 'balanced', size = 1) {
  const cells = stripCells(city, presetKey);
  if (size <= 1) return cells.map((c, i) => ({ ...c, from: i, span: 1 }));
  const out = [];
  for (let i = 0; i < 12; i += size) {
    const grp = cells.slice(i, Math.min(i + size, 12));
    const q = grp.reduce((a, c) => a + c.q, 0) / grp.length;
    out.push({
      q,
      band: band(q),
      risk: Math.max(...grp.map((c) => c.risk)),
      fest: grp.some((c) => c.fest),
      from: i,
      span: grp.length
    });
  }
  return out;
}

export function eventsInMonth(city, mIdx, minTier = 2) {
  const out = [];
  if (Array.isArray(city.events)) {
    for (const e of city.events) {
      if (e.months?.includes(mIdx + 1) && e.tier >= minTier) out.push(e);
    }
  }
  return out.sort((a, b) => b.tier - a.tier);
}

export function whyNow(city, mIdx) {
  const m = city.months[mIdx];
  const bits = [];
  if (m.riskNote) bits.push(`⚠ ${m.riskNote}`);
  else if (m.risk === 2) bits.push('⚠ severe hazard season');
  else if (m.risk === 1) bits.push('⚠ elevated hazard season');
  const ev = eventsInMonth(city, mIdx)[0];
  if (ev) bits.push(ev.name);
  const phase = { Peak: 'peak season', In: 'in season', Shoulder: 'shoulder season', Off: 'off season' }[m.season];
  if (phase) bits.push(phase);
  if (m.airCat && m.airCat !== 'Clean' && !m.riskNote) bits.push(`${m.airCat.toLowerCase()} air`);
  return bits.slice(0, 3).join(' · ');
}

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

// "Jun–Oct" for a set of swim months (1-12), handling year-wrap (Dec–Mar).
export function fmtMonthRange(months) {
  if (!months?.length) return '';
  if (months.length === 12) return 'year-round';
  const set = new Set(months);
  const start = months.find((m) => !set.has(m === 1 ? 12 : m - 1)) ?? months[0];
  let end = start;
  while (set.has(end === 12 ? 1 : end + 1)) end = end === 12 ? 1 : end + 1;
  return `${MONTHS[start - 1]}–${MONTHS[end - 1]}`;
}

export const swimNow = (city, mIdx) => city.swim?.months?.includes(mIdx + 1) ?? false;

// ---- Schengen 90/180 over a cyclic year of stays ----
// stays: [{key, start (0-11), len (1-12)}]; a month in a Schengen city ≈ 30 days.
export function stayMonths(stay) {
  return Array.from({ length: stay.len }, (_, i) => (stay.start + i) % 12);
}

export function monthOccupancy(stays) {
  const occ = Array(12).fill(null);
  for (const s of stays) for (const m of stayMonths(s)) occ[m] = s;
  return occ;
}

export function schengenCheck(stays) {
  const days = Array(12).fill(0);
  for (const s of stays) {
    const c = cityByKey.get(s.key);
    if (!c?.schengen) continue;
    for (const m of stayMonths(s)) days[m] = 30;
  }
  let worst = 0;
  let worstStart = 0;
  for (let i = 0; i < 12; i++) {
    let sum = 0;
    for (let j = 0; j < 6; j++) sum += days[(i + j) % 12];
    if (sum > worst) {
      worst = sum;
      worstStart = i;
    }
  }
  // The six month indices that make up the worst rolling 180-day window.
  const windowMonths = Array.from({ length: 6 }, (_, j) => (worstStart + j) % 12);
  return {
    worst,
    worstStart,
    windowMonths,
    schengenMonths: days.map((d) => d > 0),
    window: `${MONTHS[worstStart]}–${MONTHS[(worstStart + 5) % 12]}`,
    remaining: Math.max(0, 90 - worst),
    over: Math.max(0, worst - 90),
    ok: worst <= 90,
    tight: worst > 75 && worst <= 90,
    // Months are 30-day blocks, so the worst window is always a multiple of 30 —
    // the only compliant-but-maxed case is exactly 90 (three Schengen months).
    atLimit: worst === 90,
    anySchengen: days.some((d) => d > 0)
  };
}

export function routeStats(stays, presetKey = 'balanced') {
  let qSum = 0;
  let cSum = 0;
  let n = 0;
  let fest = 0;
  let hazard = 0;
  for (const s of stays) {
    const c = cityByKey.get(s.key);
    if (!c) continue;
    for (const m of stayMonths(s)) {
      qSum += qolFor(c, m, presetKey);
      cSum += cityCost(c.months[m]);
      if (c.months[m].evtTier >= 3) fest++;
      if (c.months[m].risk >= 1) hazard++;
      n++;
    }
  }
  return {
    months: n,
    avgQol: n ? qSum / n : 0,
    totalCost: cSum,
    avgCost: n ? cSum / n : 0,
    festivals: fest,
    hazardMonths: hazard,
    schengen: schengenCheck(stays)
  };
}

// ---- Curated route templates (§4.3) ----
export const TEMPLATES = [
  {
    id: 'dry-line',
    name: 'The Dry Line',
    blurb: 'Southeast Asia with the seasons — the route that started it all.',
    stays: [
      { key: slug('Chiang Mai'), start: 10, len: 3 },
      { key: slug('Hoi An'), start: 1, len: 3 },
      { key: slug('Bali (Canggu/Ubud)'), start: 4, len: 4 },
      { key: slug('George Town (Penang)'), start: 8, len: 2 }
    ]
  },
  {
    id: 'endless-spring',
    name: 'The Endless Spring',
    blurb: 'Highland Americas, 70°F all year, zero Schengen paperwork.',
    stays: [
      { key: slug('Oaxaca'), start: 0, len: 3 },
      { key: slug('Antigua'), start: 3, len: 2 },
      { key: slug('Cusco'), start: 5, len: 3 },
      { key: slug('Querétaro'), start: 8, len: 2 },
      { key: slug('Oaxaca'), start: 10, len: 2 }
    ]
  },
  {
    id: 'clean-air',
    name: 'The Clean Air Year',
    blurb: 'Twelve months under PM2.5 you can actually see through.',
    stays: [
      { key: slug('Auckland'), start: 0, len: 2 },
      { key: slug('Tokyo'), start: 2, len: 2 },
      { key: slug('Vancouver'), start: 4, len: 3 },
      { key: slug('Funchal (Madeira)'), start: 7, len: 3 },
      { key: slug('Cape Town'), start: 10, len: 2 }
    ]
  },
  {
    id: 'schengen-shuffle',
    name: 'The Schengen Shuffle',
    blurb: 'Europe maximized — two 90-day blocks, perfectly legal.',
    stays: [
      { key: slug('Las Palmas (Gran Canaria)'), start: 0, len: 3 },
      { key: slug('Tirana'), start: 3, len: 3 },
      { key: slug('Porto'), start: 6, len: 3 },
      { key: slug('Kotor'), start: 9, len: 3 }
    ]
  },
  {
    id: 'festival-circuit',
    name: 'The Festival Circuit',
    blurb: 'Songkran to Día de Muertos — be there when the city celebrates.',
    stays: [
      { key: slug('Mexico City'), start: 0, len: 2 },
      { key: slug('Valencia'), start: 2, len: 1 },
      { key: slug('Chiang Mai'), start: 3, len: 1 },
      { key: slug('Bali (Canggu/Ubud)'), start: 4, len: 2 },
      { key: slug('Oaxaca'), start: 6, len: 2 },
      { key: slug('Tbilisi'), start: 8, len: 2 },
      { key: slug('Mexico City'), start: 10, len: 2 }
    ]
  }
];
