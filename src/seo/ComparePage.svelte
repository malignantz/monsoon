<script>
  // /compare/<subject>-vs-<anchor>/ — one lower-cost city set beside a
  // better-known one, month by month. Every value comes from the public city
  // view, from pairing.js (the gate and the story copy) or from derive.js; the
  // template adds no numbers of its own beyond rounding for display.
  import Shell from './Shell.svelte';
  import MonthStrip from '../lib/MonthStrip.svelte';
  import { MONTH_LETTERS, fmtMoney } from '../lib/data.svelte.js';
  import { GATE } from './pairing.js';
  import { MONTHS_LONG, monthPath, cityPath, fmtRuns, COMPARE_INDEX, BEST_INDEX } from './derive.js';

  let { v, site, crumbs } = $props();
  const { S, A, story, rows, glance } = v;

  const range = ([a, b]) => (a === b ? fmtMoney(a) : `${fmtMoney(a)}–${fmtMoney(b)}`);
  const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
  const winPts = GATE.winMargin;
  const cheaperPct = Math.round((1 - GATE.winCostRatio) * 100);
  const verdictText = (r) =>
    r.winner === 'subject' ? `${S.name} wins` : r.winner === 'anchor' ? `${A.name} wins` : r.diff >= winPts ? `Even (cost gap under ${cheaperPct}%)` : 'Even';
</script>

