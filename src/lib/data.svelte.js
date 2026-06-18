// Two-tier data load (methodology §9): travel-core.json is bundled and covers
// every list surface; travel-detail.json (full safety breakdown, narratives,
// climate-table fields) is fetched once the browser is idle and merged into
// the same reactive city objects, so any open CitySheet fills in live.
import { SvelteSet } from 'svelte/reactivity';
import core from '../generated/travel-core.json';
import detailUrl from '../generated/travel-detail.json?url';
import { CITY_IDS_V1 } from './cityIds.v1.js';
import { track } from './analytics.js';

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
  party: storedSettings?.party ?? 'solo', // 'solo' | 'couple' — picks which cost field is shown everywhere
  womensSafety: storedSettings?.womensSafety ?? false, // blend the women's-safety signal into safety, orthogonal to any preset
  passport: storedSettings?.passport ?? null // TODO: visa data — would drive per-passport visa-free windows
});

export function saveSettings() {
  if (typeof localStorage === 'undefined') return;
  // First save = onboarding complete (the highest-friction moment). Later saves
  // are ordinary settings changes — tracked separately so the activation funnel
  // stays clean.
  const firstTime = !onboarded.done;
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({ party: prefs.party, womensSafety: prefs.womensSafety, passport: prefs.passport })
  );
  onboarded.done = true;
  track(firstTime ? 'onboarding_complete' : 'settings_save', {
    party: prefs.party,
    womensSafety: prefs.womensSafety
  });
}

// ---- Favorites: a lightweight saved shortlist, persisted as a list of keys ----
const FAVORITES_KEY = 'atlas.favorites.v1';

