// Every "Build me a year" seed style must yield a full, Schengen-legal year
// that keeps each country under 183 days. Loads the real dataset and
// generateRoute through Vite's SSR loader (data.svelte.js uses runes).
// Run: node scripts/check-seeds.mjs
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
let failed = 0;
try {
  const data = await server.ssrLoadModule('/src/lib/data.svelte.js');
  const { countryDays, RESIDENCY_DAYS } = await server.ssrLoadModule('/src/lib/dayCount.js');
  const { generateRoute, routeStats, monthOccupancy, cityByKey, PRESETS, favorites, cities } = data;
  const countryOf = (k) => cityByKey.get(k)?.country;

  const check = (label, stays, { full = true } = {}) => {
    const filled = monthOccupancy(stays).filter(Boolean).length;
    const sch = routeStats(stays).schengen;
    const cd = countryDays(stays, countryOf);
    const ok = (!full || filled === 12) && sch.ok && (cd.top?.days ?? 0) < RESIDENCY_DAYS;
    if (!ok) failed++;
    console.log(
      `${ok ? '  ok ' : 'FAIL '} ${label.padEnd(38)} ${filled}/12 months · Schengen ${sch.worst}/90 · ` +
        `longest ${cd.top?.country ?? '—'} ${cd.top?.days ?? 0}d`
    );
  };

  const styles = ['quality', 'value', 'festival', 'nonschengen'];
  for (const preset of Object.keys(PRESETS))
    for (const style of styles)
      for (const model of style === 'value' ? ['adjusted', 'classic'] : ['adjusted'])
        check(`${style}${style === 'value' ? `/${model}` : ''} · ${preset}`, generateRoute(style, preset, model));

  // Favorites drawn from only two countries is the worst case for one country
  // hogging the year; a pool that small may honestly run short, so only the
  // Schengen and 183-day promises are checked there.
  for (const c of cities) if (c.country === 'Spain' || c.country === 'Mexico') favorites.add(c.key);
  check('favorites (Spain + Mexico) · balanced', generateRoute('favorites', 'balanced'), { full: false });
} finally {
  await server.close();
}
console.log(failed ? `\n${failed} failed` : '\nall seed styles: full, Schengen-legal, every country < 183 days');
process.exit(failed ? 1 : 0);
