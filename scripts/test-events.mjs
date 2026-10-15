// Checks the event sink (functions/api/e.js) against a mock Analytics Engine
// binding: allowlist, truncation, 204 / 400 / 405, and that nothing else is
// written. Run: node scripts/test-events.mjs
import assert from 'node:assert/strict';
import { onRequestPost, onRequest, EVENTS, MAX_STR } from '../functions/api/e.js';
import { ENTRY_FROM } from '../src/lib/analytics.js';

let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}\n      ${e.message}`);
  }
}

const mk = () => {
  const points = [];
  return { points, env: { EVENTS: { writeDataPoint: (d) => points.push(d) } } };
};
const post = (body, { env, url = 'https://monsoon.fyi/api/e', headers = {} } = {}) =>
  onRequestPost({ request: new Request(url, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers }), env });

await test('the spec sample returns 204 and writes one point', async () => {
  const { points, env } = mk();
  const r = await post({ e: 'add_to_year', p: { city: 'lisbon', month: 5 } }, { env });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].indexes, ['add_to_year']);
  assert.deepEqual(points[0].blobs, ['add_to_year', 'lisbon', '5', '', '', '', 'monsoon.fyi', '']);
  assert.deepEqual(points[0].doubles, [0, 0]);
});

await test('every allowed event, including entry, is accepted', async () => {
  assert.equal(EVENTS.length, 13);
  for (const e of EVENTS) {
    const { points, env } = mk();
    assert.equal((await post({ e, p: {} }, { env })).status, 204, e);
    assert.equal(points.length, 1);
  }
});

await test('unknown or missing events are 400 and write nothing', async () => {
  for (const b of [{ e: 'page_view' }, { e: 5 }, { p: {} }, { e: '__proto__' }, []]) {
    const { points, env } = mk();
    assert.equal((await post(b, { env })).status, 400, JSON.stringify(b));
    assert.equal(points.length, 0);
  }
});

await test('bad JSON and oversize bodies are 400', async () => {
  const { points, env } = mk();
  assert.equal((await post('{nope', { env })).status, 400);
  assert.equal((await post('', { env })).status, 400);
  assert.equal((await post('null', { env })).status, 400);
  const big = { e: 'surface_view', p: { surface: 'x'.repeat(3000) } };
  assert.equal((await post(big, { env })).status, 400);
  assert.equal(points.length, 0);
});

await test('extra prop keys are dropped, not stored', async () => {
  const { points, env } = mk();
  await post({ e: 'city_sheet_open', p: { city: 'lisbon', month: 3, from: 'my_year', email: 'a@b.c', ua: 'x', ip: '1.2.3.4' } }, { env });
  const all = JSON.stringify(points);
  assert.ok(!/a@b\.c|1\.2\.3\.4|"x"/.test(all));
  assert.deepEqual(points[0].blobs.slice(0, 6), ['city_sheet_open', 'lisbon', '3', 'my_year', '', '']);
  assert.equal(points[0].blobs.length, 8);
  assert.equal(points[0].doubles.length, 2);
  assert.deepEqual(Object.keys(points[0]).sort(), ['blobs', 'doubles', 'indexes']);
});

await test('strings are truncated to 64 characters', async () => {
  const { points, env } = mk();
  await post({ e: 'entry', p: { city: 'c'.repeat(500), from: 'f'.repeat(65), surface: 's'.repeat(64) }, path: '/' + 'p'.repeat(200) }, { env });
  const b = points[0].blobs;
  assert.equal(b[1].length, MAX_STR);
  assert.equal(b[3].length, MAX_STR);
  assert.equal(b[4].length, MAX_STR);
  assert.equal(b[7].length, MAX_STR);
});

await test('non-scalar prop values become empty strings', async () => {
  const { points, env } = mk();
  await post({ e: 'add_to_year', p: { city: { a: 1 }, month: ['x'], from: null } }, { env });
  assert.deepEqual(points[0].blobs.slice(1, 6), ['', '', '', '', '']);
});

await test('counts land in doubles by event', async () => {
  const { points, env } = mk();
  await post({ e: 'year_fill', p: { style: 'balanced', added: 6, anchors: 2 } }, { env });
  await post({ e: 'city_sheet_close', p: { city: 'lisbon', dwell_ms: 4200 } }, { env });
  await post({ e: 'compare_open', p: { cities: 'lisbon,porto,seville', month: 2 } }, { env });
  await post({ e: 'shared_route_adopt', p: { auto: true, stays: 5 } }, { env });
  await post({ e: 'surface_view', p: { surface: 'my_year', n: 9 } }, { env });
  assert.deepEqual(points.map((p) => p.doubles), [[6, 2], [4200, 0], [3, 0], [5, 1], [0, 0]]);
  assert.ok(!JSON.stringify(points[2]).includes('porto'), 'compare_open city list is not stored');
});

await test('path keeps only the pathname; host comes from the request URL', async () => {
  const { points, env } = mk();
  await post({ e: 'surface_view', p: { surface: 'this_month' }, path: '/city/lisbon/?city=x#y' }, { env, url: 'https://abc.monsoon.pages.dev/api/e' });
  assert.equal(points[0].blobs[6], 'abc.monsoon.pages.dev');
  assert.equal(points[0].blobs[7], '/city/lisbon/');
});

await test('IP, user agent, cookie and referer headers are never written', async () => {
  const { points, env } = mk();
  const headers = { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'SecretAgent/1', cookie: 'sid=abc', referer: 'https://example.com/private?q=1' };
  assert.equal((await post({ e: 'surface_view', p: { surface: 'my_year' } }, { env, headers })).status, 204);
  const all = JSON.stringify(points);
  for (const s of ['203.0.113.9', 'SecretAgent', 'sid=abc', 'example.com']) assert.ok(!all.includes(s), s);
});

await test('GET and other methods are 405 with Allow: POST', async () => {
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const r = await onRequest({ request: new Request('https://monsoon.fyi/api/e', { method }), env: mk().env });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'POST');
  }
});

await test('a missing or throwing binding never fails the request', async () => {
  assert.equal((await post({ e: 'entry', p: {} }, { env: {} })).status, 204);
  const env = { EVENTS: { writeDataPoint() { throw new Error('boom'); } } };
  assert.equal((await post({ e: 'entry', p: {} }, { env })).status, 204);
});

await test('entry from-values are the five page types', () => {
  assert.deepEqual(ENTRY_FROM, ['best-month', 'best-region', 'city', 'compare', 'cities']);
});

if (failed) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nall event-sink checks passed');
