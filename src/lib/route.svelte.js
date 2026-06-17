// The user's itinerary, as a single shared source of truth.
//
// This used to live entirely inside MyYear.svelte, which made browse and plan
// two islands: the city sheet could save/share a city but had no way to add it
// to the year without switching views and re-finding the month. Lifting the
// route here lets any surface (city sheet, cards) add to it directly, while My
// year still drives all the editing UI.
//
// Shape on disk (localStorage `atlas.route.v1`): `{ name, stays }`, where each
// stay is `{ key, start (0-11), len (1-12) }`. Older builds saved a bare stays
// array; that's migrated as an unnamed route so saved years keep loading.
import { cityByKey, monthOccupancy } from './data.svelte.js';

const STORE = 'atlas.route.v1';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    const stays = Array.isArray(raw) ? raw : raw?.stays;
    const name = !Array.isArray(raw) && typeof raw?.name === 'string' ? raw.name : '';
    if (Array.isArray(stays) && stays.every((x) => cityByKey.has(x.key))) {
      return { stays, name };
    }
  } catch {}
  return { stays: [], name: '' };
}

const loaded = load();

// The live itinerary. Mutate `route.stays` / `route.name` and persistence +
// every derived view (occupancy, stats, Schengen) update automatically.
export const route = $state({ stays: loaded.stays, name: loaded.name });

// Persist on any change, including the trip-name field's keystrokes. $effect.root
// is the supported way to run an effect outside a component; it lives for the
// app's lifetime, which is exactly what a persistence effect wants.
if (typeof window !== 'undefined') {
  $effect.root(() => {
    $effect(() => {
      localStorage.setItem(STORE, JSON.stringify({ name: route.name, stays: route.stays }));
    });
  });
}

// Length of the open run of months starting at `from` (wraps Dec→Jan).
export function freeRun(from, occ = monthOccupancy(route.stays)) {
  let n = 0;
  while (n < 12 && occ[(from + n) % 12] === null) n++;
  return n;
}

// Add a city to the year. Tries to place it at `start` for `len` months; if that
// month is taken (or unspecified), falls back to the first open month and fits
// the stay into the available run. Returns a result describing what happened so
// callers can confirm with an accurate message and offer Undo.
//
//   { ok: true, stay, start, len, bumped }   placed (bumped: requested month was taken)
//   { ok: false, reason: 'full' | 'unknown' } nothing changed
export function addCity(key, { start = -1, len = 2 } = {}) {
  if (!cityByKey.has(key)) return { ok: false, reason: 'unknown' };
  const occ = monthOccupancy(route.stays);
  let s = start;
  const requested = start;
  if (s < 0 || s > 11 || occ[s] !== null) {
    s = occ.findIndex((x) => x === null);
  }
  if (s < 0) return { ok: false, reason: 'full' };
  const length = Math.max(1, Math.min(len, freeRun(s, occ)));
  route.stays = [...route.stays, { key, start: s, len: length }];
  // Return the *stored* element, not the literal above: $state deep-proxies array
  // members, so the proxy is what removeStayRef must match by reference (Undo).
  const stay = route.stays[route.stays.length - 1];
  return { ok: true, stay, start: s, len: length, bumped: requested >= 0 && requested <= 11 && requested !== s };
}

// Remove a specific stay (by reference). Used by Undo and by My year's controls.
export function removeStayRef(stay) {
  route.stays = route.stays.filter((s) => s !== stay);
}

// Whether the year has at least one open month — drives whether browse surfaces
// should even offer an add affordance.
export function hasOpenMonth() {
  return monthOccupancy(route.stays).some((x) => x === null);
}
