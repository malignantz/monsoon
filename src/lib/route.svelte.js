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
//
// Loading is forgiving: renamed city keys migrate through SLUG_ALIASES and a
// stay that no longer resolves (unknown city, bad range, overlap) is dropped on
// its own, so one stale key can't wipe the whole saved year.
import { cityByKey, monthOccupancy, sanitizeStays } from './data.svelte.js';

const STORE = 'atlas.route.v1';

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE));
    const stays = Array.isArray(raw) ? raw : raw?.stays;
    const name = !Array.isArray(raw) && typeof raw?.name === 'string' ? raw.name : '';
    return { stays: Array.isArray(stays) ? sanitizeStays(stays) : [], name };
  } catch {
    return { stays: [], name: '' };
  }
}

const loaded = load();

// The live itinerary. Mutate `route.stays` / `route.name` and persistence +
// every derived view (occupancy, stats, Schengen) update automatically.
export const route = $state({ stays: loaded.stays, name: loaded.name });

// Persist on any change, including the trip-name field's keystrokes. $effect.root
// is the supported way to run an effect outside a component; it lives for the
// app's lifetime, which is exactly what a persistence effect wants.
//
// Nothing is written until the route actually differs from what was loaded. The
// loaded route is either identical to what's stored or a lossy cleanup of it
// (dropped stays, an unreadable blob), and echoing that back on boot would make
// the loss permanent before the user has touched anything. The first real edit
// writes the clean form.
if (typeof window !== 'undefined') {
  $effect.root(() => {
    let last = JSON.stringify({ name: loaded.name, stays: loaded.stays });
    $effect(() => {
      const value = JSON.stringify({ name: route.name, stays: route.stays });
      if (value === last) return;
      last = value;
      localStorage.setItem(STORE, value);
    });
  });
}

// First open month at or after `from`, walking forward and wrapping Dec→Jan;
// -1 when the year is full. `from` outside 0-11 starts the search at Jan.
export function nextOpenMonth(from, occ = monthOccupancy(route.stays)) {
  const base = from >= 0 && from <= 11 ? from : 0;
  for (let i = 0; i < 12; i++) {
    const m = (base + i) % 12;
    if (occ[m] === null) return m;
  }
  return -1;
}

// Length of the open run of months starting at `from` (wraps Dec→Jan).
export function freeRun(from, occ = monthOccupancy(route.stays)) {
  let n = 0;
  while (n < 12 && occ[(from + n) % 12] === null) n++;
  return n;
}

// Add a city to the year. Tries to place it at `start` for `len` months; if that
// month is taken, moves forward to the next open month after it (the first open
// month of the year when unspecified) and fits the stay into the available run.
// Returns a result describing what happened so callers can confirm with an
// accurate message and offer Undo.
//
//   { ok: true, stay, start, len, bumped }   placed (bumped: requested month was taken)
//   { ok: false, reason: 'full' | 'unknown' } nothing changed
export function addCity(key, { start = -1, len = 2 } = {}) {
  if (!cityByKey.has(key)) return { ok: false, reason: 'unknown' };
  const occ = monthOccupancy(route.stays);
  let s = start;
  const requested = start;
  if (s < 0 || s > 11 || occ[s] !== null) s = nextOpenMonth(s, occ);
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
