// Every "Build me a year" seed style must yield a full, Schengen-legal year
// that keeps each country under 183 days, and the generator must respect locked
// stays and anchors ("I must be in Europe in June"). Loads the real dataset,
// generateRoute/planYear and yearPlan.js through Vite's SSR loader
// (data.svelte.js uses runes).
// Run: node scripts/check-seeds.mjs
import { createServer } from 'vite';

const server = await createServer({ logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' });
let failed = 0;
try {
  const data = await server.ssrLoadModule('/src/lib/data.svelte.js');
  const { countryDays, RESIDENCY_DAYS } = await server.ssrLoadModule('/src/lib/dayCount.js');
  const { resolveAnchors } = await server.ssrLoadModule('/src/lib/yearPlan.js');
  const { DEFAULT_COST_WEIGHT, COST_WEIGHT_STOPS, generateRoute, planYear, stayMonths, routeStats, monthOccupancy, cityByKey, PRESETS, favorites, cities } = data;
  const stopEs = COST_WEIGHT_STOPS.map((s) => s.e);
  const dialOk = stopEs.includes(DEFAULT_COST_WEIGHT) && stopEs[0] > 0 && stopEs[stopEs.length - 1] === 1;
  if (!dialOk) failed++;
  console.log(`${dialOk ? '  ok ' : 'FAIL '} cost-weight stops ${stopEs.join(', ')} · default ${DEFAULT_COST_WEIGHT} in stops, first > 0, last = 1`);

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
      for (const model of style === 'value' ? stopEs : [DEFAULT_COST_WEIGHT])
        check(`${style}${style === 'value' ? `/${model}` : ''} · ${preset}`, generateRoute(style, preset, model));

  // Favorites drawn from only two countries is the worst case for one country
  // hogging the year; a pool that small may honestly run short, so only the
  // Schengen and 183-day promises are checked there.
  for (const c of cities) if (c.country === 'Spain' || c.country === 'Mexico') favorites.add(c.key);
  check('favorites (Spain + Mexico) · balanced', generateRoute('favorites', 'balanced'), { full: false });

  // ---- Locked stays and anchors ----
  // planYear must hand every locked stay back untouched, fill only the months
  // they leave open (no overlaps, legs lined up with `added`), stay Schengen-legal
  // and under 183 days, and either meet each anchor or report it as unmet.
  const slug = (k) => {
    if (!cityByKey.has(k)) throw new Error(`unknown city slug: ${k}`);
    return k;
  };
  const checkPlan = (label, locked, anchors, plan, { full = true, anchorsMet = true, schengen = true, extra } = {}) => {
    const problems = [];
    const same = (a, b) => a.key === b.key && a.start === b.start && a.len === b.len;
    for (const l of locked) if (!plan.stays.some((s) => same(s, l))) problems.push(`locked ${l.key} changed`);
    if (plan.stays.length !== locked.length + plan.added.length) problems.push('stays != locked + added');
    const lockedMonths = new Set(locked.flatMap((s) => stayMonths(s)));
    const seen = new Set();
    let total = 0;
    for (const s of plan.added) {
      if (!(Number.isInteger(s.start) && s.start >= 0 && s.start <= 11 && Number.isInteger(s.len) && s.len >= 1))
        problems.push(`bad stay ${s.key} ${s.start}+${s.len}`);
      for (const m of stayMonths(s)) {
        seen.add(m);
        if (lockedMonths.has(m)) problems.push(`${s.key} overlaps a locked month`);
      }
      total += s.len;
    }
    if (seen.size !== total) problems.push('added stays overlap each other');
    if (plan.legs.length !== plan.added.length || plan.legs.some((l, i) => !same(l, plan.added[i])))
      problems.push('legs do not line up with added');
    const stats = routeStats(plan.stays);
    if (schengen && routeStats(locked).schengen.ok && !stats.schengen.ok) problems.push('Schengen over 90');
    const cd = countryDays(plan.stays, countryOf);
    if ((cd.top?.days ?? 0) >= RESIDENCY_DAYS) problems.push(`${cd.top.country} at ${cd.top.days}d`);
    const filled = monthOccupancy(plan.stays).filter(Boolean).length;
    if (full && filled !== 12) problems.push(`only ${filled}/12 months`);
    if (anchorsMet && plan.unmet.length) problems.push(`anchors unmet: ${plan.unmet.map((a) => a.label).join(', ')}`);
    if (extra) problems.push(...extra(plan));
    if (problems.length) failed++;
    console.log(
      `${problems.length ? 'FAIL ' : '  ok '} ${label.padEnd(46)} ${filled}/12 months · +${plan.added.length} added · ` +
        `Schengen ${stats.schengen.worst}/90 · longest ${cd.top?.country ?? '—'} ${cd.top?.days ?? 0}d · ` +
        `unmet ${plan.unmet.length} · open ${plan.open.length}` +
        (problems.length ? ` — ${problems.join('; ')}` : '')
    );
  };
  const run = (label, locked, anchors, style, preset, model, opts) =>
    checkPlan(label, locked, anchors, planYear(style, preset, model, { locked, anchors: resolveAnchors(anchors) }), opts);
  const stay = (key, start, len) => ({ key: slug(key), start, len });

  const hasSchengenAdded = (plan) =>
    plan.added.some((s) => cityByKey.get(s.key).schengen) ? ['added a Schengen stay to an over-limit year'] : [];

  // a. Lisbon Jun–Jul locked, every style × preset
  const lisbon = [stay('lisbon', 5, 2)];
  for (const preset of Object.keys(PRESETS))
    for (const style of styles)
      for (const model of style === 'value' ? stopEs : [DEFAULT_COST_WEIGHT])
        run(`lock Lisbon Jun–Jul · ${style}${style === 'value' ? `/${model}` : ''} · ${preset}`, lisbon, [], style, preset, model);

  // b. Chiang Mai Jan–Feb + Mexico City Sep–Oct
  const two = [stay('chiang-mai', 0, 2), stay('mexico-city', 8, 2)];
  for (const style of styles) run(`lock Chiang Mai + Mexico City · ${style}`, two, [], style, 'balanced', DEFAULT_COST_WEIGHT);

  // c. A locked stay that wraps Dec→Jan
  const wrap = [stay('buenos-aires', 11, 2)];
  for (const style of styles) run(`lock Buenos Aires Dec–Jan · ${style}`, wrap, [], style, 'balanced', DEFAULT_COST_WEIGHT);

  // d. Eleven months locked, one gap month left (distinct non-Schengen countries)
  const seenCountry = new Set();
  const eleven = [];
  for (const c of cities) {
    if (eleven.length === 11) break;
    if (c.schengen || seenCountry.has(c.country)) continue;
    seenCountry.add(c.country);
    eleven.push({ key: c.key, start: [0, 1, 2, 3, 4, 5, 7, 8, 9, 10, 11][eleven.length], len: 1 });
  }
  run('lock 11 months, one gap (Jul) · quality', eleven, [], 'quality', 'balanced', DEFAULT_COST_WEIGHT);

  // e. A locked year already over the Schengen limit: add no more Schengen, and
  // keep every country under 183 days; the over-limit locks themselves stay put.
  const illegal = [stay('rome', 3, 2), stay('paris', 6, 2)];
  for (const style of styles)
    run(`lock Rome + Paris (already over) · ${style}`, illegal, [], style, 'balanced', DEFAULT_COST_WEIGHT, {
      schengen: false,
      extra: hasSchengenAdded
    });

  // f. Anchors on an empty year
  const anchorSets = [
    ['Europe in Jun', [{ place: 'europe', month: 5 }]],
    ['SE Asia in Jan + Europe in Jul', [{ place: 'r:SE Asia', month: 0 }, { place: 'europe', month: 6 }]],
    ['Latin America in Dec + Asia in Mar', [{ place: 'latam', month: 11 }, { place: 'asia', month: 2 }]]
  ];
  for (const [name, anchors] of anchorSets)
    for (const style of styles) run(`anchor ${name} · ${style}`, [], anchors, style, 'balanced', DEFAULT_COST_WEIGHT);

  // g. Lisbon Jun–Jul + Europe in Aug: the Schengen budget is nearly spent, so
  // August has to go to a non-Schengen European city.
  const europeAug = [{ place: 'europe', month: 7 }];
  for (const style of styles) run(`lock Lisbon Jun–Jul + Europe in Aug · ${style}`, lisbon, europeAug, style, 'balanced', DEFAULT_COST_WEIGHT);

  // h. The Spain + Mexico favorites pool (added above) with a lock and an anchor;
  // the pool may honestly run short, so only the legality promises are checked.
  run(
    'favorites: lock Mexico City Jan–Mar + Europe in Jul',
    [stay('mexico-city', 0, 3)],
    [{ place: 'europe', month: 6 }],
    'favorites',
    'balanced',
    DEFAULT_COST_WEIGHT,
    { full: false, anchorsMet: false }
  );
} finally {
  await server.close();
}
console.log(
  failed
    ? `\n${failed} failed`
    : '\nall seed styles: full, Schengen-legal, every country < 183 days; locked stays and anchors respected'
);
process.exit(failed ? 1 : 0);
