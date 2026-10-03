<script>
  // /best/<attribute>-in-<region>/ — one region's cities ranked on one
  // attribute (cost, safety, air, winter or summer Score). Every figure comes
  // from derive.js computeHub() over the public city view.
  import Shell from './Shell.svelte';
  import MonthStrip from '../lib/MonthStrip.svelte';
  import { cityPath, BEST_INDEX } from './derive.js';

  let { hub, siblings, elsewhere, site, crumbs } = $props();

  const TOP = 10;
  const top = hub.rows.slice(0, TOP);
  const rest = hub.rows.slice(TOP);
</script>

<Shell {crumbs} {site}>
  <p class="kicker">{hub.kicker}</p>
  <h1>{hub.title}</h1>

  <p class="lede">
    {#each hub.parts as part}{#if typeof part === 'string'}{part}{:else}<a href={cityPath(part.key)}>{part.name}</a>{/if}{/each}
  </p>

  <div class="ctas">
    <a class="btn primary" href={hub.cta.href}>{hub.cta.text}</a>
    <a class="btn ghost" href={BEST_INDEX}>All months and regions</a>
  </div>

  <section aria-labelledby="top">
    <h2 id="top">{rest.length ? `The top ${top.length}` : `All ${hub.n}`}</h2>
    <ol class="plain rank">
      {#each top as row}
        <li>
          <span class="pos">{row.rank}</span>
          <div>
            <a class="name" href={cityPath(row.p.key)}>{row.p.name}</a>
            <div class="where">{row.p.country}{#if row.p.schengen}{' · '}<span class="schengen">◆ Schengen</span>{/if}</div>
            <div class="strip-cell"><MonthStrip cells={row.cells} selected={row.best} /></div>
            <p class="why">
              Best month {row.bestMonth} (Score <span class="num">{row.bestQ}</span>).
              {#if row.detail}<span class="muted">{row.detail}.</span>{/if}
            </p>
          </div>
          <div class="right">
            <span class="val">{row.valueText}</span>
            <span class="unit">{row.unit}</span>
            <span class="cost">{row.aux}</span>
          </div>
        </li>
      {/each}
    </ol>
    <p class="small muted">The strip is each city's whole year by Score, with its best month outlined.</p>
  </section>

  {#if rest.length}
    <section aria-labelledby="rest">
      <h2 id="rest">The rest of the ranking</h2>
      <ol class="rest" start={top.length + 1}>
        {#each rest as row}
          <li><a href={cityPath(row.p.key)}>{row.p.name}</a><span class="num">{row.valueText}</span></li>
        {/each}
      </ol>
      <p class="small muted">Number shown: {hub.valueLabel}.</p>
    </section>
  {/if}

  <section aria-labelledby="measured">
    <h2 id="measured">How this is measured</h2>
    {#each hub.measure as para}<p>{para}</p>{/each}
    <p class="small">Each city page lists where its numbers come from, with source, date and confidence.</p>
  </section>

  <section aria-labelledby="more">
    <h2 id="more">More from {hub.regionName}</h2>
    {#if siblings.length}
      <p>Other rankings for {hub.regionName}: {#each siblings as s, i}<a href={s.path}>{s.label}</a>{i < siblings.length - 1 ? ' · ' : ''}{/each}.</p>
    {/if}
    {#if elsewhere.length}
      <p>{hub.label[0].toUpperCase() + hub.label.slice(1)} in other regions: {#each elsewhere as e, i}<a href={e.path}>{e.regionName}</a>{i < elsewhere.length - 1 ? ' · ' : ''}{/each}.</p>
    {/if}
    <p><a href={BEST_INDEX}>All months and regions</a> · <a href="/cities/">All {site.cityCount} cities</a></p>
  </section>
</Shell>
