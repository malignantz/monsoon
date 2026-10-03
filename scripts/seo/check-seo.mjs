// npm run check:seo — validate the generated static pages in dist/.
//
// Per page (dist/city/*, dist/best/*, dist/cities/):
//   • exactly one <h1>
//   • exactly one canonical, equal to https://monsoon.fyi + the page's own path
//   • a non-empty <title>, unique across pages; a meta description
//   • every JSON-LD block parses; city pages carry TouristDestination +
//     BreadcrumbList, month pages ItemList + BreadcrumbList
//   • every internal link resolves: to a generated page, a file in dist/, an
//     id on the same page, or the SPA root — and SPA links with ?city= / ?m=
//     name a real city / month
// Site-wide:
//   • every page is in sitemap.xml and every sitemap URL resolves
//   • no orphans: every page has an inbound link from another generated page
//   • robots.txt points at the sitemap; llms.txt links resolve
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.indexOf('--out');
const dist = join(root, outArg > 0 ? process.argv[outArg + 1] : 'dist');
const SITE = 'https://monsoon.fyi';
const MONTH_PARAMS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    statSync(p).isDirectory() ? walk(p, acc) : acc.push(p);
  }
  return acc;
}

const decode = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const pageFiles = ['city', 'best', 'cities'].flatMap((d) => walk(join(dist, d))).filter((f) => f.endsWith('/index.html'));
if (!pageFiles.length) {
  console.error('[check:seo] no generated pages found in dist/ — run the build first (bash scripts/build.sh).');
  process.exit(1);
}
const pathOf = (f) => '/' + f.slice(dist.length + 1).replace(/index\.html$/, '');
const pages = new Map(pageFiles.map((f) => [pathOf(f), readFileSync(f, 'utf8')]));
const citySlugs = new Set([...pages.keys()].filter((p) => p.startsWith('/city/')).map((p) => p.split('/')[2]));

// Resolve an internal URL (already absolute-path form) → true / reason string.
function resolves(url, fromPath, html) {
  const u = new URL(url, SITE + fromPath);
  if (u.origin !== SITE) return true; // external — not ours to check
  if (u.pathname === fromPath && u.hash && !u.search) {
    const id = decodeURIComponent(u.hash.slice(1));
    return new RegExp(`id="${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).test(html) || `missing #${id} on page`;
  }
  if (u.pathname === '/') {
    const city = u.searchParams.get('city');
    if (city != null && !citySlugs.has(city)) return `SPA link names unknown city "${city}"`;
    const m = u.searchParams.get('m');
    if (m != null && !MONTH_PARAMS.includes(m)) return `SPA link has bad month "${m}"`;
    const view = u.searchParams.get('view');
    if (view != null && view !== 'year' && view !== 'month') return `SPA link has bad view "${view}"`;
    return true;
  }
  if (u.pathname.endsWith('/')) return pages.has(u.pathname) || existsSync(join(dist, u.pathname, 'index.html')) || 'no generated page';
  return existsSync(join(dist, decodeURIComponent(u.pathname))) || 'no such file in dist/';
}

const titles = new Map();
const inbound = new Map([...pages.keys()].map((p) => [p, 0]));

for (const [path, html] of pages) {
  const where = path;
  const h1 = html.match(/<h1[\s>]/g)?.length ?? 0;
  if (h1 !== 1) err(where, `${h1} <h1> elements (want 1)`);

  const canon = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => decode(m[1]));
  if (canon.length !== 1) err(where, `${canon.length} canonical links (want 1)`);
  else if (canon[0] !== SITE + path) err(where, `canonical ${canon[0]} is not self (${SITE + path})`);

  const title = decode(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '').trim();
  if (!title) err(where, 'missing <title>');
  else if (titles.has(title)) err(where, `duplicate title (also on ${titles.get(title)}): "${title}"`);
  else titles.set(title, path);
  if (!/<meta name="description" content="[^"]{50,}"/.test(html)) err(where, 'missing or very short meta description');
  if (!/<meta property="og:url" content="[^"]+"/.test(html)) err(where, 'missing og:url');

  const types = new Set();
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) err(where, 'no JSON-LD');
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      for (const node of j['@graph'] ?? [j]) types.add(node['@type']);
    } catch (e) {
      err(where, `JSON-LD does not parse: ${e.message}`);
    }
  }
  const want = path.startsWith('/city/') ? ['TouristDestination', 'BreadcrumbList'] : path.startsWith('/best/') ? ['ItemList', 'BreadcrumbList'] : ['BreadcrumbList'];
  for (const t of want) if (!types.has(t)) err(where, `JSON-LD lacks ${t}`);

  // Links: href on <a>/<link> in the body and head (skip canonical/og which are absolute self).
  const body = html.split('<body>')[1] ?? '';
  for (const m of body.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)) {
    const href = decode(m[1]);
    if (/^(mailto:|tel:)/.test(href)) continue;
    if (/^https?:\/\//.test(href) && !href.startsWith(SITE)) continue;
    const ok = resolves(href, path, html);
    if (ok !== true) err(where, `link ${href} → ${ok}`);
    const target = new URL(href, SITE + path);
    if (target.origin === SITE && target.pathname !== path && inbound.has(target.pathname)) inbound.set(target.pathname, inbound.get(target.pathname) + 1);
  }
}

for (const [p, n] of inbound) if (n === 0) err(p, 'orphan: no inbound link from another generated page');

// sitemap.xml
const smPath = join(dist, 'sitemap.xml');
if (!existsSync(smPath)) err('sitemap.xml', 'missing');
else {
  const locs = [...readFileSync(smPath, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const set = new Set(locs);
  if (set.size !== locs.length) err('sitemap.xml', 'duplicate URLs');
  if (!set.has(SITE + '/')) err('sitemap.xml', 'missing the SPA root');
  for (const p of pages.keys()) if (!set.has(SITE + p)) err('sitemap.xml', `missing ${p}`);
  for (const l of locs) {
    const ok = resolves(l, '/', '');
    if (ok !== true) err('sitemap.xml', `${l} → ${ok}`);
  }
}

// robots.txt + llms.txt
const robots = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) err('robots.txt', 'no Sitemap: line');
if (/^Disallow:\s*\/(city|best|cities)/m.test(robots)) err('robots.txt', 'blocks a generated tree');
const llmsPath = join(dist, 'llms.txt');
if (!existsSync(llmsPath)) err('llms.txt', 'missing');
else {
  for (const m of readFileSync(llmsPath, 'utf8').matchAll(/\]\((https:\/\/monsoon\.fyi[^)]*)\)/g)) {
    const ok = resolves(m[1], '/', '');
    if (ok !== true) err('llms.txt', `${m[1]} → ${ok}`);
  }
}

const counts = { city: 0, best: 0, other: 0 };
for (const p of pages.keys()) counts[p.startsWith('/city/') ? 'city' : p.startsWith('/best/') ? 'best' : 'other']++;

if (errors.length) {
  console.error(`[check:seo] ${errors.length} problem(s) across ${pages.size} pages:`);
  for (const e of errors.slice(0, 60)) console.error('  ' + e);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(
  `[check:seo] ok — ${pages.size} pages (${counts.city} city, ${counts.best} month, ${counts.other} index): one h1, self-canonical, unique titles, valid JSON-LD, all internal links resolve, no orphans, sitemap/robots/llms consistent`
);
