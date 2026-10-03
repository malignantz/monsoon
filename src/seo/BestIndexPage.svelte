<script>
  // /best/ — the index of the "where to be" pages: the twelve month rankings,
  // then the region hubs (cheapest, safest, cleanest air, winter, summer) for
  // every region large enough to rank.
  import Shell from './Shell.svelte';

  let { months, regionGroups, hubCount, regionCount, compareCount = 0, site, crumbs } = $props();
</script>

<Shell {crumbs} {site}>
  <p class="kicker">{site.cityCount} cities · {regionCount} regions</p>
  <h1>Where to be, by month and by region</h1>
  <p class="lede">
    Every city is scored for every month, so the same data answers two questions: which cities are best right now, and which cities in a region are cheapest, safest, cleanest or best for the season you have in mind.
    {#if hubCount > 0}There are twelve month rankings and {hubCount} region pages below.{/if}
  </p>

  <section aria-labelledby="months">
    <h2 id="months">By month</h2>
    <p class="small muted">Each page ranks all {site.cityCount} cities for one month by the Balanced Score.</p>
    <ul class="plain sources">
      {#each months as m}
        <li>
          <a href={m.path}><b>Where to be in {m.name}</b></a>:
          {m.leader.name} leads at <span class="num">{m.leader.q}</span>;
          {#if m.great > 0}<span class="num">{m.great}</span> of {m.total} cities score 85 or higher.{:else}no city scores 85 or higher.{/if}
        </li>
      {/each}
    </ul>
  </section>

  {#if regionGroups.length}
    <section aria-labelledby="regions">
      <h2 id="regions">By region</h2>
      <p class="small muted">Regions with enough cities to rank. Winter and summer pages cover regions that are mostly north of the equator.</p>
      {#each regionGroups as g}
        <div class="region">
          <h3 class="kicker">{g.regionName} · {g.n} cities</h3>
          <ul class="plain sources">
            {#each g.hubs as h}
              <li><a href={h.path}><b>{h.shortTitle}</b></a>: {h.blurb}</li>
            {/each}
          </ul>
        </div>
      {/each}
    </section>
  {/if}

  {#if compareCount > 0}
    <section aria-labelledby="compare">
      <h2 id="compare">Comparisons</h2>
      <p><a href="/compare/">{compareCount} comparisons</a> set a lower-cost city beside a better-known one and show, month by month, where each scores higher and what each costs.</p>
    </section>
  {/if}

  <section aria-labelledby="all">
    <h2 id="all">Every city</h2>
    <p><a href="/cities/">All {site.cityCount} cities</a>, grouped by region, each with its twelve-month strip. The <a href="/">app</a> adds filters, Compare and a year planner.</p>
  </section>
</Shell>
