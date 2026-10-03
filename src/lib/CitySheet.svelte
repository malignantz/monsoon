<script>
  import { untrack } from 'svelte';
  import MonthStrip from './MonthStrip.svelte';
  import ScoreInfo from './ScoreInfo.svelte';
  import Sources from './Sources.svelte';
  import { focusTrap, isTopLayer } from './focusTrap.js';
  import { cityShareUrl } from './urlState.js';
  import { stripCells, qolFor, fmtMoney, fmtTemp, fmtMonthRange, swimNow, MONTHS, PRESETS, detailStatus, retryDetail, prefetchDetail, cityCost, partyWord, isFavorite, toggleFavorite, shareUrl, shareOrCopy, settings, sources, dataAsOf } from './data.svelte.js';
  import { monthRows, safetyRows, costRows, cityDataDates, reportUrl, fmtDate, CHIP_LABEL, normConfidence } from './provenance.js';

  // oncompare is only passed where a comparison can be built (over This month,
  // and not when this sheet was opened from the comparison itself).
  let { city, month, preset, onclose, onmonth, onstep, onaddtoyear, onmethod, compared = false, compareFull = false, oncompare = null } = $props();

  let sheetEl = $state(null);

  const faved = $derived(isFavorite(city.key));

  // Share a deep link straight to this city's sheet (?city=key). Native share
  // sheet on mobile, clipboard copy elsewhere with a brief "Copied"
  // confirmation, reset on city change so a stepped-to city starts fresh.
  let copied = $state(false);
  let copyTimer;
  async function shareCity() {
    const result = await shareOrCopy({
      url: cityShareUrl(city.key, month),
      title: `${city.name} on Monsoon`,
      text: `${city.name} on Monsoon`
    });
    if (result !== 'copied') return;
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1800);
  }
  $effect(() => {
    city.key;
    copied = false;
    return () => clearTimeout(copyTimer);
  });

  // Escape, focus in/out, the Tab cycle and the scroll lock come from
  // focusTrap on the dialog below. ←/→ step cities, only while this sheet is
  // the top layer (not under methodology) and not from a form control.
  $effect(() => {
    const onkey = (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || !isTopLayer(sheetEl)) return;
      if (e.target?.closest?.('input, select, textarea')) return;
      onstep?.(e.key === 'ArrowLeft' ? -1 : 1);
    };
    window.addEventListener('keydown', onkey);
    return () => window.removeEventListener('keydown', onkey);
  });

  // The detail layer loads on first intent; a sheet opened straight from a
  // link (or by keyboard before any hover) asks for it here.
  $effect(() => {
    untrack(prefetchDetail);
  });

  // Placeholder for detail-layer cells: an ellipsis while loading, a dash once
  // the load has failed (the safety block below carries the Retry).
  const detailPending = $derived(detailStatus.failed ? '—' : '…');

  const activePreset = $derived(PRESETS[preset] ?? PRESETS.balanced);
  const pw = $derived(activePreset.w);
  const pct = (x) => Math.round(x * 100);
  const monthName = $derived(new Date(2026, month, 1).toLocaleString('en-US', { month: 'long' }));

  const cells = $derived(stripCells(city, preset));
  const m = $derived(city.months[month]);
  const peakPenaltyText = $derived(
    activePreset.peakPenalty && m.season === 'Peak' ? ` This lens subtracts ${activePreset.peakPenalty} points for peak-season crowding.` : ''
  );
  const qol = $derived(qolFor(city, month, preset));
  const saf = $derived(city.safety ?? {});
  const yearEvents = $derived(
    Array.isArray(city.events) ? [...city.events].sort((a, b) => (a.months?.[0] ?? 0) - (b.months?.[0] ?? 0)) : []
  );

  // Cost breakdown for the displayed month + party. Reconstructed from the same
  // core fields the headline uses, so the three lines always sum to cityCost(m):
  // rent carries the month's accommodation seasonality (cost1/cost2 already bake
  // it in), utilities + daily-life are held flat. Couple scales the two shared
  // items by ×1.15 (METHODOLOGY §6b).
  const costBd = $derived.by(() => {
    const total = cityCost(m);
    const isSolo = partyWord() === 'solo';
    const SHARED = 1.15;
    const anchor = isSolo ? city.solo : city.couple;
    const rentBase = (city.rent ?? 0) * (isSolo ? 1 : SHARED);
    const rent = Math.round(total - anchor + rentBase);
    const util = Math.round((city.util ?? 0) * (isSolo ? 1 : SHARED));
    const living = total - rent - util; // exact remainder → three lines sum to total
    return { total, rent, util, living, isSolo };
  });

  // ---- Where the numbers come from (inline source disclosures) ----
  let monthSrcOpen = $state(false);
  let safetySrcOpen = $state(false);
  let costOpen = $state(false);

  const monthSrcRows = $derived(
    monthRows(city, month, {
      sources,
      settings,
      weights: pw,
      presetLabel: activePreset.label,
      peakPenalty: activePreset.peakPenalty && m.season === 'Peak' ? activePreset.peakPenalty : 0,
      detailReady: detailStatus.ready,
      fmtTemp
    })
  );
  const safetySrcRows = $derived(detailStatus.ready ? safetyRows(city) : []);
  const costSrcRows = $derived(detailStatus.ready ? costRows(city) : []);
  const costLowest = $derived(normConfidence(city.costProv?.lowest));

  // What the selected month's Events score counts: the month's scored event
  // (detail layer), or "none" for tier 0.
  const eventDriver = $derived(
    (m.evtTier ?? 0) === 0
      ? 'No notable event scored this month'
      : m.evt
        ? `${m.evt} · tier ${m.evtTier}`
        : `Tier ${m.evtTier} of 3`
  );

  const report = (metric, shown) => reportUrl({ city: city.name, month: monthName, metric, shown });
  const monthReport = $derived(
    report(
      'Weather, air, season or events',
      `Score ${Math.round(qol)} · weather ${Math.round(m.weather)} · air ${Math.round(m.air)} · season ${m.seasonScore} (${m.season}) · events ${Math.round(m.eventScore)}${m.evt ? ` (${m.evt})` : ''}`
    )
  );
  const safetyReport = $derived(
    report(
      'Safety',
      `Safety ${saf.score ?? '—'} · violent ${Math.round(saf.violent?.sub ?? 0)} · property ${Math.round(saf.property?.sub ?? 0)} · visitor ×${saf.tourist?.modifier ?? 1} · women's ${Math.round(saf.womensSafety?.sub ?? 0)}`
    )
  );
  const costReport = $derived(report('Cost', `${fmtMoney(cityCost(m))}/mo ${partyWord()}`));

  const dataDates = $derived(cityDataDates(city, sources, dataAsOf));
  const dataAsOfText = $derived(
    !dataDates.to
      ? ''
      : dataDates.from === dataDates.to
        ? fmtDate(dataDates.to)
        : `${fmtDate(dataDates.from)} – ${fmtDate(dataDates.to)}`
  );

  const comps = $derived([
    { label: 'Weather', v: m.weather },
    { label: 'Air', v: m.air },
    { label: 'Safety', v: saf.score ?? 0 },
    { label: 'Season', v: m.seasonScore },
    { label: 'Events', v: m.eventScore }
  ]);

  function barColor(v) {
    if (v >= 85) return 'var(--band-great)';
    if (v >= 75) return 'var(--band-good)';
    if (v >= 65) return 'var(--band-ok)';
    return 'var(--band-bad)';
  }
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close city sheet" onclick={onclose}></button>
  <div
    class="sheet"
    role="dialog"
    aria-modal="true"
    aria-label="{city.name} city sheet"
    tabindex="-1"
    bind:this={sheetEl}
    use:focusTrap={{ onescape: onclose }}
  >
    <header class="hero">
      <button type="button" class="back" onclick={onclose}>← Monsoon</button>
      <div class="hero-ctl">
        <button
          type="button"
          class="save"
          class:on={faved}
          aria-pressed={faved}
          onclick={() => toggleFavorite(city.key)}
        >{faved ? '♥ Saved' : '♡ Save'}</button>
        <button
          type="button"
          class="save share"
          class:on={copied}
          onclick={shareCity}
          title="Copy a link to {city.name}"
        >
          {#if copied}
            <svg class="shareicon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            Copied
          {:else}
            <svg class="shareicon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" /></svg>
            Share
          {/if}
        </button>
        {#if onaddtoyear}
          <button
            type="button"
            class="save addyear"
            onclick={() => onaddtoyear(city.key, month)}
            title="Add {city.name} to your year, starting {MONTHS[month]}"
          >+ Add to year</button>
        {/if}
        {#if oncompare}
          <button
            type="button"
            class="save compare"
            class:on={compared}
            aria-pressed={compared}
            disabled={compareFull && !compared}
            onclick={() => oncompare(city.key)}
            title={compared ? `Remove ${city.name} from your comparison` : compareFull ? 'Three cities picked — remove one to add another' : `Compare ${city.name} with up to two other cities`}
          >{compared ? '✓ Comparing' : compareFull ? 'Compare full' : 'Compare'}</button>
        {/if}
        {#if onstep}
          <button type="button" class="back step" onclick={() => onstep(-1)} aria-label="Previous city" title="Previous city (←)">‹</button>
          <button type="button" class="back step" onclick={() => onstep(1)} aria-label="Next city" title="Next city (→)">›</button>
        {/if}
        <button type="button" class="back close" onclick={onclose} aria-label="Close">×</button>
      </div>
      <div class="title">
        <p class="kicker">{city.region} · {city.country} · {city.timezone ?? ''}</p>
        <h1 class="hero-title">{city.name}</h1>
        <p class="vibe">{city.vibe}</p>
      </div>
      <div class="snap">
        <div class="snapcell">
          <span class="num v">{Math.round(qol)}</span>
          <span class="k">score · {MONTHS[month]}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{saf.score ?? '—'}</span>
          <span class="k">{saf.label ?? 'safety'}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{fmtMoney(cityCost(m))}</span>
          <span class="k">/mo {partyWord()}
            <button
              type="button"
              class="costdot"
              class:active={costOpen}
              aria-expanded={costOpen}
              aria-controls="src-cost"
              aria-label="Cost breakdown and sources"
              onclick={() => (costOpen = !costOpen)}>i</button>
          </span>
        </div>
        {#if city.swim}
          <div
            class="snapcell swim"
            class:off={!swimNow(city, month)}
            title="{city.swim.name}{city.swim.note ? ` — ${city.swim.note}` : ''}"
          >
            <span class="v"><span class="swim-dot">≋</span> {fmtMonthRange(city.swim.months)}</span>
            <span class="k">{swimNow(city, month) ? `${city.swim.body} · swim now` : `${city.swim.body} · too cold now`}</span>
          </div>
        {/if}
      </div>
      <Sources id="src-cost" toggle={false} bind:open={costOpen} rows={costSrcRows} reportHref={costReport}>
        <p class="srchead">Cost · {MONTHS[month]} · {partyWord()}</p>
        <table class="costbd">
          <tbody>
            <tr><td>Rent · {MONTHS[month]}</td><td>{fmtMoney(costBd.rent)}</td></tr>
            <tr><td>Utilities</td><td>{fmtMoney(costBd.util)}</td></tr>
            <tr><td>Food, transit &amp; daily life</td><td>{fmtMoney(costBd.living)}</td></tr>
            <tr class="tot"><td>Total</td><td>{fmtMoney(costBd.total)}/mo</td></tr>
          </tbody>
        </table>
        <p class="srcp">
          {#if costBd.isSolo}
            Anchored to one solo nomad living mid-range: furnished 1BR in a nomad-popular area,
            some cooking and eating out, a coworking desk.
          {:else}
            Couple scales from the solo budget: rent and utilities ×1.15; groceries, eating out,
            transport and SIM ×1.9; coworking and everything else ×1.6.
          {/if}
          Rent reflects {MONTHS[month]} seasonality; other costs are held flat across the year.
        </p>
        {#if detailStatus.ready && city.costProv}
          <p class="srcp">
            Line items below are for one person in a base month{#if city.costProv.asOf}, as of {fmtDate(city.costProv.asOf)}{/if}{#if costLowest}; lowest item confidence: {CHIP_LABEL[costLowest]}{/if}.
          </p>
        {:else if !detailStatus.ready}
          <p class="srcp">{detailStatus.failed ? "Couldn't load the line items." : 'Loading the line items…'}</p>
        {/if}
      </Sources>
    </header>

    <section class="block">
      <p class="kicker">The year at a glance — click a month</p>
      <MonthStrip {cells} selected={month} size="lg" labels onselect={onmonth} />
      {#if m.riskNote}
        <p class="risknote">⚠ {MONTHS[month]}: {m.riskNote}</p>
      {/if}
    </section>

    <div class="cols">
      <section class="block">
        <h2>{city.name} in {monthName}
          <ScoreInfo title="Score">
            <p>Five 0–100 sub-scores, weighted by your preset ({activePreset.label}):
              weather {pct(pw.weather)}%, safety {pct(pw.safety)}%, air {pct(pw.air)}%,
              season {pct(pw.season)}%, events {pct(pw.events)}%.{peakPenaltyText}</p>
            <p>When safety falls below 55 it also drags the whole score down — a beautiful
              month in a dangerous place can't ride good weather to the top.</p>
            <p class="src">Each input's source, date and confidence: “Where these numbers come from”, below.</p>
          </ScoreInfo>
        </h2>
        <div class="bars">
          {#each comps as c}
            <div class="bar-row">
              <span class="bar-label">{c.label}</span>
              <div class="bar"><div class="fill" style="width:{c.v}%; background:{barColor(c.v)}"></div></div>
              <span class="num bar-num">{Math.round(c.v)}</span>
            </div>
            {#if c.label === 'Events'}
              <p class="evtdriver">{eventDriver}</p>
            {/if}
          {/each}
        </div>
        <table class="climate num">
          <tbody>
            <!-- High/low, humidity and PM2.5 live in the lazy detail layer; rain
                 days and the air category are core, so they never wait on it. -->
            <tr><td>Day / night</td><td>{detailStatus.ready ? `${fmtTemp(m.high)} / ${fmtTemp(m.low)}` : detailPending}</td></tr>
            <tr><td>Humidity</td><td>{detailStatus.ready ? `${m.hum}%` : detailPending}</td></tr>
            <tr><td>Rain days</td><td>{m.rain ?? '—'}</td></tr>
            <tr><td>PM2.5</td><td>{detailStatus.ready ? `${m.pm25} µg/m³ · ${m.airCat}` : m.airCat}</td></tr>
            <tr><td>Season</td><td>{m.season}</td></tr>
          </tbody>
        </table>
        <Sources id="src-month" bind:open={monthSrcOpen} rows={monthSrcRows} reportHref={monthReport} />
      </section>

      <section class="block">
        <h2>Safety, two ways
          <ScoreInfo title="Safety score">
            <p>55% violent + 45% property, then a ×0.60–1.40 visitor lens for whether
              travelers are more insulated or more targeted than locals.</p>
            <p>Violent is anchored on the intentional-homicide rate — here
              {saf.violent?.homicideRate ?? '—'}/100k ({saf.violent?.scope ?? 'country'}) — the only
              crime statistic comparable across countries. Property and the visitor lens are
              editorial estimates; government advisories never cap the score.</p>
            <p class="src">{saf.violent?.source ?? 'World Bank / UNODC'}</p>
          </ScoreInfo>
        </h2>
        {#if detailStatus.failed}
          <p class="loading" role="alert">
            Couldn't load the safety breakdown.
            <button type="button" class="retry" onclick={retryDetail}>Retry</button>
          </p>
        {:else if !detailStatus.ready}
          <p class="loading">Loading the safety breakdown…</p>
        {:else}
        <div class="bars">
          <div class="bar-row">
            <span class="bar-label">Violent</span>
            <div class="bar"><div class="fill" style="width:{saf.violent?.sub ?? 0}%; background:{barColor(saf.violent?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.violent?.sub ?? 0)}</span>
          </div>
          <div class="bar-row">
            <span class="bar-label">Property</span>
            <div class="bar"><div class="fill" style="width:{saf.property?.sub ?? 0}%; background:{barColor(saf.property?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.property?.sub ?? 0)}</span>
          </div>
          <div class="bar-row womens">
            <span class="bar-label">Women's street-safety
              <ScoreInfo title="Women's street-safety estimate">
                <p>Our estimate of street safety for women, <strong>{Math.round(saf.womensSafety?.sub ?? 0)}</strong>
                  on a 0–100 scale. It starts from the country baseline and is then adjusted for this city.</p>
                <p>Baseline {Math.round(saf.womensSafety?.baseline ?? 0)}, derived from the
                  {saf.womensSafety?.cs ?? '—'}% of women in {city.country} who tell Gallup they feel safe
                  walking alone at night{#if saf.womensSafety?.adj}, then a
                  {saf.womensSafety.adj > 0 ? '+' : ''}{saf.womensSafety.adj} city adjustment for local
                  conditions (harassment, within-country variation, tourist-vs-local risk){/if}. The estimate
                  can diverge from the raw Gallup figure where local evidence warrants.</p>
                {#if saf.womensSafety?.adj && saf.womensSafety?.source}<p>City note (editorial): {saf.womensSafety.source}.</p>{/if}
                <p>Displayed alongside, never folded into the headline score — turn on
                  the women's street-safety setting to blend it 50/50 into safety across every view.</p>
                <p class="src"><a href={saf.womensSafety?.url} target="_blank" rel="noopener">
                  Gallup World Poll, via the Georgetown WPS Index</a></p>
              </ScoreInfo>
            </span>
            <div class="bar"><div class="fill" style="width:{saf.womensSafety?.sub ?? 0}%; background:{barColor(saf.womensSafety?.sub ?? 0)}"></div></div>
            <span class="num bar-num">{Math.round(saf.womensSafety?.sub ?? 0)}</span>
          </div>
        </div>
        <p class="lens">
          Local baseline <strong class="num">{Math.round(saf.base ?? 0)}</strong>
          <span class="arrow" class:up={(saf.tourist?.modifier ?? 1) > 1} class:down={(saf.tourist?.modifier ?? 1) < 1}>
            → ×{saf.tourist?.modifier ?? 1} visitor lens →
          </span>
          visitor score <strong class="num">{saf.score ?? '—'}</strong>
        </p>
        {#if saf.tourist?.tags?.length}
          <p class="tags">{#each saf.tourist.tags as t}<span class="tag">{t}</span>{/each}</p>
        {/if}
        <Sources id="src-safety" label="Where the safety numbers come from" bind:open={safetySrcOpen} rows={safetySrcRows} reportHref={safetyReport} />
        {/if}
        {#if city.drawDetail?.narrative}
          <h2 class="mt">The draw</h2>
          <p class="narrative">{city.drawDetail.narrative}</p>
        {:else}
          <h2 class="mt">The draw</h2>
          <p class="narrative">{city.draw}</p>
        {/if}
      </section>
    </div>

    {#if yearEvents.length}
      <section class="block">
        <h2>The calendar worth planning around</h2>
        <ul class="events">
          {#each yearEvents as e}
            <li class:major={e.tier >= 3}>
              <span class="emo num">{e.months.map((x) => MONTHS[x - 1]).join('/')}</span>
              <span class="ename">{e.name}</span>
              {#if e.blurb}<span class="eblurb">{e.blurb}</span>{/if}
              {#if e.tier >= 3}<span class="etier">major</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <footer class="foot">
      <span>Re-verify visa rules &amp; advisories before travel.</span>
      <span class="fresh">
        {dataAsOfText ? `Data as of ${dataAsOfText} · ` : ''}{#if onmethod}<button type="button" class="howlink" onclick={onmethod}>How this is sourced</button>{:else}How this is sourced: see the methodology{/if}
      </span>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(33, 36, 30, 0.45);
    /* Above the My year picker sheet (z 60) so a city opened from a picker row
       sits on top, and closing it returns to the still-open picker. */
    z-index: 70;
    overflow-y: auto;
    padding: 4vh 16px;
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

  .sheet {
    position: relative;
    z-index: 1;
    max-width: 880px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 26px 30px 18px;
    outline: none;
  }

  .hero-ctl {
    position: absolute;
    top: 18px;
    right: 20px;
    display: flex;
    gap: 6px;
  }

  .hero-ctl .back { margin-bottom: 0; }

  .step {
    padding: 3px 12px;
    font-size: 16px;
    line-height: 1.3;
  }

  .close {
    padding: 3px 11px;
    font-size: 17px;
    line-height: 1.3;
  }

  .back {
    background: none;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 14px;
    font-size: 13px;
    color: var(--ink-2);
    margin-bottom: 18px;
  }

  .back:hover { border-color: var(--ink-2); color: var(--ink); }

  .save {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 5px 15px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-2);
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .save:hover { border-color: var(--terra); color: var(--terra-deep); }

  .save:disabled,
  .save:disabled:hover {
    border-color: var(--line);
    color: var(--ink-3);
    cursor: default;
  }

  /* Icon + label sit on one baseline; the icon is the standard share glyph
     (tray + up arrow), swapping to a check on copy. */
  .save.share {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .shareicon { flex: none; }

  .save.on {
    color: var(--terra-deep);
    border-color: var(--terra);
    background: var(--terra-soft, #f6e3d8);
  }

  /* The new browse→plan action leads the cluster: filled ink so it reads as the
     primary thing to do with a city you like. */
  .save.addyear {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--paper);
  }

  .save.addyear:hover {
    background: var(--terra);
    border-color: var(--terra);
    color: var(--paper);
  }

  h1 { font-size: clamp(30px, 6vw, 44px); font-weight: 600; }

  /* Shared element for the card → sheet view transition. The matching card
     title carries the same name only during the morph (see CityCard). */
  .hero-title { view-transition-name: city-hero; }

  .vibe {
    font-family: var(--display);
    font-style: italic;
    color: var(--ink-2);
    margin: 6px 0 0;
    font-size: 16px;
  }

  .snap {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 18px;
  }

  .snapcell {
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 8px 14px;
    display: flex;
    flex-direction: column;
    min-width: 90px;
  }

  .snapcell.swim { border-color: var(--teal); color: var(--teal); }
  .snapcell.swim .k { color: var(--teal); }

  .snapcell.swim.off { border-color: var(--line); color: var(--ink-3); }
  .snapcell.swim.off .k { color: var(--ink-3); }
  .swim-dot { font-weight: 700; }
  .snapcell.swim .swim-dot { color: var(--teal); }
  .snapcell.swim.off .swim-dot { color: var(--ink-3); }
  .v { font-size: 19px; font-weight: 600; }
  .k { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }

  .block { margin-top: 26px; }

  h2 {
    font-size: 21px;
    font-weight: 580;
    margin-bottom: 12px;
  }

  .mt { margin-top: 24px; }

  .risknote { color: var(--terra-deep); font-size: 13.5px; margin: 10px 0 0; }

  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 34px;
  }

  @media (max-width: 720px) {
    .cols { grid-template-columns: 1fr; }
  }

  .bars { display: flex; flex-direction: column; gap: 7px; }

  .bar-row {
    display: grid;
    grid-template-columns: 104px 1fr 34px;
    align-items: center;
    gap: 10px;
  }

  .bar-label { font-size: 12.5px; color: var(--ink-2); }
  .womens .bar-label { font-style: italic; }

  .bar {
    height: 9px;
    background: var(--paper-2);
    border-radius: 5px;
    overflow: hidden;
  }

  .fill { height: 100%; border-radius: 5px; }
  .bar-num { font-size: 12px; text-align: right; }

  .lens { font-size: 13.5px; color: var(--ink-2); margin: 14px 0 0; }
  .arrow { color: var(--ink-3); }
  .arrow.up { color: var(--teal); }
  .arrow.down { color: var(--terra-deep); }

  .tags { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 0; }

  .tag {
    font-size: 11px;
    background: var(--paper-2);
    border-radius: 999px;
    padding: 2px 9px;
    color: var(--ink-2);
  }

  .narrative { font-size: 14.5px; color: var(--ink-2); margin: 0; }

  .loading {
    font-size: 13px;
    font-style: italic;
    color: var(--ink-3);
    margin: 0;
  }

  .retry {
    margin-left: 6px;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 3px 12px;
    font-family: var(--sans);
    font-size: 12.5px;
    font-style: normal;
    font-weight: 600;
    color: var(--ink-2);
  }

  .retry:hover { border-color: var(--ink-2); color: var(--ink); }

  @media (max-width: 600px) {
    .retry { min-height: var(--tap); padding: 0 16px; }
  }

  .climate {
    margin-top: 16px;
    width: 100%;
    border-collapse: collapse;
    font-size: 13.5px;
  }

  .climate td {
    padding: 6px 0;
    border-top: 1px solid var(--line-soft);
  }

  .climate td:first-child { color: var(--ink-3); font-family: var(--sans); }
  .climate td:last-child { text-align: right; }

  /* Cost-breakdown table inside the cost-estimate popover */
  .costbd { width: 100%; border-collapse: collapse; margin: 1px 0 9px; }
  .costbd td { padding: 4px 0; border-top: 1px solid var(--line-soft); }
  .costbd tr:first-child td { border-top: none; }
  .costbd td:first-child { color: var(--ink-2); }
  .costbd td:last-child { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; padding-left: 14px; }
  .costbd .tot td { border-top: 1px solid var(--line); font-weight: 600; color: var(--ink); padding-top: 5px; }

  .events { list-style: none; margin: 0; padding: 0; }

  .events li {
    display: grid;
    grid-template-columns: 70px 200px 1fr auto;
    gap: 12px;
    align-items: baseline;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
    font-size: 13.5px;
  }

  .emo { color: var(--ink-3); font-size: 12px; }
  .ename { font-weight: 600; }
  /* Fixed columns so an entry without a blurb keeps its badge at the right edge. */
  .eblurb { color: var(--ink-2); grid-column: 3; }

  .etier {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--terra);
    border: 1px solid var(--terra);
    border-radius: 999px;
    padding: 1px 8px;
    grid-column: 4;
    justify-self: end;
  }

  li.major .ename { color: var(--terra-deep); }

  .foot {
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 20px;
    font-size: 12px;
    color: var(--ink-3);
  }

  .howlink {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--ink-2);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }

  .howlink:hover { color: var(--ink); }

  @media (max-width: 600px) {
    .howlink { min-height: 32px; }
  }

  /* What produces the selected month's Events score, right under that bar
     (indented past the 104px label column + 10px gap). */
  .evtdriver {
    margin: -3px 0 0 114px;
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.35;
  }

  /* Cost (i): same glyph as ScoreInfo's dot, but it opens the inline cost
     panel under the headline numbers instead of a floating popover. */
  .costdot {
    position: relative;
    width: 15px;
    height: 15px;
    margin-left: 2px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: none;
    color: var(--ink-3);
    font-family: var(--display);
    font-style: italic;
    font-size: 10px;
    line-height: 1;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    vertical-align: 1px;
    text-transform: none;
    letter-spacing: 0;
  }

  .costdot:hover,
  .costdot.active { border-color: var(--ink-2); color: var(--ink); }

  @media (max-width: 700px) {
    .costdot::after { content: ''; position: absolute; inset: -11px; }
  }

  .srchead {
    margin: 8px 0 4px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .srcp { margin: 0 0 8px; font-size: 12px; color: var(--ink-2); }

  /* ───────── Mobile: the sheet becomes a true bottom sheet ─────────
     Anchored to the bottom edge, full width, scrolling internally and clearing
     the home indicator. The header action cluster un-anchors into a wrapping
     row with comfortable targets, and the dense event grid stacks to two lines
     so blurbs and the "major" badge stop spilling past the right edge. */
  @media (max-width: 600px) {
    .scrim {
      padding: 0;
      display: flex;
      align-items: flex-end;
      overflow: hidden;
    }

    .sheet {
      width: 100%;
      max-width: 100%;
      margin: 0;
      border-radius: 18px 18px 0 0;
      max-height: var(--sheet-max-h);
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      padding: 16px var(--pad-x) calc(20px + var(--safe-b));
    }

    /* A grab handle so the bottom-sheet affordance reads at a glance. */
    .sheet::before {
      content: '';
      position: sticky;
      top: 0;
      display: block;
      width: 40px;
      height: 4px;
      margin: -4px auto 10px;
      border-radius: 999px;
      background: var(--line);
    }

    .hero-ctl {
      position: static;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin: 6px 0 4px;
    }

    .hero-ctl .save {
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
    }

    .step,
    .close {
      min-width: var(--tap);
      min-height: var(--tap);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0;
    }

    /* Push prev/next/close to the right so save/share lead the row. */
    .step:first-of-type { margin-left: auto; }
  }

  /* With Compare in it, the action cluster is too wide to float beside
     "← Monsoon" on small tablets; it drops to its own right-aligned row. */
  @media (min-width: 601px) and (max-width: 760px) {
    .hero-ctl {
      position: static;
      flex-wrap: wrap;
      justify-content: flex-end;
      margin: -6px 0 14px;
    }
  }

  @media (max-width: 720px) {
    .events li {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 4px 8px;
    }

    .emo { order: 0; }
    .ename { order: 1; }
    .etier { order: 2; margin-left: auto; }
    .eblurb { order: 3; flex-basis: 100%; }
  }
</style>
