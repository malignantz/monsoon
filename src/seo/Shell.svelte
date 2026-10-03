<script>
  // Shared frame for every static page: brand bar, breadcrumbs, the twelve
  // month hubs, and a footer. Server-rendered only — no hydration, no JS.
  import { MONTHS } from '../lib/data.svelte.js';
  import { monthPath, MONTHS_LONG } from './derive.js';

  let { crumbs = [], currentMonth = -1, site, children } = $props();
</script>

<div class="wrap">
  <header class="top">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>Monsoon</a>
    <nav class="nav" aria-label="Site">
      <a href="/cities/">All cities</a>
      <a href={monthPath(site.thisMonth)}>Where to be in {MONTHS_LONG[site.thisMonth]}</a>
      <a href="/">Open the app</a>
    </nav>
  </header>

  {#if crumbs.length > 1}
    <nav aria-label="Breadcrumb">
      <ol class="crumbs">
        {#each crumbs as c, i}
          <li>{#if i < crumbs.length - 1}<a href={c.href}>{c.name}</a>{:else}<span aria-current="page">{c.name}</span>{/if}</li>
        {/each}
      </ol>
    </nav>
  {/if}

  <main>
    {@render children()}
  </main>

  <footer class="foot">
    <nav aria-label="Months">
      <p>Where to be in…</p>
      <ul class="monthnav">
        {#each MONTHS as m, i}
          <li><a href={monthPath(i)} aria-current={i === currentMonth ? 'page' : undefined} title={MONTHS_LONG[i]}>{m}</a></li>
        {/each}
      </ul>
    </nav>
    <p><a href="/cities/">All {site.cityCount} cities</a> · <a href="/">Plan your year in Monsoon</a> · <a href={site.feedback}>Report a number</a></p>
    <p>Scores use methodology {site.methodVersion}{site.lastUpdated ? `, last updated ${site.lastUpdated}` : ''}. Cost data as of {site.costAsOf}; safety data as of {site.safetyAsOf}.</p>
  </footer>
</div>
