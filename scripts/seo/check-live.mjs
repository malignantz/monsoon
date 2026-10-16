// Read-only live probe: node scripts/seo/check-live.mjs [--base <url>]
// Fetches the sitemap index, child sitemaps and every <loc>, and checks each page
// for 200 (no redirect), text/html, canonical == loc, no noindex. Also checks
// robots.txt, www -> apex 301, and /llms.txt + /llms-full.txt.
// Against a non-apex --base, locs are rewritten onto the base and the canonical
// equality, robots Sitemap line and www checks are skipped. Node built-ins only.

const APEX = 'https://monsoon.fyi';
const UA = 'monsoon-check-live/1.0 (scripts/seo/check-live.mjs; read-only probe)';
const CONCURRENCY = 4;
const DELAY_MS = 150;

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const base = (bi >= 0 && args[bi + 1] ? args[bi + 1] : APEX).replace(/\/+$/, '');
const isApex = base === APEX;

const failures = [];
const fail = (url, msg) => failures.push(`${url}  ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) =>
  fetch(url, { redirect: 'manual', headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
const onBase = (u) => (isApex ? u : base + new URL(u).pathname);

async function text(url) {
  try {
    const r = await get(url);
    if (r.status !== 200) { fail(url, `expected 200, got ${r.status}`); return null; }
    return await r.text();
  } catch (e) { fail(url, `fetch error: ${e.message}`); return null; }
}

async function checkPage(loc) {
  const url = onBase(loc);
  try {
    const r = await get(url);
    if (r.status !== 200) return fail(url, `expected 200, got ${r.status}${r.headers.get('location') ? ' -> ' + r.headers.get('location') : ''}`);
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('text/html')) fail(url, `content-type ${ct || '(none)'}`);
    if (/noindex/i.test(r.headers.get('x-robots-tag') || '')) fail(url, 'X-Robots-Tag noindex');
    const html = await r.text();
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
      if (/name=["']robots["']/i.test(m[0]) && /noindex/i.test(m[0])) fail(url, 'meta robots noindex');
    }
    const tag = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]).find((t) => /rel=["']?canonical/i.test(t));
    const href = tag && (tag.match(/href=["']([^"']*)["']/i) || [])[1];
    if (!href) fail(url, 'no <link rel=canonical>');
    else if (isApex && href !== loc) fail(url, `canonical ${href} != ${loc}`);
  } catch (e) { fail(url, `fetch error: ${e.message}`); }
}

async function pool(items, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) { const item = items[i++]; await fn(item); await sleep(DELAY_MS); }
  }));
}

const started = Date.now();
console.log(`check-live: base ${base}${isApex ? '' : ' (canonical/robots/www checks skipped)'}`);

const index = await text(`${base}/sitemap.xml`);
const pages = new Set();
if (index) {
  const children = /<sitemapindex/i.test(index) ? locs(index) : [];
  if (children.length) {
    console.log(`sitemap index: ${children.length} child sitemaps`);
    for (const c of children) {
      const xml = await text(onBase(c));
      if (xml) locs(xml).forEach((l) => pages.add(l));
      await sleep(DELAY_MS);
    }
  } else locs(index).forEach((l) => pages.add(l));
}
if (!pages.size) fail(`${base}/sitemap.xml`, 'no page URLs found');
console.log(`checking ${pages.size} URLs`);
await pool([...pages], checkPage);

if (isApex) {
  const robots = await text(`${base}/robots.txt`);
  if (robots && !new RegExp(`^Sitemap:\\s*${APEX}/sitemap\\.xml\\s*$`, 'mi').test(robots))
    fail(`${base}/robots.txt`, `missing "Sitemap: ${APEX}/sitemap.xml"`);
  try {
    const r = await get('https://www.monsoon.fyi/');
    const loc = r.headers.get('location') || '';
    if (r.status !== 301) fail('https://www.monsoon.fyi/', `expected 301, got ${r.status}`);
    else if (!loc.startsWith(APEX)) fail('https://www.monsoon.fyi/', `301 to ${loc}, expected apex`);
  } catch (e) { fail('https://www.monsoon.fyi/', `fetch error: ${e.message}`); }
}
for (const p of ['/llms.txt', '/llms-full.txt']) await text(base + p);

const secs = ((Date.now() - started) / 1000).toFixed(1);
if (failures.length) {
  console.error(`\nFAIL: ${failures.length} problem(s) in ${secs}s`);
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
console.log(`OK: ${pages.size} URLs and site checks passed in ${secs}s`);
