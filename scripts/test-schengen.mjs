// Checks the Schengen 90/180 maths in src/lib/schengen.js on the cases that
// matter for whole-month stays. Run: node scripts/test-schengen.mjs
import assert from 'node:assert/strict';
import { schengenWindow, schengenImpact, stayDays, SCHENGEN_SLACK } from '../src/lib/schengen.js';

// Keys starting with "s" are Schengen cities; anything else is outside the area.
const isS = (key) => key.startsWith('s');
const stay = (key, start, len) => ({ key, start, len });

let failed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

test('month lengths: Jan–Mar 90, Feb–Apr 89, Jun–Aug 92, Dec–Feb 90 (wraps)', () => {
  assert.equal(stayDays(0, 3), 90);
  assert.equal(stayDays(1, 3), 89);
  assert.equal(stayDays(5, 3), 92);
  assert.equal(stayDays(11, 3), 90);
  assert.equal(stayDays(0, 12), 365);
});

test('empty and non-Schengen routes count zero days', () => {
  const r = schengenWindow([stay('bkk', 0, 6), stay('mex', 6, 6)], isS);
  assert.equal(r.worst, 0);
  assert.equal(r.anySchengen, false);
  assert.ok(r.ok);
});

test('Jan–Mar is exactly 90: legal, at the limit', () => {
  const r = schengenWindow([stay('slis', 0, 3)], isS);
  assert.equal(r.worst, 90);
  assert.ok(r.ok && r.atLimit && !r.caution && !r.breach);
  assert.equal(r.remaining, 0);
  assert.equal(r.window, 'Jan–Mar');
});

test('Jun–Aug is 92: caution (whole-month rounding), not legal, not a breach', () => {
  const r = schengenWindow([stay('slis', 5, 3)], isS);
  assert.equal(r.worst, 92);
  assert.equal(r.over, 2);
  assert.ok(!r.ok && r.caution && !r.breach);
  assert.equal(r.window, 'Jun–Aug');
});

test('two months is always comfortably legal (≤ 62 days)', () => {
  for (let m = 0; m < 12; m++) {
    const r = schengenWindow([stay('slis', m, 2)], isS);
    assert.ok(r.ok && r.worst <= 62, `start ${m}: ${r.worst}`);
  }
});

test('two separated blocks inside one 180-day window add up: Jan + Apr–May = 92', () => {
  // Jan 1 → May 31 spans 151 days, so one window holds all 31 + 61 days. The old
  // 30-days-a-month maths called this exactly 90 and legal.
  const r = schengenWindow([stay('sber', 0, 1), stay('bkk', 1, 2), stay('slis', 3, 2)], isS);
  assert.equal(r.worst, 92);
  assert.ok(r.caution);
  assert.equal(r.window, 'Jan–May');
});

test('two blocks four months apart (both ways round the year) stay legal: Jan–Feb + Jul–Aug', () => {
  // Any window straddling both holds at most 58 days; Jul–Aug alone is 62.
  const r = schengenWindow([stay('sber', 0, 2), stay('slis', 6, 2)], isS);
  assert.equal(r.worst, 62);
  assert.ok(r.ok);
  assert.equal(r.window, 'Jul–Aug');
});

test('Mar–May + Jul–Aug with a one-month break is a hard breach', () => {
  // A 180-day window from early March to late August holds nearly all of both.
  const r = schengenWindow([stay('spar', 2, 3), stay('bkk', 5, 1), stay('slis', 6, 2)], isS);
  assert.ok(r.breach, `worst ${r.worst}`);
});

test('wraparound: Dec–Feb is one 90-day block across the year boundary', () => {
  const r = schengenWindow([stay('sbcn', 11, 3)], isS);
  assert.equal(r.worst, 90);
  assert.ok(r.ok && r.atLimit);
  assert.equal(r.window, 'Dec–Feb');
});

test('wraparound: Nov–Dec + Jan is caught across the boundary (92 days)', () => {
  const r = schengenWindow([stay('sbcn', 10, 2), stay('slis', 0, 1)], isS);
  assert.equal(r.worst, 92);
  assert.ok(r.caution);
  assert.equal(r.window, 'Nov–Jan');
});

test('wraparound: Sep–Oct + Jan–Feb only two months apart across New Year breaches', () => {
  // Jan–Feb + Sep–Oct look far apart inside one calendar year, but the year
  // repeats: Sep 1 → Feb 28 is exactly 181 days.
  const r = schengenWindow([stay('sber', 0, 2), stay('slis', 8, 2)], isS);
  assert.equal(r.worst, 119);
  assert.ok(r.breach);
  assert.equal(r.window, 'Sep–Feb');
});

test('wraparound: Oct–Dec + Jan–Mar is a hard breach', () => {
  const r = schengenWindow([stay('sbcn', 9, 3), stay('slis', 0, 3)], isS);
  assert.equal(r.worst, 180);
  assert.ok(r.breach && r.over > SCHENGEN_SLACK);
});

test('impact ignores an unrelated over-limit window', () => {
  // Existing route is over in Jan–Apr; adding Sep is judged on its own windows.
  const route = [stay('sber', 0, 4)];
  assert.ok(schengenWindow(route, isS).breach);
  const far = schengenImpact(route, stay('slis', 8, 1), isS);
  assert.ok(far.ok, `worst ${far.worst}`);
  const near = schengenImpact(route, stay('slis', 4, 1), isS);
  assert.ok(near.breach);
});

test('impact of a summer three-month pick on an empty route is a caution', () => {
  const r = schengenImpact([], stay('slis', 6, 3), isS);
  assert.equal(r.worst, 92);
  assert.ok(r.caution);
});

console.log(failed ? `\n${failed} failed` : '\nall Schengen checks passed');
process.exit(failed ? 1 : 0);
