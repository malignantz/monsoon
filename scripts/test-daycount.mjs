// Checks the days-per-country maths in src/lib/dayCount.js (tax-residency
// signal). Run: node scripts/test-daycount.mjs
import assert from 'node:assert/strict';
import { countryDays, countryImpact, RESIDENCY_DAYS, RESIDENCY_NEAR } from '../src/lib/dayCount.js';

// Fixture lookup: city key → country.
const COUNTRY = {
  lis: 'Portugal',
  opo: 'Portugal',
  fnc: 'Portugal',
  mex: 'Mexico',
  oax: 'Mexico',
  bkk: 'Thailand',
  cnx: 'Thailand',
  ber: 'Germany'
};
const countryOf = (key) => COUNTRY[key];
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

test('thresholds: 183 for residency, approaching from 150', () => {
  assert.equal(RESIDENCY_DAYS, 183);
  assert.equal(RESIDENCY_NEAR, 150);
});

test('empty route: no rows, no top, quiet state', () => {
  const r = countryDays([], countryOf);
  assert.deepEqual(r.rows, []);
  assert.equal(r.top, null);
  assert.equal(r.state, 'ok');
  assert.equal(r.over.length + r.near.length, 0);
});

test('one six-month stay is 181–184 real days depending on the months', () => {
  const expected = [181, 181, 184, 183, 184, 183, 184, 184, 181, 182, 181, 182];
  for (let m = 0; m < 12; m++) {
    const r = countryDays([stay('lis', m, 6)], countryOf);
    assert.equal(r.top.days, expected[m], `start ${m}`);
    assert.equal(r.top.state, expected[m] >= 183 ? 'over' : 'near', `start ${m}`);
  }
});

test('Jan–Jun (181) is approaching; Jul–Dec (184) crosses 183', () => {
  assert.equal(countryDays([stay('lis', 0, 6)], countryOf).state, 'near');
  const r = countryDays([stay('lis', 6, 6)], countryOf);
  assert.equal(r.state, 'over');
  assert.deepEqual(r.over.map((x) => x.country), ['Portugal']);
});

test('seven months always crosses 183 (212–215 days)', () => {
  for (let m = 0; m < 12; m++) {
    const d = countryDays([stay('mex', m, 7)], countryOf).top;
    assert.ok(d.days >= 212 && d.days <= 215 && d.state === 'over', `start ${m}: ${d.days}`);
  }
});

test('two separate stays in one country add up: Jan–Mar + Sep–Nov = 181, then + Dec = 212', () => {
  const route = [stay('lis', 0, 3), stay('bkk', 3, 5), stay('lis', 8, 3)];
  const r = countryDays(route, countryOf);
  assert.equal(r.top.country, 'Portugal');
  assert.equal(r.top.days, 90 + 91);
  assert.equal(r.top.state, 'near');
  const r2 = countryDays([...route, stay('lis', 11, 1)], countryOf);
  assert.equal(r2.top.days, 212);
  assert.equal(r2.state, 'over');
});

test('different cities in one country count as one country', () => {
  // Lisbon Jan–Feb, Porto Mar–Apr, Funchal May–Jul: 59 + 61 + 92 = 212.
  const r = countryDays([stay('lis', 0, 2), stay('opo', 2, 2), stay('fnc', 4, 3), stay('ber', 7, 1)], countryOf);
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], { country: 'Portugal', days: 212, state: 'over' });
  assert.deepEqual(r.rows[1], { country: 'Germany', days: 31, state: 'ok' });
});

test('a balanced year stays quiet: four countries, none near 183', () => {
  const r = countryDays([stay('lis', 0, 3), stay('mex', 3, 3), stay('bkk', 6, 3), stay('ber', 9, 3)], countryOf);
  assert.equal(r.state, 'ok');
  assert.equal(r.rows.reduce((a, x) => a + x.days, 0), 365);
  assert.equal(r.top.country, 'Germany'); // Oct–Dec 92 ties Jul–Sep 92; name breaks it
});

test('approaching band: five months of summer is 153 days', () => {
  const r = countryDays([stay('lis', 4, 5)], countryOf);
  assert.equal(r.top.days, 153);
  assert.equal(r.state, 'near');
  assert.equal(countryDays([stay('lis', 0, 4)], countryOf).state, 'ok'); // 120
});

test('a wrapping stay (Nov–Apr) counts across the year end: 181', () => {
  assert.equal(countryDays([stay('cnx', 10, 6)], countryOf).top.days, 181);
});

test('a full-year stay is 365, never more', () => {
  assert.equal(countryDays([stay('lis', 3, 12)], countryOf).top.days, 365);
});

test('unknown cities are ignored', () => {
  const r = countryDays([stay('zzz', 0, 6), stay('lis', 6, 1)], countryOf);
  assert.deepEqual(r.rows, [{ country: 'Portugal', days: 31, state: 'ok' }]);
});

test('impact: a candidate that tips its country past 183', () => {
  const route = [stay('lis', 0, 3), stay('bkk', 3, 2), stay('opo', 5, 2)]; // Portugal 151
  const near = countryImpact(route, stay('fnc', 7, 1), countryOf); // + Aug 31
  assert.deepEqual(near, { country: 'Portugal', days: 182, added: 31, state: 'near' });
  const over = countryImpact(route, stay('fnc', 7, 2), countryOf); // + Aug–Sep 61
  assert.deepEqual(over, { country: 'Portugal', days: 212, added: 61, state: 'over' });
  // A different country is judged on its own total.
  assert.equal(countryImpact(route, stay('mex', 7, 2), countryOf).days, 61);
});

test('impact on an empty route: six months Jul–Dec is over, Jan–Jun is not', () => {
  assert.equal(countryImpact([], stay('mex', 6, 6), countryOf).state, 'over');
  assert.equal(countryImpact([], stay('mex', 0, 6), countryOf).state, 'near');
});

console.log(failed ? `\n${failed} failed` : '\nall day-count checks passed');
process.exit(failed ? 1 : 0);
