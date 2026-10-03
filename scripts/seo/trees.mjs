// Shared constants for the generated output trees (build-seo.mjs, check-seo.mjs,
// leak-check.mjs). scripts/build.sh is bash and keeps its own explicit list in
// its find-guard; keep the two in step.
//
// Trees the generator owns and clears on every run:
//   city/     /city/<slug>/index.html
//   best/     /best/index.html, month pages, region hubs
//   cities/   /cities/index.html
//   compare/  /compare/index.html and /compare/<a>-vs-<b>/index.html
//   og/       build-time PNG share images (only .png files)
export const GENERATED_TREES = ['city', 'best', 'cities', 'compare', 'og'];

// Trees made of index.html pages (everything but og/).
export const PAGE_TREES = ['city', 'best', 'cities', 'compare'];

export const PAGE_TYPES = ['city', 'month', 'region', 'best-index', 'cities-index', 'compare', 'compare-index'];

// URL path ('/city/lisbon/') → page type.
export function pageType(path) {
  if (path.startsWith('/city/')) return 'city';
  if (path === '/best/') return 'best-index';
  if (path.startsWith('/best/where-to-be-in-')) return 'month';
  if (path.startsWith('/best/')) return 'region';
  if (path === '/cities/') return 'cities-index';
  if (path === '/compare/') return 'compare-index';
  if (path.startsWith('/compare/')) return 'compare';
  return 'other';
}

// "city 120, month 12, …" for the summary lines.
export function countsLine(paths) {
  const n = Object.fromEntries(PAGE_TYPES.map((t) => [t, 0]));
  for (const p of paths) {
    const t = pageType(p);
    if (t in n) n[t]++;
  }
  return PAGE_TYPES.map((t) => `${n[t]} ${t.replace('-', ' ')}`).join(', ');
}