<Shell {crumbs} {site}>
  <p class="kicker">Comparison · {v.regionLabel}</p>
  <h1>{S.name} vs {A.name}</h1>
  <p class="dek">{story.claim}</p>

  <div class="cmp">
    <div class="cmp-row">
      <div class="cmp-head">
        <a class="name" href={cityPath(S.key)}>{S.name}</a>
        <span class="cost num">{range(v.costS)} a month, solo</span>
      </div>
      <MonthStrip cells={v.cellsS} size="lg" selected={story.bestMonth.month} />
      <div class="winrow" aria-hidden="true">
        {#each v.winFlags as on}<span class:on></span>{/each}
      </div>
    </div>
    <div class="cmp-row">
      <div class="cmp-head">
        <a class="name" href={cityPath(A.key)}>{A.name}</a>
        <span class="cost num">{range(v.costA)} a month, solo</span>
      </div>
      <MonthStrip cells={v.cellsA} size="lg" selected={story.bestMonth.month} />
    </div>
    <div class="strip-months" aria-label="Month pages">
      {#each MONTH_LETTERS as m, i}<a href={monthPath(i)} title="Where to be in {MONTHS_LONG[i]}" aria-label="Where to be in {MONTHS_LONG[i]}">{m}</a>{/each}
    </div>
    <p class="cmp-note">
      <span class="key" aria-hidden="true"></span>A bar under a month marks a win for {S.name}: its Score is at least {winPts} points higher and its cost at least {cheaperPct}% lower.
      That is {v.winText}. The outlined month is the best one, {MONTHS_LONG[story.bestMonth.month]}. Numbers in the cells are Scores.
    </p>
  </div>

  <div class="ctas">
    <a class="btn primary" href={v.appCompare}>Compare them in Monsoon →</a>
    <a class="btn ghost" href={v.appCity}>Open {S.name} in Monsoon</a>
  </div>

  <section aria-labelledby="best">
    <h2 id="best">Best month: {MONTHS_LONG[story.bestMonth.month]}</h2>
    <p>{story.bestMonth.sentence}</p>
    {#if v.findings.length}
      <ul class="bullets">
        {#each v.findings as f}<li>{f}</li>{/each}
      </ul>
    {/if}
    {#if story.bestMonth.events.length}
      <p>Major events in {S.name} in {MONTHS_LONG[story.bestMonth.month]}: {story.bestMonth.events.join(', ')}.</p>
    {/if}
  </section>

  <section aria-labelledby="months">
    <h2 id="months">Month by month</h2>
    <div class="tablewrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">{S.name} Score</th>
            <th scope="col">{A.name} Score</th>
            <th scope="col">Difference</th>
            <th scope="col">{S.name} cost</th>
            <th scope="col">{A.name} cost</th>
            <th scope="col" class="verdict">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as r}
            <tr>
              <th scope="row"><a href={monthPath(r.m)}>{MONTHS_LONG[r.m]}</a></th>
              <td><span class="pill band-{r.sBand}">{r.sq}</span></td>
              <td><span class="pill band-{r.aBand}">{r.aq}</span></td>
              <td class="num diff">{signed(r.diff)}</td>
              <td class="num">{fmtMoney(r.sCost)}</td>
              <td class="num">{fmtMoney(r.aCost)}</td>
              <td class="verdict" class:win={r.winner === 'subject'}>{verdictText(r)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <p class="small muted">
      Difference is {S.name}'s Score minus {A.name}'s. Cost is one person's month in US dollars. {S.name} wins a month when its Score is at least {winPts} points higher and its cost at least {cheaperPct}% lower; {A.name} wins when its Score is at least {winPts} points higher; anything else is even.
    </p>
  </section>

  <section aria-labelledby="other">
    <h2 id="other">When {A.name} is the better pick</h2>
    <p>{story.anchorSide}{#if story.evenSide}{' '}{story.evenSide}{/if}</p>
  </section>

  <section aria-labelledby="glance">
    <h2 id="glance">At a glance</h2>
    <dl class="glance">
      <div>
        <dt>Safety</dt>
        <dd>
          <b>{S.name}</b>: <span class="num">{glance.safety[0].score}</span> {glance.safety[0].label}<br />
          <b>{A.name}</b>: <span class="num">{glance.safety[1].score}</span> {glance.safety[1].label}
        </dd>
      </div>
      {#if glance.schengen}
        <div>
          <dt>Schengen Area</dt>
          <dd>
            <b>{S.name}</b>: {glance.schengen[0] ? 'counts toward the 90/180 limit' : 'does not count toward the 90/180 limit'}<br />
            <b>{A.name}</b>: {glance.schengen[1] ? 'counts toward the 90/180 limit' : 'does not count toward the 90/180 limit'}
          </dd>
        </div>
      {/if}
      <div>
        <dt>Solo base month</dt>
        <dd><b>{S.name}</b>: <span class="num">{fmtMoney(S.solo)}</span><br /><b>{A.name}</b>: <span class="num">{fmtMoney(A.solo)}</span><br /><span class="muted small">{glance.savingsPct}% less in {S.name}</span></dd>
      </div>
      <div>
        <dt>Average month, solo</dt>
        <dd><b>{S.name}</b>: <span class="num">{fmtMoney(glance.solo[0])}</span><br /><b>{A.name}</b>: <span class="num">{fmtMoney(glance.solo[1])}</span></dd>
      </div>
      <div>
        <dt>Average month, couple</dt>
        <dd><b>{S.name}</b>: <span class="num">{fmtMoney(glance.couple[0])}</span><br /><b>{A.name}</b>: <span class="num">{fmtMoney(glance.couple[1])}</span></dd>
      </div>
      <div>
        <dt>Good or great months</dt>
        <dd><b>{S.name}</b>: <span class="num">{glance.good[0]}</span> of 12<br /><b>{A.name}</b>: <span class="num">{glance.good[1]}</span> of 12</dd>
      </div>
    </dl>
  </section>

  <section aria-labelledby="why">
    <h2 id="why">Why these numbers</h2>
    <p>
      Score is the Balanced default: weather, safety, air, season and events blended to 0–100, with the same weights for both cities. Cost is one person's month in US dollars.
      Where each number comes from, with source, date and confidence, is listed on the <a href={cityPath(S.key)}>{S.name}</a> and <a href={cityPath(A.key)}>{A.name}</a> pages.
    </p>
  </section>

  <section aria-labelledby="more">
    <h2 id="more">More to read</h2>
    <div class="xlinks">
      <p>Each city, month by month: <a href={cityPath(S.key)}>{S.name}</a> · <a href={cityPath(A.key)}>{A.name}</a>.</p>
      {#if v.sameSubject.length}
        <p>Other comparisons for {S.name}: {#each v.sameSubject as o, i}<a href={o.path}>{o.label}</a>{i < v.sameSubject.length - 1 ? ' · ' : ''}{/each}.</p>
      {/if}
      {#if v.sameAnchor.length}
        <p>Other cities compared with {A.name}: {#each v.sameAnchor as o, i}<a href={o.path}>{o.label}</a>{i < v.sameAnchor.length - 1 ? ' · ' : ''}{/each}.</p>
      {/if}
      {#if v.hubs.length}
        <p>More in {v.regionLabel}: {#each v.hubs as h, i}<a href={h.path}>{h.label}</a>{i < v.hubs.length - 1 ? ' · ' : ''}{/each}.</p>
      {/if}
      <p><a href={COMPARE_INDEX}>All comparisons</a> · <a href={BEST_INDEX}>Where to be, by month and region</a></p>
    </div>
  </section>

  <div class="ctas">
    <a class="btn primary" href={v.appCompare}>Compare them in Monsoon →</a>
    <a class="btn ghost" href={v.appCity}>Open {S.name} in Monsoon</a>
  </div>
</Shell>