function loadFavorites() {
  if (typeof localStorage === 'undefined') return [];
  try {
    const a = JSON.parse(localStorage.getItem(FAVORITES_KEY));
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}

// SvelteSet so .has()/.add()/.delete() drive reactivity wherever favorites are read.
export const favorites = new SvelteSet(loadFavorites());

export const isFavorite = (key) => favorites.has(key);

export function toggleFavorite(key) {
  if (favorites.has(key)) favorites.delete(key);
  else favorites.add(key);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
  }
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

// ---- "Optimize for" lenses: weights over stored component scores (methodology §6) ----
export const PRESETS = {
  balanced: {
    label: 'Balanced',
    blurb: 'Weather, safety, and air lead; season and events add a smaller nudge.',
    w: { weather: 0.35, safety: 0.24, air: 0.18, season: 0.13, events: 0.1 }
  },
  livability: {
    label: 'Livability',
    blurb: 'Daily-life comfort: weather, safety, and air, with a small peak-season crowd penalty.',
    w: { weather: 0.38, safety: 0.32, air: 0.3, season: 0, events: 0 },
    peakPenalty: 4
  },
  highSeason: {
    label: 'High season',
    blurb: 'Prioritizes in-season months and major events.',
    w: { weather: 0.3, safety: 0.14, air: 0.1, season: 0.16, events: 0.3 }
  }
};

export const PRESET_ALIASES = {
  comfort: 'livability',
  settle: 'livability',
  festival: 'highSeason'
};

export function normalizePresetKey(key) {
  return PRESETS[key] ? key : (PRESET_ALIASES[key] ?? 'balanced');
}

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

// Recompute the headline Score client-side from stored component scores (methodology §6).
export function qolFor(city, mIdx, presetKey = 'balanced') {
  const m = city.months[mIdx];
  const preset = PRESETS[normalizePresetKey(presetKey)];
  const w = preset.w;
  const saf = safetyInput(city);
  const base =
    w.weather * m.weather + w.safety * saf + w.air * m.air + w.season * m.seasonScore + w.events * m.eventScore;
  const peakPenalty = m.season === 'Peak' ? (preset.peakPenalty ?? 0) : 0;
  return Math.max(0, safetyFloor(saf) * base - peakPenalty);
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

// Strip cells for a city under a preset:
// [{q, band, risk, fest, weather, air, season, events, airCat, seasonPhase}]
// Carries every month-varying component of the headline Score (safety is the
// one static input) so tooltips can break down what drives each month.
export function stripCells(city, presetKey = 'balanced') {
  return city.months.map((m, i) => {
    const q = qolFor(city, i, presetKey);
    return {
      q,
      band: band(q),
      risk: m.risk,
      fest: m.evtTier >= 3,
      weather: m.weather,
      air: m.air,
      season: m.seasonScore,
      events: m.eventScore,
      airCat: m.airCat,
      seasonPhase: m.season
    };
  });
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

// Seed-route generator: turns the dataset into a ready-made year so the planner
// never opens on a blank canvas. Used two ways — as the faint "ghost" example on
// the empty board (adopt in one tap or dismiss), and behind the "Build me a year"
// chooser, where each STYLE re-seeds the preview live before the user commits.
//
// Greedy and pure (no randomness): walk the year in three-month blocks and, for
// each block, take the best-scoring candidate that keeps the route Schengen-legal
// and adds geographic variety (a multiplicative nudge — scale-independent across
// the quality/value score ranges — spreads the year across the map instead of
// parking it in one region). Deterministic input → identical route every render.
//
// Styles:
//   'quality'      max average Score for each block (the default ghost)
//   'value'        max Best-Value (livability per dollar)
//   'festival'     Score, boosted toward blocks that land a major festival
//   'nonschengen'  Score, but only non-Schengen cities (sidesteps the 90/180 cap)
//   'favorites'    Score, drawn only from the user's saved cities
//
// A pool too small to fill all four blocks (e.g. few favorites) just yields a
// shorter route — callers surface that honestly rather than padding it.
const SEED_LEN = 3;

export function generateRoute(style = 'quality', presetKey = 'balanced') {
  let pool = cities;
  if (style === 'nonschengen') pool = cities.filter((c) => !c.schengen);
  else if (style === 'favorites') pool = cities.filter((c) => favorites.has(c.key));

  const blockScore = (c, months) => {
    if (style === 'value') return months.reduce((a, m) => a + valueFor(c, m, presetKey), 0) / months.length;
    let s = months.reduce((a, m) => a + qolFor(c, m, presetKey), 0) / months.length;
    if (style === 'festival') {
      const fests = months.reduce((a, m) => a + (c.months[m].evtTier >= 3 ? 1 : 0), 0);
      s += fests * 8; // pull a real festival into the block when it's close on Score
    }
    return s;
  };

  const stays = [];
  const usedRegions = new Set();
  const usedKeys = new Set();
  for (let start = 0; start < 12; start += SEED_LEN) {
    const months = [];
    for (let i = 0; i < SEED_LEN; i++) months.push((start + i) % 12);
    let best = null;
    let bestScore = -Infinity;
    for (const c of pool) {
      if (usedKeys.has(c.key)) continue;
      // Keep every seed honest: never place a Schengen city that would breach the
      // 90/180 cap the tool warns about everywhere else.
      if (c.schengen && !schengenCheck([...stays, { key: c.key, start, len: SEED_LEN }]).ok) continue;
      let s = blockScore(c, months);
      if (usedRegions.has(c.region)) s *= 0.93;
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (!best) continue;
    stays.push({ key: best.key, start, len: SEED_LEN });
    usedRegions.add(best.region);
    usedKeys.add(best.key);
  }
  return stays;
}

// The default ghost example is the quality seed.
export function exampleRoute(presetKey = 'balanced') {
  return generateRoute('quality', presetKey);
}

// ---- Shareable routes: the whole itinerary lives in the URL, no backend ----
//
// Two formats, both decoded on load:
//   • `?i=…`     compact, the one we EMIT. base64url of a versioned byte payload
//                (see encodeRouteCompact). ~12 chars for a typical year.
//   • `?route=…` readable `key~start~len_…`, kept as a debug/hand-authoring
//                fallback. Self-documenting but long.
//
// Durability: compact links resolve city IDs against the frozen CITY_IDS_V1
// table and dispatch on a version byte, so a v1 link decodes forever — even if
// cities are added/reordered or a future v2 format ships. See docs/itinerary-sharing.md.

const ROUTE_VERSION = 1;

const ID_BY_SLUG_V1 = new Map(CITY_IDS_V1.map((slug, id) => [slug, id]));

// Old encoded slug → current key, for cities renamed since v1. Lets old links
// keep resolving without ever editing the frozen table.
const SLUG_ALIASES = {
  'las-palmas-gran-canaria': 'las-palmas'
};

if (import.meta.env?.DEV) {
  const missing = cities.filter((c) => !ID_BY_SLUG_V1.has(c.key)).map((c) => c.key);
  if (missing.length)
    console.warn(
      `[share] ${missing.length} cities missing a v1 ID — append them to cityIds.v1.js and run \`npm run check:ids\`:`,
      missing
    );
}

// --- base64url (no padding), dependency-free ---
function bytesToB64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(str) {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Compact v1: [version][cityId, (start<<4)|(len-1)] per stay → base64url. Stays
// whose city has no v1 ID are dropped (can't be encoded compactly).
export function encodeRouteCompact(stays) {
  const bytes = [ROUTE_VERSION];
  for (const s of stays) {
    const id = ID_BY_SLUG_V1.get(s.key);
    if (id == null || id > 255) continue;
    bytes.push(id, ((s.start & 0x0f) << 4) | ((s.len - 1) & 0x0f));
  }
  return bytesToB64url(Uint8Array.from(bytes));
}

export function decodeRouteCompact(str) {
  if (!str) return [];
  let bytes;
  try {
    bytes = b64urlToBytes(str);
  } catch {
    return [];
  }
  if (bytes.length < 1 || bytes[0] !== ROUTE_VERSION) return [];
  const stops = [];
  for (let i = 1; i + 1 < bytes.length; i += 2) {
    const key = SLUG_ALIASES[CITY_IDS_V1[bytes[i]]] ?? CITY_IDS_V1[bytes[i]];
    stops.push({ key, start: (bytes[i + 1] >> 4) & 0x0f, len: (bytes[i + 1] & 0x0f) + 1 });
  }
  return sanitizeStays(stops);
}

// `?route=key~start~len_…` — readable fallback format.
export function encodeRoute(stays) {
  return stays.map((s) => `${s.key}~${s.start}~${s.len}`).join('_');
}

export function decodeRoute(str) {
  if (!str) return [];
  return sanitizeStays(
    str.split('_').map((part) => {
      const [key, startRaw, lenRaw] = part.split('~');
      return { key, start: Number(startRaw), len: Number(lenRaw) };
    })
  );
}

// Shared by both decoders: drop stays with an unknown city or out-of-range
// values, and skip any whose months collide with one already placed
// (monthOccupancy is last-wins on overlap), so a hand-edited or stale link can't
// produce a broken board.
function sanitizeStays(stops) {
  const occ = Array(12).fill(false);
  const out = [];
  for (const { key, start, len } of stops) {
    if (!key || !cityByKey.has(key)) continue;
    if (!Number.isInteger(start) || start < 0 || start > 11) continue;
    if (!Number.isInteger(len) || len < 1 || len > 12) continue;
    const months = Array.from({ length: len }, (_, i) => (start + i) % 12);
    if (months.some((m) => occ[m])) continue;
    months.forEach((m) => (occ[m] = true));
    out.push({ key, start, len });
  }
  return out;
}

// A clean share URL: drop any existing query (?city=, a previous ?route=) and set
// just the params we want, so links are minimal and don't leak the sharer's state.
export function shareUrl(params) {
  const u = new URL(location.origin + location.pathname);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

// Share a link via the native share sheet when available (mobile), otherwise
// fall back to copying. Returns 'shared' | 'copied' | false so callers can show
// the right feedback ("Shared" vs "Copied"). A user-cancelled share sheet
// (AbortError) returns false without falling back to copy.
export async function shareOrCopy({ url, title, text }) {
  if (navigator.share) {
    try {
      await navigator.share({ url, title, text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      // Any other failure (e.g. share not permitted) falls through to copy.
    }
  }
  return (await copyText(url)) ? 'copied' : false;
}

// Clipboard with a legacy execCommand fallback for non-secure contexts.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
