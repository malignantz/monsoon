<script>
  // /best/where-to-be-in-<month>/ — every city ranked for one month by the
  // default (Balanced) Score, exactly as the app's This month view ranks it.
  import Shell from './Shell.svelte';
  import MonthStrip from '../lib/MonthStrip.svelte';
  import { fmtMoney } from '../lib/data.svelte.js';
  import { MONTHS_LONG, monthPath, cityPath, appMonthUrl, APP_YEAR_URL, BEST_INDEX } from './derive.js';

  let { mIdx, facts, top, rest, site, crumbs } = $props();

  const r = (n) => Math.round(n);
  const M = MONTHS_LONG[mIdx];
  const prev = (mIdx + 11) % 12;
  const next = (mIdx + 1) % 12;
  const LIST_MAX = 8;
</script>

<Shell {crumbs} {site} currentMonth={mIdx}>
  <p class="kicker">{facts.total} cities ranked · {M}</p>
  <h1>Where to be in {M}</h1>

  <p class="lede">
    {#if facts.great > 0}
      <strong>{facts.great} of {facts.total} cities score 85 or higher in {M}</strong>; <a href={cityPath(facts.leader.city.key)}>{facts.leader.city.name}</a> leads at {r(facts.leader.q)}.
    {:else}
      <strong>No city scores 85 or higher in {M}</strong>; <a href={cityPath(facts.leader.city.key)}>{facts.leader.city.name}</a> leads at {r(facts.leader.q)}.
    {/if}
    {#if facts.leadRegions.length}
      {facts.great >= 5 ? 'Most of those are in' : 'The top 25 lean toward'}
      {#each facts.leadRegions as [region, n], i}{region} ({n}){i < facts.leadRegions.length - 1 ? ' and ' : '.'}{/each}
    {/if}
    {#if facts.peakTop > 0}{facts.peakTop} of the top 25 are in their peak season.{/if}
    {#if facts.cheapestTop}The cheapest of the top 25 is <a href={cityPath(facts.cheapestTop.city.key)}>{facts.cheapestTop.city.name}</a> at <span class="num">{fmtMoney(facts.cheapestTop.m.cost1)}</span>/mo solo.{/if}
  </p>
  {#if facts.festivals.length}
    <p class="lede">Major events among the top 25: {#each facts.festivals as f, i}{f.event.name} (<a href={cityPath(f.city.key)}>{f.city.name}</a>){i < facts.festivals.length - 1 ? ', ' : '.'}{/each}</p>
  {/if}

  <div class="ctas">
    <a class="btn primary" href={appMonthUrl(mIdx)}>See {M} in Monsoon →</a>
    <a class="btn ghost" href={APP_YEAR_URL}>Plan a whole year</a>
  </div>

  <section aria-labelledby="top">
    <h2 id="top">The top 25 for {M}</h2>
    <ol class="plain rank">
      {#each top as row}
        <li>
          <span class="pos">{row.rank}</span>
          <div>
            <a class="name" href={cityPath(row.city.key)}>{row.city.name}</a>
            <div class="where">{row.city.country} · {row.city.region}{#if row.city.schengen}{' · '}<span class="schengen">◆ Schengen</span>{/if}</div>
            <div class="strip-cell"><MonthStrip cells={row.cells} selected={mIdx} /></div>
            <p class="why">{row.why || row.city.draw}</p>
          </div>
          <div class="right">
            <span class="pill lg band-{row.band}">{r(row.q)}</span>
            <span class="cost">{fmtMoney(row.m.cost1)}/mo</span>
          </div>
        </li>
      {/each}
    </ol>
    <p class="small muted">Score is the default Balanced blend of weather, safety, air, season and events for {M}. Cost is one person's month in US dollars. The strip shows each city's whole year, with {M} outlined.</p>
  </section>

  {#if facts.hazards.length || facts.badAir.length}
    <section aria-labelledby="avoid">
      <h2 id="avoid">What the data flags in {M}</h2>
      <ul class="plain sources">
        {#each facts.hazards as g}
          <li>
            <b>{g.label}</b> ({g.cities.length} {g.cities.length === 1 ? 'city' : 'cities'}):
            {#each g.cities.slice(0, LIST_MAX) as h, i}<a href={cityPath(h.city.key)}>{h.city.name}</a>{#if g.cities.length <= 6}{` (${h.note})`}{/if}{i < Math.min(g.cities.length, LIST_MAX) - 1 ? ', ' : ''}{/each}{#if g.cities.length > LIST_MAX}, and {g.cities.length - LIST_MAX} more{/if}.
          </li>
        {/each}
        {#if facts.badAir.length}
          <li>
            <b>Unhealthy air</b> (monthly PM2.5):
            {#each facts.badAir.slice(0, LIST_MAX) as a, i}<a href={cityPath(a.city.key)}>{a.city.name}</a> ({a.m.airCat.toLowerCase()}{a.m.pm25 != null ? `, ${a.m.pm25} µg/m³` : ''}){i < Math.min(facts.badAir.length, LIST_MAX) - 1 ? ', ' : ''}{/each}{#if facts.badAir.length > LIST_MAX}, and {facts.badAir.length - LIST_MAX} more{/if}.
          </li>
        {/if}
        <li>
          <b>Lowest Scores</b>:
          {#each facts.bottom as b, i}<a href={cityPath(b.city.key)}>{b.city.name}</a> ({r(b.q)}){i < facts.bottom.length - 1 ? ', ' : '.'}{/each}
        </li>
      </ul>
      <p class="small muted">Hazard flags (typhoon, flood, heat and haze months) are hand-set per city and month and scale the weather score down.</p>
    </section>
  {/if}

  <section aria-labelledby="rest">
    <h2 id="rest">The rest of the ranking</h2>
    <ol class="rest" start={top.length + 1}>
      {#each rest as row}
        <li><a href={cityPath(row.city.key)}>{row.city.name}</a><span class="num">{r(row.q)}</span></li>
      {/each}
    </ol>
  </section>

  <nav class="prevnext" aria-label="Adjacent months">
    <a href={monthPath(prev)}>← {MONTHS_LONG[prev]}</a>
    <a href={BEST_INDEX}>All months and regions</a>
    <a href={monthPath(next)}>{MONTHS_LONG[next]} →</a>
  </nav>
</Shell>
