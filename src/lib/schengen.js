// Schengen 90/180 maths over a generic, repeating year of whole-month stays.
//
// Pure (no Svelte, no dataset import) so it can be exercised directly from Node
// — see scripts/test-schengen.mjs. data.svelte.js wraps it with the city lookup.
//
// The route is a template year, not dated travel, so February is 28 days and the
// year is cyclic: a Dec→Feb stay, or a Nov stay followed by a Feb stay, is
// measured across the year boundary exactly like any other window. Every day is
// counted for real (Jul–Sep is 92 days, not 90), over a true rolling 180-day
// window, so the meter never calls an overstay legal.
//
// Whole-month stays can't land on "exactly 90" in most of the year — three
// consecutive months are 89–92 days — so a 1–2 day overage is reported as a
// caution ("tight — count your exact days"), not silently legal and not a hard
// breach: leaving a day or two early fixes it.

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const YEAR_DAYS = 365;
export const SCHENGEN_LIMIT = 90;
export const SCHENGEN_WINDOW = 180;
// Overage (days) treated as whole-month rounding rather than a real breach.
export const SCHENGEN_SLACK = 2;

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Day-of-year (0-364) on which each month begins.
export const MONTH_START = MONTH_DAYS.map((_, i) => MONTH_DAYS.slice(0, i).reduce((a, b) => a + b, 0));

const monthOfDay = (d) => {
  let m = 11;
  while (MONTH_START[m] > d) m--;
  return m;
};

// Real days in a run of `len` months starting at month `start` (wraps Dec→Jan).
export function stayDays(start, len) {
  let n = 0;
  for (let i = 0; i < len; i++) n += MONTH_DAYS[(start + i) % 12];
  return n;
}

function markStay(mask, start, len) {
  for (let i = 0; i < len; i++) {
    const m = (start + i) % 12;
    mask.fill(1, MONTH_START[m], MONTH_START[m] + MONTH_DAYS[m]);
  }
}

// Prefix sums over the mask unrolled one window past the year end, so any
// cyclic window [s, s+179] is prefix[s+180] - prefix[s].
function prefixOf(mask) {
  const p = new Int32Array(YEAR_DAYS + SCHENGEN_WINDOW + 1);
  for (let i = 0; i < YEAR_DAYS + SCHENGEN_WINDOW; i++) p[i + 1] = p[i] + mask[i % YEAR_DAYS];
  return p;
}

function verdict(worst) {
  const over = Math.max(0, worst - SCHENGEN_LIMIT);
  return {
    worst,
    remaining: Math.max(0, SCHENGEN_LIMIT - worst),
    over,
    ok: over === 0,
    // A small overage from whole-month rounding: legal if they leave a day or two early.
    caution: over > 0 && over <= SCHENGEN_SLACK,
    breach: over > SCHENGEN_SLACK,
    atLimit: worst === SCHENGEN_LIMIT
  };
}

// stays: [{key, start (0-11), len (1-12)}]; isSchengen(key) → boolean.
//
// Returns the worst rolling 180-day window: its Schengen day count, the verdict
// fields above, and a label spanning the Schengen months inside that window
// ("Jun–Aug", or "Jan–May" when two separate stays collide).
export function schengenWindow(stays, isSchengen) {
  const mask = new Uint8Array(YEAR_DAYS);
  for (const s of stays) if (isSchengen(s.key)) markStay(mask, s.start, s.len);
  const p = prefixOf(mask);
  let worst = 0;
  let worstStart = 0;
  for (let s = 0; s < YEAR_DAYS; s++) {
    const n = p[s + SCHENGEN_WINDOW] - p[s];
    if (n > worst) {
      worst = n;
      worstStart = s;
    }
  }
  let first = -1;
  let last = -1;
  for (let i = 0; i < SCHENGEN_WINDOW; i++) {
    const d = (worstStart + i) % YEAR_DAYS;
    if (!mask[d]) continue;
    if (first < 0) first = d;
    last = d;
  }
  const a = first < 0 ? 0 : monthOfDay(first);
  const b = last < 0 ? 0 : monthOfDay(last);
  return {
    ...verdict(worst),
    worstStart,
    window: a === b ? MONTH_NAMES[a] : `${MONTH_NAMES[a]}–${MONTH_NAMES[b]}`,
    anySchengen: worst > 0
  };
}

// The verdict a candidate Schengen `stay` would earn if added to `stays`, judged
// only on windows that include at least one of its days. A route that's already
// over somewhere else doesn't taint an unrelated pick; a pick that lands inside
// (or creates) an over-limit window does.
export function schengenImpact(stays, stay, isSchengen) {
  const mask = new Uint8Array(YEAR_DAYS);
  for (const s of stays) if (isSchengen(s.key)) markStay(mask, s.start, s.len);
  markStay(mask, stay.start, stay.len);
  const own = new Uint8Array(YEAR_DAYS);
  markStay(own, stay.start, stay.len);
  const p = prefixOf(mask);
  const q = prefixOf(own);
  let worst = 0;
  for (let s = 0; s < YEAR_DAYS; s++) {
    if (q[s + SCHENGEN_WINDOW] - q[s] === 0) continue;
    worst = Math.max(worst, p[s + SCHENGEN_WINDOW] - p[s]);
  }
  return verdict(worst);
}
