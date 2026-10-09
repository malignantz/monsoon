// npm run check:seo — validate the generated static pages in dist/.
//
// Per page (dist/city/*, dist/best/*, dist/cities/, dist/compare/*):
//   • exactly one <h1>
//   • exactly one canonical, equal to https://monsoon.fyi + the page's own path
//   • a non-empty <title>, unique across pages; a meta description
//   • every JSON-LD block parses, with the types the page kind needs:
//       city                  TouristDestination + BreadcrumbList
//       month, region hub,
//       /best/ index          ItemList + BreadcrumbList
//       /cities/              Dataset (name, description, url, creator) + ItemList + BreadcrumbList
//       /compare/<a>-vs-<b>/  WebPage + BreadcrumbList; the WebPage's `about` is exactly
//                             2 @ids that resolve to existing city pages; the page has a
//                             ?compare= SPA link whose two keys are its own URL slug pair;
//                             it is listed in sitemap-compare.xml
//       /compare/ index       ItemList + BreadcrumbList
//   • compare pages and the /compare/ index: no exclamation marks, and none of
//     the words gem / hidden / secret in the visible text
//   • every internal link resolves: to a generated page, a file in dist/, an
//     id on the same page, or the SPA root — and SPA links with ?city= / ?m= /
//     ?region= / ?compare= name a real city / month / region slug / 2–3 cities
//   • og:image / twitter:image on this site point at a file that exists in dist/;
//     twitter:image equals og:image; both have alt text; city, month and compare pages
//     each point at their own /og/<city|best|compare>/<slug>.png (a 1200x630 PNG, read
//     from the IHDR header), every other page at /og.png; every PNG in dist/og/ is
//     referenced by some page (no strays)
// Site-wide:
//   • sitemap.xml is an index; each child sitemap exists and parses; together
//     they list every indexable page and the SPA root, once; no noindex page
//     appears in any sitemap; every sitemap URL resolves
//   • no orphans: every page has an inbound link from another generated page
//   • robots.txt points at the sitemap; llms.txt links resolve; llms-full.txt has one
//     section per indexable page and every URL: line resolves; /og.png exists
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PAGE_TREES, PAGE_TYPES, pageType } from './trees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const outArg = process.argv.indexOf('--out');
const dist = join(root, outArg > 0 ? process.argv[outArg + 1] : 'dist');
const SITE = 'https://monsoon.fyi';
const MONTH_PARAMS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// width/height from a PNG's signature + IHDR chunk (no dependency); null if it is not a PNG.
function pngSize(file) {
  const b = readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

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

// Same slugging as slug() in src/lib/data.svelte.js, which urlState.js uses for region=.
const slug = (name) =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
const coreCities = JSON.parse(readFileSync(join(root, 'src/generated/travel-core.json'), 'utf8')).cities;
const regionSlugs = new Set(coreCities.map((c) => slug(c.region)));
const coreKeys = new Set(coreCities.map((c) => slug(c.name)));

const pageFiles = PAGE_TREES.flatMap((d) => walk(join(dist, d))).filter((f) => f.endsWith('/index.html'));
if (!pageFiles.length) {
  console.error('[check:seo] no generated pages found in dist/ — run the build first (bash scripts/build.sh).');
  process.exit(1);
}
const pathOf = (f) => '/' + f.slice(dist.length + 1).replace(/index\.html$/, '');
const pages = new Map(pageFiles.map((f) => [pathOf(f), readFileSync(f, 'utf8')]));
const citySlugs = new Set([...pages.keys()].filter((p) => p.startsWith('/city/')).map((p) => p.split('/')[2]));
const isNoindex = (html) => /<meta name="robots" content="[^"]*noindex/i.test(html);

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
    const region = u.searchParams.get('region');
    if (region != null) {
      const vals = region.split(',').filter(Boolean);
      if (!vals.length) return 'SPA link has an empty region=';
      for (const v of vals) if (!regionSlugs.has(v)) return `SPA link has region "${v}", which is not slug(region) of any region in the data`;
    }
    const compare = u.searchParams.get('compare');
    if (compare != null) {
      const keys = compare.split(',').map((k) => k.trim());
      if (keys.length < 2 || keys.length > 3) return `SPA compare= lists ${keys.length} cities (want 2–3)`;
      for (const k of keys) if (!coreKeys.has(k)) return `SPA compare= names unknown city "${k}"`;
      if (new Set(keys).size !== keys.length) return 'SPA compare= repeats a city';
    }
    return true;
  }
  if (u.pathname.endsWith('/')) return pages.has(u.pathname) || existsSync(join(dist, u.pathname, 'index.html')) || 'no generated page';
  return existsSync(join(dist, decodeURIComponent(u.pathname))) || 'no such file in dist/';
}

