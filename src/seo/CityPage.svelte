<script>
  // /city/<slug>/ — one city across twelve months. Every value comes from the
  // public view (publicData.js) or from derive.js over the app's own scoring.
  import Shell from './Shell.svelte';
  import MonthStrip from '../lib/MonthStrip.svelte';
  import { MONTHS, fmtMoney, fmtTemp } from '../lib/data.svelte.js';
  import { MONTHS_LONG, monthPath, cityPath, appCityUrl, APP_YEAR_URL, monthsText } from './derive.js';

  let { c, year, rows, related, sources, safety, cost, hubs = [], regionLabel, comparisons = [], site, crumbs } = $props();

  const r = (n) => Math.round(n);
  const range = ([a, b]) => (a === b ? fmtMoney(a) : `${fmtMoney(a)}–${fmtMoney(b)}`);
  const firstMonth = (e) => Math.min(...(e.months ?? [13]));
  const events = [...c.events].sort((a, b) => firstMonth(a) - firstMonth(b) || b.tier - a.tier);
</script>

<Shell {crumbs} {site}>
  <p class="kicker">{c.region} · {c.country}</p>
  <h1>{c.name}<span class="dot">,</span> month by month</h1>
  {#if c.vibe}<p class="dek">{c.vibe}</p>{/if}

  <div class="strip-wrap">
    <MonthStrip cells={year.cells} size="lg" labels selected={year.best} />
    <div class="strip-months" aria-label="Month pages">
      {#each MONTHS as m, i}<a href={monthPath(i)} title="Where to be in {MONTHS_LONG[i]}">{m}</a>{/each}
    </div>
  </div>

  <p class="lede">
    {#if year.standout}<strong>{year.summary}</strong>{:else}<strong>No month reaches the good band (75+).</strong>{/if}
    Its highest Score is {MONTHS_LONG[year.best]} ({r(year.q[year.best])}); its lowest is {MONTHS_LONG[year.worst]} ({r(year.q[year.worst])}).
    {#if year.avoid}Months scoring under 65: {year.avoid}.{/if}
    {#if year.hazards.length}Hazard flags: {#each year.hazards as h, i}{h.note} ({h.when}){i < year.hazards.length - 1 ? '; ' : '.'}{/each}{/if}
    {#if year.peakSeason}Peak season: {year.peakSeason}.{/if}
  </p>

  <div class="ctas">
    <a class="btn primary" href={appCityUrl(c.key, year.best)}>Open {c.name} in {MONTHS_LONG[year.best]} →</a>
    <a class="btn ghost" href={APP_YEAR_URL}>Plan a year around it</a>
  </div>

  <section aria-labelledby="glance">
    <h2 id="glance">At a glance</h2>
    <dl class="glance">
      <div>
        <dt>Monthly cost</dt>
        <dd><span class="num">{range(cost.solo)}</span> solo<br /><span class="num">{range(cost.couple)}</span> couple</dd>
      </div>
      <div>
        <dt>Safety</dt>
        <dd><span class="big num">{safety.score}</span>{safety.label}</dd>
      </div>
      <div>
        <dt>Schengen Area</dt>
        <dd>{#if c.schengen}<span class="schengen">◆ Yes</span>: days here count toward 90 in any 180{:else}No: days here don't count toward the Schengen 90/180 limit{/if}</dd>
      </div>
      {#if c.english?.note}
        <div><dt>English</dt><dd>{c.english.note}</dd></div>
      {/if}
      {#if c.swim?.months?.length}
        <div><dt>Swimming</dt><dd>{c.swim.name}: {monthsText(c.swim.months)}</dd></div>
      {/if}
      {#if c.timezone}
        <div><dt>Time zone</dt><dd class="num">{c.timezone}</dd></div>
      {/if}
    </dl>
  </section>

  <section aria-labelledby="months">
    <h2 id="months">Month by month</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Score</th>
            <th scope="col">Day / night</th>
            <th scope="col">Rain days</th>
            <th scope="col">PM2.5</th>
            <th scope="col">Season</th>
            <th scope="col">Solo</th>
            <th scope="col">Couple</th>
            <th scope="col">Notes</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as row, i}
            <tr>
              <th scope="row"><a href={monthPath(i)}>{MONTHS_LONG[i]}</a></th>
              <td><span class="pill band-{year.cells[i].band}">{r(year.q[i])}</span></td>
              <td class="num">{fmtTemp(row.m.high)} / {fmtTemp(row.m.low)}</td>
              <td class="num">{row.m.rain ?? '—'}</td>
              <td class="num">{row.m.pm25 ?? '—'} <span class="muted small">{row.m.airCat}</span></td>
              <td>{row.m.season}</td>
              <td class="num">{fmtMoney(row.m.cost1)}</td>
              <td class="num">{fmtMoney(row.m.cost2)}</td>
              <td class="note">
                {#if row.hazard}<span class="flag">⚠ {row.hazard}</span>{#if row.events.length}<br />{/if}{/if}
                {#each row.events as e, j}{e.tier >= 3 ? '★ ' : ''}{e.name}{j < row.events.length - 1 ? ', ' : ''}{/each}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small muted">PM2.5 is the monthly mean in µg/m³. Costs are per month, in US dollars.</p>
  </section>

  {#if c.narrative || events.length}
    <section aria-labelledby="draw">
      <h2 id="draw">The draw{c.draw ? `: ${c.draw.toLowerCase()}` : ''}</h2>
      {#if c.narrative}<p>{c.narrative}</p>{/if}
      {#if events.length}
        <h3 class="kicker">Event calendar</h3>
        <ul class="plain events">
          {#each events as e}
            <li>
              <span class="when">{monthsText(e.months)}</span>
              <span><b>{e.name}</b>{#if e.tier >= 3}<span class="tier">Major</span>{/if}{#if e.blurb}<span class="muted"> — {e.blurb}</span>{/if}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section aria-labelledby="safety">
    <h2 id="safety">Safety</h2>
    <p>Safety is <b class="num">{safety.score}</b> of 100 ({safety.label}){safety.asOf ? `, reviewed ${safety.asOf}` : ''}.</p>
    <ul class="plain sources">
      {#if safety.violent}
        <li>
          <b>Violent crime</b>{safety.violent.sub != null ? ` ${r(safety.violent.sub)}` : ''}:
          {#if safety.violent.homicideRate != null}intentional homicides {safety.violent.homicideRate} per 100,000 ({safety.violent.scope ?? 'country'} figure).{/if}
          {#if safety.violent.source}Source: {#if safety.violent.url}<a href={safety.violent.url}>{safety.violent.source}</a>{:else}{safety.violent.source}{/if}.{/if}
        </li>
      {/if}
      {#if safety.property != null}<li><b>Property crime</b> {safety.property}<span class="chip editorial">Editorial estimate</span></li>{/if}
      {#if safety.visitor != null}<li><b>Visitor modifier</b> <span class="num">×{safety.visitor}</span><span class="chip editorial">Editorial estimate</span></li>{/if}
      {#if safety.womens}
        <li>
          <b>Women's street-safety</b> {safety.womens.sub}{#if safety.womens.cs != null}: {safety.womens.cs}% of women in {c.country} say they feel safe walking alone at night{/if}.
          Shown beside safety, not part of the Score.
          {#if safety.womens.url}Source: <a href={safety.womens.url}>{safety.womens.source}</a>.{/if}
        </li>
      {/if}
      {#if safety.advisory}
        <li>
          <b>U.S. travel advisory</b>: {safety.advisory}{safety.advisoryLevel ? ` (Level ${safety.advisoryLevel})` : ''}{safety.advisoryDate ? `, dated ${safety.advisoryDate}` : ''}.
          Shown for reference; advisories never change the score.
          {#if safety.advisoryUrl}<a href={safety.advisoryUrl}>State Department page</a>.{/if}
        </li>
      {/if}
    </ul>
  </section>

  {#if cost.items.length}
    <section aria-labelledby="cost">
      <h2 id="cost">What a month costs</h2>
      <p>
        One person, base month{cost.asOf ? `, as of ${cost.asOf}` : ''}.
        {#if cost.sumsToBase}These items add up to the <span class="num">{fmtMoney(c.solo)}</span> solo base; the couple base is <span class="num">{fmtMoney(c.couple)}</span>. Rent is the part adjusted by season, which gives the month-by-month figures above.{/if}
      </p>
      <div class="tablewrap">
        <table>
          <thead><tr><th scope="col">Item</th><th scope="col">USD / mo</th><th scope="col">Source</th><th scope="col">Confidence</th></tr></thead>
          <tbody>
            {#each cost.items as it}
              <tr>
                <th scope="row">{it.label}</th>
                <td class="num">{fmtMoney(it.usd)}</td>
                <td class="note">{#if it.url}<a href={it.url}>{it.source ?? 'source'}</a>{:else}{it.sourceText}{/if}{it.asOf ? ` · ${it.asOf}` : ''}</td>
                <td>{it.confidence ?? '—'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}

  <section aria-labelledby="sources">
    <h2 id="sources">Where the numbers come from</h2>
    <ul class="plain sources">
      {#each sources as s}
        <li>
          <b>{s.label}</b>{#if s.chip}<span class="chip {s.chip === 'Editorial estimate' ? 'editorial' : s.chip === 'Low' ? 'low' : ''}">{s.chip}</span>{/if}
          — {s.text}{#each s.links as l, j}{j === 0 ? ' ' : ', '}<a href={l.url}>{l.name}</a>{/each}
        </li>
      {/each}
    </ul>
    <p class="small"><a href={site.reportUrl(c.name)}>Spot a wrong number? Report it</a> (opens a public GitHub issue).</p>
  </section>

  <section aria-labelledby="related">
    <h2 id="related">Cities with a similar year</h2>
    <div class="cards">
      {#each related as o}
        <a class="card" href={cityPath(o.c.key)}>
          <div class="row"><span class="name">{o.c.name}</span><span class="muted small">{o.c.country}</span></div>
          <MonthStrip cells={o.cells} />
          <div class="sub">{o.summary} {o.sameRegion ? `Same region (${o.c.region}).` : `${o.c.region}.`} From <span class="num">{fmtMoney(o.minSolo)}</span>/mo solo.</div>
        </a>
      {/each}
    </div>
    {#if comparisons.length}
      <p class="small muted">Compared with: {#each comparisons as o, i}<a href={o.path} title="{o.label}, month by month">{o.other}</a>{i < comparisons.length - 1 ? ' · ' : ''}{/each}</p>
    {/if}
    {#if hubs.length}
      <p class="small muted">More in {regionLabel}: {#each hubs as h, i}<a href={h.path}>{h.label}</a>{i < hubs.length - 1 ? ' · ' : ''}{/each}</p>
    {/if}
  </section>

  <div class="ctas">
    <a class="btn primary" href={appCityUrl(c.key, year.best)}>Open {c.name} in Monsoon →</a>
    <a class="btn ghost" href="/cities/">Browse all {site.cityCount} cities</a>
  </div>
</Shell>
