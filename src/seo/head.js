// <head> and document wrapper for the static pages: title, description,
// self-canonical, Open Graph / Twitter, JSON-LD, inlined CSS. No scripts other
// than JSON-LD data blocks.
import { SITE } from './derive.js';

export const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// JSON inside <script>: escape anything that could close the tag or start a comment.
const jsonForScript = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// Same favicon as index.html (the four score bands).
const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='15' fill='%23f6f1e6'/%3E%3Crect x='9' y='13' width='10' height='38' rx='2.5' fill='%23c8502e'/%3E%3Crect x='21' y='13' width='10' height='38' rx='2.5' fill='%23e2a53c'/%3E%3Crect x='33' y='13' width='10' height='38' rx='2.5' fill='%239eba63'/%3E%3Crect x='45' y='13' width='10' height='38' rx='2.5' fill='%23156b4f'/%3E%3C/svg%3E";

// Svelte's SSR hydration markers (<!--[-->, <!--]-->, <!--[0-->, <!---->) mean
// nothing on a page that never hydrates.
const stripMarkers = (html) => html.replace(/<!--(?:\[-?\d*|\[!|\])?-->/g, '');

export function breadcrumbLd(crumbs) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: SITE + c.href }))
  };
}

// noindex adds <meta name="robots" content="noindex"> (such a page is also kept out of every sitemap);
// ogImage is a site path (e.g. "/og/city-lisbon.png") for a per-page share image, default /og.png.
export function documentHtml({ path, title, description, ogType = 'website', jsonLd, css, body, cityCount, noindex = false, ogImage = null }) {
  const url = SITE + path;
  const img = SITE + (ogImage ?? '/og.png');
  const ld = jsonLd ? { '@context': 'https://schema.org', '@graph': jsonLd } : null;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(url)}">
<meta name="theme-color" content="#f6f1e6">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="Monsoon">
<meta property="og:url" content="${esc(url)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Monsoon — follow the good months. ${cityCount} cities scored month by month.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="icon" href="${ICON}">
<style>${css}</style>
${ld ? `<script type="application/ld+json">${jsonForScript(ld)}</script>\n` : ''}</head>
<body>
${stripMarkers(body)}
</body>
</html>
`;
}