const WANT = {
  city: ['TouristDestination', 'BreadcrumbList'],
  month: ['ItemList', 'BreadcrumbList'],
  region: ['ItemList', 'BreadcrumbList'],
  'best-index': ['ItemList', 'BreadcrumbList'],
  'cities-index': ['Dataset', 'ItemList', 'BreadcrumbList'],
  compare: ['BreadcrumbList', 'WebPage'],
  'compare-index': ['ItemList', 'BreadcrumbList']
};

const titles = new Map();
const noindexPages = new Set();
const referencedOg = new Set(); // share-image URL paths some page points at
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
  if (isNoindex(html)) noindexPages.add(path);

  // Share images on this site (per-page /og/…png, or /og.png) must exist in dist/.
  for (const m of html.matchAll(/<meta (?:property="og:image"|name="twitter:image") content="([^"]*)"/g)) {
    const u = decode(m[1]);
    if (!u.startsWith(SITE + '/')) continue;
    if (!existsSync(join(dist, decodeURIComponent(u.slice(SITE.length))))) err(where, `image ${u} does not exist in dist/`);
  }
  // Each city / month / compare page has its own 1200x630 card; the rest use /og.png.
  const ogImg = decode(/<meta property="og:image" content="([^"]*)"/.exec(html)?.[1] ?? '');
  const twImg = decode(/<meta name="twitter:image" content="([^"]*)"/.exec(html)?.[1] ?? '');
  if (twImg !== ogImg) err(where, `twitter:image ${twImg} is not og:image ${ogImg}`);
  for (const a of ['og:image:alt', 'twitter:image:alt']) {
    const attr = a.startsWith('og') ? 'property' : 'name';
    if (!new RegExp(`<meta ${attr}="${a}" content="[^"]{10,}"`).test(html)) err(where, `missing or empty ${a}`);
  }
  const ownKind = { city: 'city', month: 'best', compare: 'compare' }[pageType(path)];
  const wantImg = SITE + (ownKind ? `/og/${ownKind}/${path.split('/')[2]}.png` : '/og.png');
  if (ogImg !== wantImg) err(where, `og:image ${ogImg} is not ${wantImg}`);
  else {
    referencedOg.add(ogImg.slice(SITE.length));
    const f = join(dist, ogImg.slice(SITE.length));
    if (existsSync(f)) {
      const size = pngSize(f);
      if (!size) err(where, `${ogImg} is not a valid PNG`);
      else if (size.w !== 1200 || size.h !== 630) err(where, `${ogImg} is ${size.w}x${size.h}, want 1200x630`);
    }
  }

  const types = new Set();
  const nodes = [];
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (!blocks.length) err(where, 'no JSON-LD');
  for (const b of blocks) {
    try {
      const j = JSON.parse(b[1]);
      for (const node of j['@graph'] ?? [j]) {
        types.add(node['@type']);
        nodes.push(node);
      }
    } catch (e) {
      err(where, `JSON-LD does not parse: ${e.message}`);
    }
  }
  const kind = pageType(path);
  for (const t of WANT[kind] ?? ['BreadcrumbList']) if (!types.has(t)) err(where, `JSON-LD lacks ${t}`);
  if (kind === 'cities-index') {
    const ds = nodes.find((n) => n['@type'] === 'Dataset');
    if (ds) {
      for (const f of ['name', 'description', 'url']) if (typeof ds[f] !== 'string' || !ds[f].trim()) err(where, `Dataset lacks ${f}`);
      if (!ds.creator?.name) err(where, 'Dataset lacks creator');
      if (ds.url && ds.url !== SITE + path) err(where, `Dataset url ${ds.url} is not ${SITE + path}`);
    }
  }

  if (kind === 'compare') {
    const pair = path.split('/')[2].split('-vs-');
    const wp = nodes.find((n) => n['@type'] === 'WebPage');
    if (wp) {
      const about = Array.isArray(wp.about) ? wp.about : wp.about ? [wp.about] : [];
      if (about.length !== 2) err(where, `WebPage about has ${about.length} items (want exactly 2)`);
      for (const a of about) {
        const m = /^https:\/\/monsoon\.fyi(\/city\/[^/#]+\/)#place$/.exec(a?.['@id'] ?? '');
        if (!m) err(where, `WebPage about @id ${JSON.stringify(a?.['@id'])} is not a /city/<slug>/#place id`);
        else if (!pages.has(m[1])) err(where, `WebPage about ${a['@id']} does not resolve to a generated city page`);
      }
      if (pair.length === 2 && about.length === 2) {
        const got = about.map((a) => /\/city\/([^/#]+)\//.exec(a?.['@id'] ?? '')?.[1]);
        if (got.join() !== pair.join()) err(where, `WebPage about (${got.join(', ')}) does not match the URL slug pair (${pair.join(', ')})`);
      }
    }
    const spa = [...html.split('<body>')[1].matchAll(/<a\b[^>]*\bhref="(\/\?[^"]*compare=[^"]*)"/g)].map((m) => new URL(decode(m[1]), SITE));
    if (!spa.length) err(where, 'no ?compare= link to the SPA');
    else if (!spa.some((u) => u.searchParams.get('compare') === pair.join(','))) {
      err(where, `?compare= link keys (${spa.map((u) => u.searchParams.get('compare')).join(' | ')}) do not match the URL slug pair (${pair.join(',')})`);
    }
  }
  if (kind === 'compare' || kind === 'compare-index') {
    const text = (html.split('<body>')[1] ?? '').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ');
    if (text.includes('!')) err(where, 'visible text contains an exclamation mark');
    const banned = text.match(/\b(gems?|hidden|secrets?)\b/i);
    if (banned) err(where, `visible text contains "${banned[0]}"`);
  }

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

// Sitemaps: sitemap.xml is an index; every child must exist and parse, and
// together they must cover every indexable page.
const sitemapsOnDisk = existsSync(dist) ? readdirSync(dist).filter((f) => /^sitemap.*\.xml$/.test(f)) : [];
function parseSitemap(name, kind) {
  const file = join(dist, name);
  if (!existsSync(file)) {
    err(name, 'missing');
    return null;
  }
  const xml = readFileSync(file, 'utf8');
  const rootTag = kind === 'index' ? 'sitemapindex' : 'urlset';
  const entryTag = kind === 'index' ? 'sitemap' : 'url';
  if (!xml.startsWith('<?xml') || !new RegExp(`<${rootTag}[^>]*>[\\s\\S]*</${rootTag}>\\s*$`).test(xml)) {
    err(name, `not a well-formed <${rootTag}> document`);
    return null;
  }
  const entries = xml.match(new RegExp(`<${entryTag}>`, 'g'))?.length ?? 0;
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (entries !== locs.length) err(name, `${entries} <${entryTag}> entries but ${locs.length} <loc>`);
  if (!locs.length) err(name, 'no entries');
  return locs;
}
const indexLocs = parseSitemap('sitemap.xml', 'index');
const listedUrls = new Map(); // url → the child sitemap that lists it
if (indexLocs) {
  const listed = new Set();
  for (const loc of indexLocs) {
    const name = loc.startsWith(SITE + '/') ? loc.slice(SITE.length + 1) : '';
    if (!/^sitemap-[\w-]+\.xml$/.test(name)) {
      err('sitemap.xml', `child ${loc} is not a ${SITE}/sitemap-<type>.xml file`);
      continue;
    }
    listed.add(name);
    for (const l of parseSitemap(name, 'urlset') ?? []) {
      if (listedUrls.has(l)) err(name, `${l} is also listed in ${listedUrls.get(l)}`);
      else listedUrls.set(l, name);
      const ok = resolves(l, '/', '');
      if (ok !== true) err(name, `${l} → ${ok}`);
    }
  }
  for (const f of sitemapsOnDisk) if (f !== 'sitemap.xml' && !listed.has(f)) err(f, 'exists in dist/ but is not listed in sitemap.xml');
  if (!listedUrls.has(SITE + '/')) err('sitemaps', 'missing the SPA root');
  for (const p of pages.keys()) {
    const inMap = listedUrls.get(SITE + p);
    if (noindexPages.has(p)) {
      if (inMap) err(inMap, `noindex page ${p} is in the sitemap`);
    } else if (!inMap) err('sitemaps', `missing ${p}`);
    else if (pageType(p) === 'compare' && inMap !== 'sitemap-compare.xml') err(p, `compare page is in ${inMap}, not sitemap-compare.xml`);
  }
}

// robots.txt + llms.txt + the default share image
const robots = existsSync(join(dist, 'robots.txt')) ? readFileSync(join(dist, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE}/sitemap.xml`)) err('robots.txt', 'no Sitemap: line');
if (/^Disallow:\s*\/(city|best|cities|compare|og)/m.test(robots)) err('robots.txt', 'blocks a generated tree');
const llmsPath = join(dist, 'llms.txt');
if (!existsSync(llmsPath)) err('llms.txt', 'missing');
else {
  for (const m of readFileSync(llmsPath, 'utf8').matchAll(/\]\((https:\/\/monsoon\.fyi[^)]*)\)/g)) {
    const ok = resolves(m[1], '/', '');
    if (ok !== true) err('llms.txt', `${m[1]} → ${ok}`);
  }
}
const llmsFullPath = join(dist, 'llms-full.txt');
if (!existsSync(llmsFullPath)) err('llms-full.txt', 'missing');
else {
  const urls = [...readFileSync(llmsFullPath, 'utf8').matchAll(/^URL: (https:\/\/monsoon\.fyi\S*)$/gm)].map((m) => m[1]);
  for (const u of urls) {
    const ok = resolves(u, '/', '');
    if (ok !== true) err('llms-full.txt', `${u} → ${ok}`);
  }
  const indexable = [...pages.keys()].filter((p) => !noindexPages.has(p));
  const have = new Set(urls.map((u) => u.replace(SITE, '')));
  for (const p of indexable) if (!have.has(p)) err('llms-full.txt', `no section for ${p}`);
  if (urls.length !== new Set(urls).size) err('llms-full.txt', 'a page appears twice');
}
if (!existsSync(join(dist, 'og.png'))) err('og.png', 'default share image is missing from dist/');

// No stray share images: every PNG under dist/og/ is some page's og:image.
const ogFiles = walk(join(dist, 'og'));
for (const f of ogFiles) {
  const rel = '/' + f.slice(dist.length + 1);
  if (!referencedOg.has(rel)) err(rel, 'share image is not referenced by any page (stray)');
}
{
  const f = join(dist, 'og.png');
  const size = existsSync(f) ? pngSize(f) : null;
  if (existsSync(f) && (!size || size.w !== 1200 || size.h !== 630)) err('og.png', 'default share image is not a 1200x630 PNG');
}

const counts = Object.fromEntries(PAGE_TYPES.map((t) => [t, 0]));
for (const p of pages.keys()) {
  const t = pageType(p);
  if (t in counts) counts[t]++;
}

if (errors.length) {
  console.error(`[check:seo] ${errors.length} problem(s) across ${pages.size} pages:`);
  for (const e of errors.slice(0, 60)) console.error('  ' + e);
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`);
  process.exit(1);
}
console.log(
  `[check:seo] ok — ${pages.size} pages (${counts.city} city, ${counts.month} month, ${counts.region} region, ${counts['best-index']} best index, ${counts['cities-index']} cities index, ${counts.compare} compare, ${counts['compare-index']} compare index): one h1, self-canonical, unique titles, valid JSON-LD, all internal links resolve, no orphans, ${ogFiles.length} share images (1200x630, one per city/month/compare page, none stray), sitemap index (${indexLocs?.length ?? 0} child sitemaps)/robots/llms consistent`
);
