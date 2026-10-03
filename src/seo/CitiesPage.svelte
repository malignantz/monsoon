<script>
  // /cities/ — the HTML directory: every city, grouped by region, each linking
  // to its page. Hub for the month pages too (header + footer month nav).
  import Shell from './Shell.svelte';
  import MonthStrip from '../lib/MonthStrip.svelte';
  import { MONTHS, fmtMoney } from '../lib/data.svelte.js';
  import { cityPath, monthPath, regionSlug, MONTHS_LONG } from './derive.js';

  let { groups, site, crumbs } = $props();
</script>

<Shell {crumbs} {site}>
  <p class="kicker">Directory</p>
  <h1>All {site.cityCount} cities</h1>
  <p class="lede">{site.cityCount} cities in {groups.length} regions, each scored for all twelve months on weather, air, safety, season, events and cost. The strip under each name is its year, January to December.</p>

  <nav aria-label="Regions">
    <p class="small">
      {#each groups as g, i}<a href="#{regionSlug(g.region)}">{g.region}</a> <span class="muted">({g.cities.length})</span>{i < groups.length - 1 ? ' · ' : ''}{/each}
    </p>
  </nav>

  <nav aria-label="Months">
    <p class="small">Ranked by month:
      {#each MONTHS as m, i}<a href={monthPath(i)} title="Where to be in {MONTHS_LONG[i]}">{m}</a>{i < 11 ? ' · ' : ''}{/each}
    </p>
  </nav>

  {#each groups as g}
    <div class="region" id={regionSlug(g.region)}>
      <h2>{g.region}</h2>
      <div class="cards">
        {#each g.cities as o}
          <a class="card" href={cityPath(o.c.key)}>
            <div class="row"><span class="name">{o.c.name}</span><span class="muted small">{o.c.country}</span></div>
            <MonthStrip cells={o.cells} />
            <div class="sub">{o.summary} From <span class="num">{fmtMoney(o.minSolo)}</span>/mo solo.{#if o.c.schengen}{' '}<span class="schengen">◆ Schengen</span>{/if}</div>
          </a>
        {/each}
      </div>
    </div>
  {/each}
</Shell>
