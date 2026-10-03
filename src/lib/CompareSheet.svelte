<script>
  import { untrack } from 'svelte';
  import MonthStrip from './MonthStrip.svelte';
  import { stripSummary } from './stripSummary.js';
  import { compareShareUrl } from './urlState.js';
  import { focusTrap, isTopLayer } from './focusTrap.js';
  import { cityByKey, stripCells, qolFor, valueFor, band, cityCost, partyWord, fmtMoney, fmtTemp, swimNow, fmtMonthRange, eventsInMonth, MONTHS, MONTH_LETTERS, PRESETS, normalizePresetKey, prefs, detailStatus, retryDetail, shareOrCopy } from './data.svelte.js';
  import { bestOf, compareFindings } from './compare.js';

  // The comparison: 2–3 cities side by side for one month, over This month.
  // Same dialog pattern as the city sheet (scrim, focus in on open, back out on
  // close, Escape closes, bottom sheet on phones). Every number comes from the
  // shared scoring helpers under the active lens, party and value model.
  //
  // covered: a city sheet is open on top, so it owns Escape and the arrows.
  let { keys, month, preset, valueModel, covered = false, onmonth, onremove, onclose, onopencity, onaddtoyear } = $props();

  let sheetEl = $state(null);

  const list = $derived(keys.map((k) => cityByKey.get(k)).filter(Boolean));
  const n = $derived(list.length);
  const monthLong = $derived(new Date(2026, month, 1).toLocaleString('en-US', { month: 'long' }));
  const lensKey = $derived(normalizePresetKey(preset));
  const party = $derived(partyWord());

  const BAND_WORD = { great: 'great', good: 'good', ok: 'ok', bad: 'avoid' };

  const step = (d) => onmonth((month + d + 12) % 12);

  // Escape, focus, the Tab cycle and the scroll lock: focusTrap on the dialog.
  $effect(() => {
    const onkey = (e) => {
      // A city sheet opened from here sits on top and handles its own keys.
      if (covered || e.defaultPrevented || !isTopLayer(sheetEl)) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      // Arrows step the month only from the dialog itself or the month row, so
      // they never hijack horizontal scrolling of the grid or a focused control.
      const t = e.target;
      if (t !== sheetEl && !t?.closest?.('.months, .mstep')) return;
      e.preventDefault();
      step(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onkey);
    // The detail layer loads on first intent; a comparison may be the first
    // (and opening one retries after an earlier failed prefetch).
    untrack(retryDetail);
    return () => window.removeEventListener('keydown', onkey);
  });

  // ---- Share (?compare=a,b&m=mon) ----
  let copied = $state(false);
  let copyTimer;
  async function share() {
    const result = await shareOrCopy({
      url: compareShareUrl(keys, month),
      title: `${list.map((c) => c.name).join(' vs ')} on Monsoon`,
      text: `${list.map((c) => c.name).join(' vs ')} in ${monthLong}, on Monsoon`
    });
    if (result !== 'copied') return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1800);
  }
  $effect(() => () => clearTimeout(copyTimer));

  function remove(key) {
    onremove(key);
    // The removed column took its button with it; keep focus in the dialog.
    sheetEl?.focus();
  }

  // ---- Per-city facts for the month ----
  const cols = $derived(
    list.map((c) => {
      const m = c.months[month];
      const cells = stripCells(c, preset);
      const q = qolFor(c, month, preset);
      return {
        c,
        m,
        cells,
        summary: stripSummary(cells),
        q: Math.round(q),
        band: band(q),
        v: valueFor(c, month, preset, valueModel),
        cost: Math.round(cityCost(m)),
        saf: c.safety ?? {},
        event: eventsInMonth(c, month)[0] ?? null
      };
    })
  );

  const findings = $derived(compareFindings(list, month, preset, valueModel));

  // Detail-layer cells: an ellipsis while loading, a dash once it has failed
  // (the banner at the top carries the Retry), exactly as the city sheet does.
  const ready = $derived(detailStatus.ready);
  const pending = $derived(detailStatus.failed ? '—' : '…');
  const detailNote = $derived(ready ? '' : detailStatus.failed ? 'not loaded' : 'loading…');

  const round = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

  // Rows, grouped. kind: score | bar | num | text | event. `vals` are the
  // comparable numbers (as displayed) that pick the row's best; `best` says
  // which direction wins. Rows without a clear "better" (temperature,
  // humidity, season phase) never highlight.
  const groups = $derived.by(() => {
    const g = [
      {
        id: 'headline',
        rows: [
          { label: 'Score', kind: 'score', vals: cols.map((x) => x.q), best: 'high' },
          {
            label: 'Best Value',
            sub: valueModel === 'classic' ? 'classic index' : 'Score for the money',
            kind: 'num',
            vals: cols.map((x) => Number(x.v.toFixed(1))),
            texts: cols.map((x) => x.v.toFixed(1)),
            best: 'high'
          }
        ]
      },
      {
        id: 'sub',
        title: 'Sub-scores',
        rows: [
          { label: 'Weather', kind: 'bar', vals: cols.map((x) => round(x.m.weather)), best: 'high' },
          { label: 'Air', kind: 'bar', vals: cols.map((x) => round(x.m.air)), best: 'high' },
          { label: 'Safety', kind: 'bar', vals: cols.map((x) => round(x.saf.score)), best: 'high' },
          { label: 'Season', kind: 'bar', vals: cols.map((x) => round(x.m.seasonScore)), best: 'high' },
          { label: 'Events', kind: 'bar', vals: cols.map((x) => round(x.m.eventScore)), best: 'high' }
        ]
      },
      {
        id: 'conditions',
        title: `Conditions in ${MONTHS[month]}`,
        note: detailNote,
        rows: [
          { label: 'Day / night', kind: 'text', texts: cols.map((x) => (ready ? `${fmtTemp(x.m.high)} / ${fmtTemp(x.m.low)}` : pending)) },
          { label: 'Humidity', kind: 'text', texts: cols.map((x) => (ready && x.m.hum != null ? `${x.m.hum}%` : ready ? '—' : pending)) },
          { label: 'Rain days', kind: 'num', vals: cols.map((x) => x.m.rain ?? null), texts: cols.map((x) => (x.m.rain ?? '—') + ''), best: 'low' },
          {
            label: 'PM2.5',
            kind: 'num',
            vals: cols.map((x) => (ready ? (x.m.pm25 ?? null) : null)),
            texts: cols.map((x) => (ready && x.m.pm25 != null ? `${x.m.pm25} µg/m³` : ready ? '—' : pending)),
            subs: cols.map((x) => x.m.airCat ?? ''),
            best: 'low'
          },
          { label: 'Season', kind: 'text', texts: cols.map((x) => (x.m.season ? `${x.m.season === 'In' ? 'In season' : `${x.m.season} season`}` : '—')) }
        ]
      },
      {
        id: 'safety',
        title: 'Safety',
        note: detailNote,
        rows: [
          { label: 'Violent', kind: 'num', vals: cols.map((x) => (ready ? round(x.saf.violent?.sub) : null)), texts: cols.map((x) => (ready ? (round(x.saf.violent?.sub) ?? '—') + '' : pending)), best: 'high' },
          { label: 'Property', kind: 'num', vals: cols.map((x) => (ready ? round(x.saf.property?.sub) : null)), texts: cols.map((x) => (ready ? (round(x.saf.property?.sub) ?? '—') + '' : pending)), best: 'high' },
          {
            label: 'Women’s street-safety',
            sub: prefs.womensSafety ? 'blended into Safety' : '',
            kind: 'num',
            vals: cols.map((x) => round(x.saf.womensSafety?.sub)),
            texts: cols.map((x) => (round(x.saf.womensSafety?.sub) ?? '—') + ''),
            best: 'high'
          },
          { label: 'Overall', kind: 'text', texts: cols.map((x) => x.saf.label ?? '—') }
        ]
      },
      {
        id: 'cost',
        title: 'Cost',
        rows: [
          {
            label: `Per month, ${party}`,
            sub: `rent at ${MONTHS[month]} rates`,
            kind: 'num',
            vals: cols.map((x) => x.cost),
            texts: cols.map((x) => `${fmtMoney(x.cost)}/mo`),
            best: 'low'
          }
        ]
      },
      {
        id: 'flags',
        title: 'Visa & water',
        rows: [
          { label: 'Schengen', kind: 'text', texts: cols.map((x) => (x.c.schengen ? '◆ Counts toward 90/180' : 'Outside Schengen')), schengen: cols.map((x) => !!x.c.schengen) },
          {
            label: 'Swim',
            kind: 'text',
            texts: cols.map((x) =>
              !x.c.swim ? 'No swimming listed' : swimNow(x.c, month) ? `≋ Swim now · ${x.c.swim.body}` : `Too cold now · ${fmtMonthRange(x.c.swim.months)}`
            )
          }
        ]
      },
      {
        id: 'event',
        title: `${monthLong}’s event`,
        rows: [{ label: 'Worth planning around', kind: 'event' }]
      }
    ];
    // Hazard seasons only earn a row when one of the cities has one this month.
    if (cols.some((x) => x.m.risk >= 1)) {
      g[5].rows.push({
        label: 'Hazard',
        kind: 'text',
        texts: cols.map((x) => (x.m.risk >= 1 ? `⚠ ${x.m.riskNote || (x.m.risk === 2 ? 'Severe hazard season' : 'Elevated hazard season')}` : 'None flagged'))
      });
    }
    for (const grp of g) for (const r of grp.rows) r.bests = r.best ? bestOf(r.vals, r.best) : new Set();
    return g;
  });

  const anyBest = $derived(groups.some((grp) => grp.rows.some((r) => r.bests.size)));

  function barColor(v) {
    if (v >= 85) return 'var(--band-great)';
    if (v >= 75) return 'var(--band-good)';
    if (v >= 65) return 'var(--band-ok)';
    return 'var(--band-bad)';
  }
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close comparison" tabindex="-1" onclick={onclose}></button>
  <div
    class="sheet"
    class:three={n > 2}
    role="dialog"
    aria-modal="true"
    aria-labelledby="cmp-title"
    aria-describedby="cmp-sub"
    tabindex="-1"
    bind:this={sheetEl}
    use:focusTrap={{ onescape: onclose }}
  >
    <header class="head">
      <div class="htitle">
        <div class="hrow">
          <h2 id="cmp-title">{list.map((c) => c.name).join(' · ')} <span class="hfor">in</span> <span class="hm">{monthLong}</span></h2>
          <span class="mstep">
            <button type="button" class="mstep-b" onclick={() => step(-1)} aria-label="Previous month" title="Previous month (←)">‹</button>
            <button type="button" class="mstep-b" onclick={() => step(1)} aria-label="Next month" title="Next month (→)">›</button>
          </span>
        </div>
        <p class="sub" id="cmp-sub">
          {PRESETS[lensKey].label} lens{prefs.womensSafety ? ' · women’s safety blended' : ''} · costs {party === 'solo' ? 'solo' : 'for a couple'}{valueModel === 'classic' ? ' · classic Best Value' : ''}
        </p>
      </div>
      <div class="hctl">
        <button type="button" class="pill" class:on={copied} onclick={share} title="Copy a link to this comparison">
          {#if copied}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            Copied
          {:else}
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            Share
          {/if}
        </button>
        <button type="button" class="pill close" onclick={onclose} aria-label="Close comparison">×</button>
      </div>
    </header>

    <div class="body">
      <div class="track">
        <div class="lead">
          {#if detailStatus.failed}
            <p class="loadnote" role="alert">
              Couldn’t load temperatures, PM2.5 and the safety breakdown.
              <button type="button" class="retry" onclick={retryDetail}>Retry</button>
            </p>
          {/if}

          {#if findings.length}
            <ul class="finds">
              {#each findings as f}<li>{f}</li>{/each}
            </ul>
          {/if}

          <section class="yr" aria-label="The year, month by month">
            <div class="yr-row yr-head">
              <span class="yr-lab" aria-hidden="true"></span>
              <div class="months" role="group" aria-label="Month to compare">
                {#each MONTH_LETTERS as l, i}
                  <button
                    type="button"
                    class="mb"
                    class:on={i === month}
                    aria-pressed={i === month}
                    aria-label={MONTHS[i]}
                    title={MONTHS[i]}
                    onclick={() => onmonth(i)}
                  >{l}</button>
                {/each}
              </div>
            </div>
            {#each cols as x (x.c.key)}
              <div class="yr-row">
                <span class="yr-lab">{x.c.name}</span>
                <div class="yr-strip">
                  <MonthStrip cells={x.cells} selected={month} size="lg" />
                  <span class="sr-only">{x.c.name}: {x.summary}</span>
                </div>
              </div>
            {/each}
          </section>

          {#if anyBest}
            <p class="key">Bold, lightly shaded: the best in that row.</p>
          {/if}
        </div>

        <table class="grid">
          <caption class="sr-only">{list.map((c) => c.name).join(', ')} compared for {monthLong}</caption>
          <thead>
            <tr>
              <th class="corner" scope="col"><span class="corner-m">{MONTHS[month]}</span></th>
              {#each cols as x (x.c.key)}
                <th scope="col" class="ch">
                  <div class="ch-in">
                    <button type="button" class="cname" onclick={() => onopencity(x.c.key)} title="Open the {x.c.name} sheet">{x.c.name}</button>
                    <span class="ccountry">{x.c.country}</span>
                    {#if n > 2}
                      <button type="button" class="crm" onclick={() => remove(x.c.key)} aria-label="Remove {x.c.name} from comparison" title="Remove">×</button>
                    {/if}
                  </div>
                </th>
              {/each}
            </tr>
          </thead>

          {#each groups as grp (grp.id)}
            <tbody class="g-{grp.id}">
              {#if grp.title}
                <tr class="grp">
                  <th scope="colgroup" colspan={n + 1}>
                    <span class="grp-t">{grp.title}{#if grp.note}<span class="grp-note"> · {grp.note}</span>{/if}</span>
                  </th>
                </tr>
              {/if}
              {#each grp.rows as r}
                <tr class="k-{r.kind}">
                  <th scope="row" class="rl">
                    {r.label}
                    {#if r.sub}<span class="rl-sub">{r.sub}</span>{/if}
                  </th>
                  {#each cols as x, i (x.c.key)}
                    {@const best = r.bests.has(i)}
                    <td class:best>
                      {#if r.kind === 'score'}
                        <span class="sc band-{x.band}"><span class="num">{x.q}</span></span>
                        <span class="bw">{BAND_WORD[x.band]}</span>
                      {:else if r.kind === 'bar'}
                        {@const v = r.vals[i]}
                        <span class="barcell">
                          <span class="bar" aria-hidden="true"><span class="fill" style="width:{v ?? 0}%; background:{barColor(v ?? 0)}"></span></span>
                          <span class="num v">{v ?? '—'}</span>
                        </span>
                      {:else if r.kind === 'num'}
                        <span class="num v">{r.texts[i]}</span>
                        {#if r.subs?.[i]}<span class="vsub">{r.subs[i]}</span>{/if}
                      {:else if r.kind === 'event'}
                        {#if x.event}
                          <span class="ev" class:major={x.event.tier >= 3}>{x.event.name}</span>
                          {#if x.event.tier >= 3}<span class="etier">major</span>{/if}
                        {:else}
                          <span class="none">No major event</span>
                        {/if}
                      {:else}
                        <span class="t" class:sch={r.schengen?.[i]}>{r.texts[i]}</span>
                      {/if}
                      {#if best}<span class="sr-only"> (best)</span>{/if}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          {/each}

          <tfoot>
            <tr>
              <th scope="row" class="rl">Next</th>
              {#each cols as x (x.c.key)}
                <td>
                  <div class="acts">
                    <button type="button" class="act" onclick={() => onopencity(x.c.key)}>City sheet <span aria-hidden="true">→</span><span class="sr-only"> for {x.c.name}</span></button>
                    <button type="button" class="act add" onclick={() => onaddtoyear(x.c.key, month)} title="Add {x.c.name} to your year, starting {MONTHS[month]}">+ Add to year<span class="sr-only"> ({x.c.name})</span></button>
                  </div>
                </td>
              {/each}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  </div>
</div>

<style>
  /* Sits under the city sheet (z 70) so a city opened from here stacks on top
     and closing it lands back on the comparison; above the plain overlays. */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: calc(var(--z-sheet) - 5);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4vh 16px;
    background: var(--scrim);
  }

  .scrim-back {
    position: fixed;
    inset: 0;
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
  }

  /* One column of chrome (the header) and one scroller (the body). The body is
     the only scroll container in both axes, so the city names can stick to its
     top and the row labels to its left at the same time. */
  .sheet {
    --sx: 26px;
    --lab: 168px;
    --colmin: 150px;
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 820px;
    max-height: 92vh;
    background: var(--paper);
    border: 1px solid var(--line);
    border-radius: 18px;
    outline: none;
    overflow: hidden;
  }

  .sheet.three { max-width: 1000px; }

  .head {
    flex: none;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 20px var(--sx) 14px;
    border-bottom: 1px solid var(--line);
  }

  .htitle { min-width: 0; }

  .hrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
  }

  h2 {
    font-size: 22px;
    font-weight: 580;
    letter-spacing: -0.01em;
    text-wrap: balance;
  }

  .hfor {
    font-style: italic;
    font-weight: 400;
    color: var(--ink-2);
  }

  .hm { color: var(--terra-deep); }

  .mstep {
    display: inline-flex;
    gap: 4px;
  }

  .mstep-b {
    align-self: center;
    width: 26px;
    height: 26px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink-2);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1;
    padding: 0;
  }

  .mstep-b:hover { border-color: var(--ink-2); color: var(--ink); }

  .sub {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--ink-3);
  }

  .hctl {
    flex: none;
    display: flex;
    gap: 6px;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 13px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .pill:hover { border-color: var(--ink-2); color: var(--ink); }

  .pill.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft);
  }

  .pill.close {
    width: 30px;
    padding: 0;
    justify-content: center;
    font-size: 17px;
    font-weight: 400;
  }

  .body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    container-type: inline-size;
  }

  /* Shrink-wraps the grid: as wide as the body until three columns stop
     fitting, then as wide as the grid, so the grid scrolls sideways. */
  .track {
    width: fit-content;
    min-width: 100%;
    padding-bottom: 18px;
  }

  /* The prose and the year strips stay put while the grid scrolls sideways:
     exactly one body-width wide, pinned to the left edge. */
  .lead {
    position: sticky;
    left: 0;
    width: 100%;
    width: 100cqi;
    padding: 16px var(--sx) 6px;
  }

  .loadnote {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--ink-2);
  }

  .retry {
    margin-left: 6px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 3px 12px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-2);
  }

  .retry:hover { border-color: var(--ink-2); color: var(--ink); }

  .finds {
    margin: 0 0 16px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 3px;
    max-width: 70ch;
  }

  .finds li {
    position: relative;
    padding-left: 15px;
    font-size: 14px;
    line-height: 1.45;
    color: var(--ink);
    text-wrap: pretty;
  }

  .finds li::before {
    content: '';
    position: absolute;
    left: 2px;
    top: 0.62em;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--terra);
  }

  /* ---- The year: one strip per city, months stacked in register ---- */
  .yr {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .yr-row {
    display: grid;
    grid-template-columns: var(--lab) 1fr;
    align-items: center;
    gap: 10px;
  }

  .yr-lab {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Month picker in the same 12-column register as the strips beneath it, so
     each letter sits directly over its month. */
  .months {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
  }

  .mb {
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: none;
    font-size: 11px;
    font-weight: 600;
    color: var(--ink-3);
    transition: color 0.15s ease, border-color 0.15s ease;
  }

  .mb:hover { color: var(--ink); border-color: var(--line); }

  .mb.on {
    background: var(--terra);
    border-color: var(--terra);
    color: var(--on-terra);
  }

  /* The sheet's large strip, flattened for three-up reading. Scoped here so the
     shared component is untouched. */
  .yr-strip :global(.strip.lg .cell) {
    height: 30px;
    border-radius: 4px;
  }

  .yr-strip :global(.strip.lg .q) { font-size: 11.5px; }

  .yr-strip :global(.strip.lg .fest) {
    top: 2px;
    right: 3px;
    bottom: auto;
    font-size: 7px;
  }

  .key {
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--ink-3);
  }

  /* ---- The grid ---- */
  .grid {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 13.5px;
    margin-top: 6px;
  }

  .grid th,
  .grid td {
    padding: 9px 12px;
    border-top: 1px solid var(--line-soft);
    text-align: left;
    vertical-align: top;
  }

  .grid td:last-child,
  .grid thead th:last-child { padding-right: var(--sx); }

  /* Row labels: the sticky left column. */
  .rl,
  .corner {
    position: sticky;
    left: 0;
    z-index: 1;
    width: var(--lab);
    min-width: var(--lab);
    padding-left: var(--sx) !important;
    background: var(--paper);
    font-weight: 500;
    font-size: 12.5px;
    color: var(--ink-2);
  }

  .rl-sub {
    display: block;
    font-size: 11px;
    font-weight: 400;
    color: var(--ink-3);
    line-height: 1.3;
  }

  /* City names: the sticky top row. */
  thead th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: var(--paper);
    border-top: none;
    border-bottom: 1px solid var(--line);
    padding-top: 12px;
    padding-bottom: 10px;
  }

  thead .corner { z-index: 3; vertical-align: bottom; }

  .corner-m {
    font-family: var(--mono);
    font-size: 11.5px;
    font-weight: 600;
    color: var(--terra-deep);
  }

  .ch-in {
    position: relative;
    min-width: var(--colmin);
    padding-right: 26px;
  }

  .cname {
    display: block;
    padding: 0;
    border: none;
    background: none;
    font-family: var(--display);
    font-size: 19px;
    font-weight: 580;
    line-height: 1.15;
    color: var(--ink);
    text-align: left;
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-decoration-thickness: 1px;
    text-underline-offset: 4px;
    transition: text-decoration-color 0.15s ease, color 0.15s ease;
  }

  .cname:hover {
    color: var(--terra-deep);
    text-decoration-color: var(--terra);
  }

  .ccountry {
    display: block;
    margin-top: 2px;
    font-size: 12px;
    font-weight: 400;
    color: var(--ink-3);
  }

  .crm {
    position: absolute;
    top: -2px;
    right: -4px;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 999px;
    background: none;
    color: var(--ink-3);
    font-size: 16px;
    line-height: 1;
  }

  .crm:hover { color: var(--terra-deep); border-color: var(--line); }

  /* Group headings span the grid; the text stays pinned left while it scrolls. */
  .grp th {
    padding-left: var(--sx);
    padding-top: 18px;
    padding-bottom: 6px;
    border-top: none;
  }

  .grp-t {
    position: sticky;
    left: var(--sx);
    font-family: var(--display);
    font-size: 15px;
    font-weight: 580;
    color: var(--ink);
  }

  .grp-note {
    font-family: var(--sans);
    font-size: 12px;
    font-weight: 400;
    font-style: italic;
    color: var(--ink-3);
  }

  .g-headline tr:first-child > * { border-top: none; }

  /* Best in row: weight + a faint shade of the "great" green, and the word
     "best" for screen readers — never colour alone. */
  td.best { background: rgb(var(--teal-rgb) / 0.075); }
  td.best .v,
  td.best .num,
  td.best .t { font-weight: 700; color: var(--ink); }

  .v { color: var(--ink); }

  .vsub {
    display: block;
    font-size: 11px;
    color: var(--ink-3);
  }

  .sc {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 3px 8px;
    border-radius: 8px;
    font-size: 19px;
    font-weight: 600;
    line-height: 1.1;
  }

  .sc.band-great { background: var(--band-great); color: var(--band-great-ink); }
  .sc.band-good { background: var(--band-good); color: var(--band-good-ink); }
  .sc.band-ok { background: var(--band-ok); color: var(--band-ok-ink); }
  .sc.band-bad { background: var(--band-bad); color: var(--band-bad-ink); }

  td.best .sc .num { color: inherit; }

  .bw {
    margin-left: 6px;
    font-size: 11.5px;
    color: var(--ink-3);
  }

  .barcell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .bar {
    flex: 1 1 auto;
    min-width: 28px;
    max-width: 160px;
    height: 8px;
    background: var(--paper-3);
    border-radius: 5px;
    overflow: hidden;
  }

  .fill {
    display: block;
    height: 100%;
    border-radius: 5px;
  }

  .barcell .v {
    flex: none;
    width: 3ch;
    font-size: 12.5px;
    text-align: right;
  }

  .t { color: var(--ink-2); }
  .t.sch { color: var(--schengen); }

  .ev { font-weight: 600; color: var(--ink); }
  .ev.major { color: var(--terra-deep); }

  .etier {
    display: inline-block;
    margin-left: 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--terra);
    border: 1px solid var(--terra);
    border-radius: 999px;
    padding: 0 7px;
    vertical-align: 1px;
  }

  .none { color: var(--ink-3); font-style: italic; }

  tfoot th,
  tfoot td {
    border-top: 1px solid var(--line);
    padding-top: 14px;
  }

  .acts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .act {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-2);
    white-space: nowrap;
  }

  .act:hover { border-color: var(--ink-2); color: var(--ink); }

  .act.add {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .act.add:hover { background: var(--terra); border-color: var(--terra); }

  /* ───────── Phones: a bottom sheet, like the city sheet ─────────
     Two cities fit side by side at 375 (and 320); a third column scrolls
     sideways under the pinned row labels. */
  @media (max-width: 600px) {
    .scrim {
      align-items: flex-end;
      padding: 0;
    }

    .sheet {
      --sx: var(--pad-x);
      --lab: 88px;
      --colmin: 92px;
      max-width: 100%;
      max-height: var(--sheet-max-h);
      border-radius: 18px 18px 0 0;
      border-bottom: none;
    }

    .sheet.three { max-width: 100%; }

    /* Grab handle, as on the city sheet. */
    .head::before {
      content: '';
      position: absolute;
      top: 7px;
      left: 50%;
      width: 40px;
      height: 4px;
      margin-left: -20px;
      border-radius: 999px;
      background: var(--line);
    }

    .head {
      position: relative;
      padding-top: 20px;
      padding-bottom: 10px;
    }

    h2 { font-size: 19px; }

    .mstep-b {
      width: 36px;
      height: 36px;
      font-size: 17px;
    }

    .pill { height: var(--tap); }
    .pill.close { width: var(--tap); }

    /* Share collapses to its icon so the title keeps the row. */
    .hctl .pill:not(.close) {
      width: var(--tap);
      padding: 0;
      justify-content: center;
      font-size: 0;
      gap: 0;
    }

    .track { padding-bottom: calc(20px + var(--safe-b)); }

    .finds li { font-size: 13.5px; }

    /* Names over strips, so each strip gets the full width. */
    .yr { gap: 4px; }
    .yr-row { grid-template-columns: 1fr; gap: 3px; }
    .yr-head .yr-lab { display: none; }
    .yr-lab { font-size: 12px; margin-top: 4px; }
    .mb { height: 36px; }
    .yr-strip :global(.strip.lg .cell) { height: 26px; }
    .yr-strip :global(.strip.lg .q) { font-size: 11px; }

    .grid { font-size: 13px; }

    .grid th,
    .grid td { padding: 8px 6px; }

    .grp th { padding-left: var(--sx); }

    .rl,
    .corner { font-size: 12px; padding-right: 8px; }

    .ch-in { padding-right: 0; }

    .cname { font-size: 16px; }

    .crm {
      position: static;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: auto;
      height: 32px;
      margin: 2px 0 -4px -2px;
      padding: 0 4px;
      font-size: 12px;
    }

    .crm::after { content: ' remove'; margin-left: 3px; }

    .sc { min-width: 38px; font-size: 17px; }
    .bw { display: block; margin: 2px 0 0; }

    .barcell { gap: 6px; }
    .barcell .v { font-size: 12px; }

    .acts { flex-direction: column; align-items: flex-start; }

    .act {
      height: auto;
      min-height: 40px;
      padding: 4px 11px;
      white-space: normal;
      text-align: left;
    }

    .retry { min-height: var(--tap); padding: 0 16px; }
  }

  @media (max-width: 360px) {
    .sheet { --lab: 78px; --colmin: 88px; }
    .finds li { font-size: 13px; }
  }
</style>
