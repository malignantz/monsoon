// POST /api/e — first-party event sink. One Analytics Engine data point per
// event; nothing else is stored.
//
// Privacy line: this reads the request body and the request's own hostname,
// and nothing else. It never touches the IP, user agent, cookies, or Referer
// (only the `path` the page reports about itself). No identifiers are minted.
//
// Layout of each data point (read back by scripts/analytics-report.mjs):
//   index1  = event
//   blob1..8 = event, city, month, from, surface, style, host, path
//   double1, double2 = event-specific counts (see COUNTS)

// The 13 track() names in the app, plus `entry` (a landing from a static page).
export const EVENTS = [
  'surface_view', 'city_sheet_open', 'city_sheet_close', 'add_to_year', 'year_fill',
  'compare_add', 'compare_open', 'cost_weight_set', 'shared_route_adopt',
  'itinerary_copy_text', 'onboarding_complete', 'settings_save', 'entry'
];

// Allowlisted prop keys. Anything else in `p` is dropped.
export const STRING_PROPS = ['city', 'month', 'from', 'surface', 'style'];
const NUMBER_PROPS = ['count', 'stays', 'dwell_ms', 'weight', 'added', 'anchors'];

export const MAX_BODY = 2048;
export const MAX_STR = 64;

// Which numeric props fill double1 / double2, per event.
const COUNTS = {
  city_sheet_close: ['dwell_ms'],
  compare_add: ['count'],
  cost_weight_set: ['weight'],
  shared_route_adopt: ['stays'],
  itinerary_copy_text: ['stays'],
  year_fill: ['added', 'anchors']
};

const HEADERS = { 'Cache-Control': 'no-store' };
const reply = (status, extra = {}) => new Response(null, { status, headers: { ...HEADERS, ...extra } });

const str = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).slice(0, MAX_STR) : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'boolean' ? Number(v) : 0);

export async function onRequestPost({ request, env }) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY) return reply(400);

  let raw;
  try {
    raw = await request.text();
  } catch {
    return reply(400);
  }
  if (new TextEncoder().encode(raw).length > MAX_BODY) return reply(400);

  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    return reply(400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400);

  const event = body.e;
  if (typeof event !== 'string' || !EVENTS.includes(event)) return reply(400);

  const p = body.p && typeof body.p === 'object' && !Array.isArray(body.p) ? body.p : {};
  const s = Object.fromEntries(STRING_PROPS.map((k) => [k, str(p[k])]));

  // The two ways a prop shape differs from the plain keys above.
  let counts = (COUNTS[event] ?? []).map((k) => num(p[k]));
  if (event === 'compare_open') counts = [typeof p.cities === 'string' ? p.cities.split(',').filter(Boolean).length : 0];
  if (event === 'shared_route_adopt') counts = [num(p.stays), p.auto === true ? 1 : 0];
  if (event === 'onboarding_complete' || event === 'settings_save') counts = [p.party === 'couple' ? 2 : p.party === 'solo' ? 1 : 0, p.womensSafety === true ? 1 : 0];

  let host = '';
  try {
    host = new URL(request.url).hostname.slice(0, MAX_STR);
  } catch {}
  const path = typeof body.path === 'string' && body.path.startsWith('/') ? body.path.split(/[?#]/)[0].slice(0, MAX_STR) : '';

  try {
    env.EVENTS?.writeDataPoint({
      indexes: [event],
      blobs: [event, s.city, s.month, s.from, s.surface, s.style, host, path],
      doubles: [counts[0] ?? 0, counts[1] ?? 0]
    });
  } catch {
    // Never fail the page over a metrics write.
  }
  return reply(204);
}

// Anything but POST: 405 (Pages Functions route other methods here).
export const onRequest = () => reply(405, { Allow: 'POST' });
