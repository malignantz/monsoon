<script>
  // A read-only companion to Settings.svelte — same scrim/card shell and visual
  // language, but a scrollable sources-and-methods write-up instead of controls.
  // Opened from the footer's "methodology" link and from the city sheet footer
  // ("How this is sourced"), so it stacks above the sheet.
  import { sources, dataAsOf, cities, detailStatus } from './data.svelte.js';
  import { provFor, fmtDate, fmtWindow, FEEDBACK_REPO } from './provenance.js';
  import { METHOD_VERSION, CHANGELOG, LAST_UPDATED } from './changelog.js';

  let { onclose } = $props();

  let cardEl = $state(null);

  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  // The headline Score weights (Balanced preset · METHODOLOGY §6).
  const WEIGHTS = [
    { label: 'Weather', pct: 35 },
    { label: 'Safety', pct: 24 },
    { label: 'Air', pct: 18 },
    { label: 'Season', pct: 13 },
    { label: 'Events', pct: 10 }
  ];

  // Which entry of the top-level sources table feeds a metric family. The
  // table is keyed by short names chosen by the pipeline, so match on what
  // each entry says about itself.
  function sourceFor(patterns, exclude = null) {
    if (!sources) return null;
    const entries = Object.entries(sources).filter(([k]) => k !== exclude?.key);
    for (const re of patterns) {
      const hit = entries.find(([k, v]) => re.test(`${k} ${v?.name ?? ''} ${v?.method ?? ''}`));
      if (hit) return { key: hit[0], ...hit[1] };
    }
    return null;
  }
  // Sources the pipeline tags with the metric family they feed (sources[k].metric),
  // in table order; older tables without tags fall back to matching on the text.
  function sourcesFor(metric, patterns, exclude = null) {
    if (!sources) return [];
    const tagged = Object.entries(sources)
      .filter(([, v]) => v?.metric === metric)
      .map(([k, v]) => ({ key: k, ...v }));
    if (tagged.length) return tagged;
    const one = sourceFor(patterns, exclude);
    return one ? [one] : [];
  }
  const airSrcs = sourcesFor('pm25', [/pm2\.?5|pm25/i, /\bcams\b/i, /air[- ]quality/i]);
  const climateSrcs = sourcesFor('climate', [/era5|temperature/i, /climate|weather/i], airSrcs[0]);

  // Coverage once the detail layer (which carries per-city prov) is in: how many
  // cities rest on a named source vs a held-back editorial estimate.
  const coverage = $derived.by(() => {
    if (!detailStatus.ready) return null;
    const count = (metric) => {
      let sourced = 0, held = 0;
      for (const c of cities) {
        const pv = provFor(c, metric, sources);
        if (!pv) continue;
        if (pv.srcs.every((s) => s.key === 'editorial')) held++;
        else sourced++;
      }
      return { sourced, held };
    };
    return { climate: count('climate'), pm25: count('pm25'), total: cities.length };
  });

  function measuredRow(input, srcs, metric, fallbackNote) {
    if (!srcs.length) {
      return { input, source: { name: 'No source yet: estimates, being replaced with measured data' }, type: 'Unsourced estimate', refreshed: '—', note: fallbackNote };
    }
    const cov = coverage?.[metric];
    const text = srcs.map((s) => `${s.name} ${s.method ?? ''}`).join(' ');
    const measured = srcs.some((s) => !/reanalysis|cams|model|forecast/i.test(`${s.name} ${s.method ?? ''}`));
    const modelled = /reanalysis|cams|model|forecast/i.test(text);
    const windows = [...new Set(srcs.map((s) => fmtWindow(s.window)).filter(Boolean))];
    return {
      input,
      sources: srcs.map((s) => ({ name: s.name, url: s.url ?? null })),
      type: measured && modelled ? 'Measured + modelled' : modelled ? 'Modelled' : 'Measured',
      refreshed: fmtDate(srcs.map((s) => s.retrieved).filter(Boolean).sort().at(-1)) || '—',
      licence: [...new Set(srcs.map((s) => s.licence).filter(Boolean))].join(' · ') || null,
      note: [
        windows.length ? `${windows.join(' / ')} averages.` : '',
        cov && cov.held ? `${cov.sourced} of ${coverage.total} cities fully or partly sourced; some values for some cities are held back as editorial estimates where the new figure could not be verified (each city sheet says which).` : ''
      ].filter(Boolean).join(' ')
    };
  }

  const INPUTS = $derived([
    measuredRow('Day and night temperature, humidity, rain days (per month)', climateSrcs, 'climate',
      'Values were estimated without a citable source.'),
    measuredRow('PM2.5 (monthly mean)', airSrcs, 'pm25', 'Values were estimated without a citable source.'),
    { input: 'Hazard flags (typhoon, flood, heat, smoke months)', source: null, type: 'Editorial estimate', refreshed: '—' },
    {
      input: 'Intentional-homicide rate',
      source: { name: 'World Bank / UNODC', url: 'https://data.worldbank.org/indicator/VC.IHR.PSRC.P5' },
      type: 'Measured',
      refreshed: fmtDate(dataAsOf.safety) || '—',
      note: 'WHO modelled estimates where the national figure is stale; a few city or state figures from local statistics. Each city sheet links its own.'
    },
    { input: 'Property-crime sub-score (45% of safety)', source: null, type: 'Editorial estimate', refreshed: fmtDate(dataAsOf.safety) || '—' },
    {
      input: 'Visitor-risk modifier (×0.60–1.40)',
      source: null,
      type: 'Editorial estimate',
      refreshed: fmtDate(dataAsOf.safety) || '—',
      note: 'Informed by OSAC crime and safety reports and U.S. State Department guidance.'
    },
    {
      input: "Women who feel safe walking alone at night (country)",
      source: { name: 'Gallup World Poll via the Georgetown WPS Index 2025/26', url: 'https://giwps.georgetown.edu/the-index/' },
      type: 'Measured (survey)',
      refreshed: fmtDate(dataAsOf.womens) || '—'
    },
    { input: "Women's street-safety city adjustment", source: null, type: 'Editorial estimate', refreshed: fmtDate(dataAsOf.safety) || '—' },
    { input: 'Season phase (peak, in, shoulder, off)', source: null, type: 'Editorial estimate', refreshed: '—' },
    { input: 'Event tiers and the event each month counts', source: null, type: 'Editorial estimate', refreshed: '—' },
    {
      input: 'Cost line items (rent, utilities, food, transport, coworking, SIM, other)',
      source: { name: 'Cited cost-of-living pages, linked per item on each city sheet' },
      type: 'Sourced estimate',
      refreshed: fmtDate(dataAsOf.cost) || '—',
      note: 'Each item carries its own source, date and confidence.'
    },
    { input: 'Swim months (display only)', source: null, type: 'Editorial estimate', refreshed: fmtDate(dataAsOf.swim) || '—' },
    {
      input: 'U.S. travel advisory (shown, never scored)',
      source: { name: 'U.S. Department of State', url: 'https://travel.state.gov/en/international-travel/travel-advisories.html' },
      type: 'Official',
      refreshed: fmtDate(dataAsOf.advisory) || '—'
    }
  ]);

  $effect(() => {
    // Capture phase on window runs before the city sheet's own key handler, so
    // Escape (and the sheet's ←/→ city stepping) stop here while this is open.
    const onkey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onclose();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onkey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const prevFocus = document.activeElement;
    cardEl?.focus();
    return () => {
      window.removeEventListener('keydown', onkey, true);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  });
</script>

<div class="scrim">
  <button type="button" class="scrim-back" aria-label="Close methodology" onclick={onclose}></button>
  <div class="card" role="dialog" aria-modal="true" aria-label="Methodology" tabindex="-1" bind:this={cardEl}>
    <button type="button" class="x" onclick={onclose} aria-label="Close">×</button>

    <header class="head">
      <span class="mark" aria-hidden="true">
        {#each BRAND_BANDS as b}<span class="bcell band-{b}"></span>{/each}
      </span>
      <p class="kicker">Methodology<span class="tld"> · {METHOD_VERSION}</span></p>
      <h1>How a month is scored</h1>
      <p class="lede">Every city is scored for all twelve months. One headline <strong>Score</strong>
        blends five sub-scores. Some inputs are measured, some are modelled, and several are
        editorial estimates set by hand. The table below says which is which.</p>
      <p class="ver num">Version {METHOD_VERSION}{LAST_UPDATED ? ` · last updated ${fmtDate(LAST_UPDATED)}` : ''}</p>
    </header>

    <section class="q">
      <span class="qlabel">The headline: Score</span>
      <p class="qhint">A weighted blend of five 0–100 sub-scores, then knocked down by a
        low-safety floor so a beautiful month in a dangerous place can't ride the weather to the top.</p>
      <div class="weights">
        {#each WEIGHTS as w}
          <div class="wrow">
            <span class="wlab">{w.label}</span>
            <span class="wbar"><span class="wfill" style="width:{w.pct}%"></span></span>
            <span class="wpct num">{w.pct}%</span>
          </div>
        {/each}
      </div>
      <p class="qnote">Score defaults. Livability and High season re-weight the same
        sub-scores live; Livability ignores season and events and only subtracts a small peak-season
        crowding penalty. The safety floor always applies.</p>
    </section>

    <section class="q">
      <span class="qlabel">Weather</span>
      <p class="qhint">Day-high and night-low temperature against separate comfort bands, humidity,
        and a tiered rain penalty (a few tropical downpours ≠ a washout). A per-month hazard flag,
        set by hand, scales the whole term down for typhoon, flood and heatwave months.</p>
    </section>

    <section class="q">
      <span class="qlabel">Air</span>
      <p class="qhint">Monthly mean PM2.5 on a two-tier penalty curve — gentle to 35 µg/m³, then
        steep, mirroring where health impact accelerates. Thresholds follow the WHO 2021 guideline
        and interim targets.</p>
    </section>

    <section class="q">
      <span class="qlabel">Safety</span>
      <p class="qhint">A violent term anchored on the intentional-homicide rate (the only violent-crime
        statistic comparable across countries), plus a property and petty-crime term, then a
        visitor-risk multiplier for whether travelers are insulated from or targeted by local crime.
        The property term and the multiplier are editorial estimates. Government travel advisories
        never change the number.</p>
    </section>

    <section class="q">
      <span class="qlabel">Women's street-safety</span>
      <p class="qhint">Shown alongside Safety but <strong>not folded into the headline</strong> unless the
        women's-safety setting is enabled. A country baseline from the share of women who say they feel
        safe walking alone at night, plus a hand-set per-city adjustment for harassment of foreign women
        and within-country variation.</p>
    </section>

    <section class="q">
      <span class="qlabel">Season &amp; Events</span>
      <p class="qhint">Season scores the month's tourism phase (peak → off). Events scores the
        biggest event on the city’s calendar for that month, on a 0–3 tier, so the score and the calendar always agree. Season phase, event dates and tiers are hand-set. Events
        is weighted lightly, because over a multi-week stay a single festival matters less than
        breathable air and safe streets. Each city sheet names the event behind the month's score.</p>
    </section>

    <section class="q">
      <span class="qlabel">Cost &amp; Best Value</span>
      <p class="qhint">Each city's monthly cost is the sum of eight itemized components for one anchor
        persona (a solo nomad living mid-range), each with its own cited page, date and confidence,
        then scaled for a couple and adjusted for accommodation seasonality. <strong>Best Value</strong>
        is the only place the Score meets cost — the Score divided by a damped cost, so "best value"
        rewards cheap-<em>and</em>-nice, not merely cheap.</p>
    </section>

    <section class="q">
      <span class="qlabel">Every input, its source and type</span>
      <div class="itable" role="table" aria-label="Inputs, sources, types and refresh dates">
        <div class="irow ihead" role="row">
          <span role="columnheader">Input</span>
          <span role="columnheader">Source</span>
          <span role="columnheader">Type</span>
          <span role="columnheader">Refreshed</span>
        </div>
        {#each INPUTS as r}
          <div class="irow" role="row">
            <span class="iin" role="cell">{r.input}</span>
            <span class="isrc" role="cell">
              {#if r.sources}
                {#each r.sources as s, j}{j ? ' · ' : ''}{#if s.url}<a href={s.url} target="_blank" rel="noopener">{s.name}</a>{:else}{s.name}{/if}{/each}
              {:else if r.source?.url}<a href={r.source.url} target="_blank" rel="noopener">{r.source.name}</a>{:else if r.source}{r.source.name}{:else}Set by hand{/if}
              {#if r.note}<span class="inote">{r.note}</span>{/if}
              {#if r.licence}<span class="inote">Licence: {r.licence}</span>{/if}
            </span>
            <span class="itype" role="cell"><span class="tchip" class:ed={/Editorial|Unsourced/.test(r.type)}>{r.type}</span></span>
            <span class="iwhen num" role="cell">{r.refreshed}</span>
          </div>
        {/each}
      </div>
    </section>

    <section class="q">
      <span class="qlabel">What is editorial</span>
      <p class="qhint">These inputs are set by hand and are part of the score: the property-crime
        sub-score (45% of the local safety baseline), the visitor-risk modifier, season phase, event
        tiers and hazard flags. Also hand-set, but kept out of the score: swim months, and the per-city
        women's-safety adjustment (unless you turn on the women's-safety setting). On each city sheet
        these are labelled <em>Editorial estimate</em>, with the note stored for them where one exists.</p>
      <p class="qhint">Confidence on the city sheet: <strong>High</strong> for official statistics and
        surveys with a stored link; <strong>Medium</strong> for modelled estimates and secondary city
        figures; <strong>Low</strong> for estimates with no source yet and for values held back as editorial
        estimates because the measured or modelled replacement could not be verified. Climate and PM2.5
        records carry the confidence the pipeline set for each city. Cost items carry the confidence
        recorded with each one.</p>
      <p class="qhint">Spot a number that looks wrong? Every source panel on a city sheet has a
        “Report this number” link, or <a href="{FEEDBACK_REPO}/issues/new" target="_blank" rel="noopener">open an issue</a>.</p>
    </section>

    {#if CHANGELOG.length}
      <section class="q">
        <span class="qlabel">Changelog</span>
        <ul class="log">
          {#each CHANGELOG as e}
            <li>
              <span class="logdate num">{fmtDate(e.date)}</span>
              <span class="logtitle">{e.title}</span>
              <span class="logbody">{e.body}</span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <footer class="foot">
      <p class="disclaim">A planning signal, not legal, medical, or security advice. Re-verify visa
        rules and government advisories against official sources before you travel.</p>
      <button type="button" class="cta" onclick={onclose}>Done</button>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(33, 36, 30, 0.45);
    /* Above the city sheet (z 70): the sheet footer opens this on top of it. */
    z-index: 80;
    overflow-y: auto;
    padding: 6vh 16px;
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

  .card {
    position: relative;
    z-index: 1;
    max-width: 620px;
    margin: 0 auto;
    background: var(--paper);
    border-radius: 18px;
    border: 1px solid var(--line);
    padding: 28px 34px 22px;
    outline: none;
  }

  .x {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 32px;
    height: 32px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--card);
    color: var(--ink-2);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
  }

  .x:hover { color: var(--ink); border-color: var(--ink-3); }

  .head { margin-bottom: 6px; }

  .mark {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 2px;
    width: 132px;
    margin-bottom: 12px;
  }

  .bcell { height: 6px; border-radius: 2px; }
  .bcell.band-great { background: var(--band-great); }
  .bcell.band-good { background: var(--band-good); }
  .bcell.band-ok { background: var(--band-ok); }
  .bcell.band-bad { background: var(--band-bad); }

  .kicker {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-3);
    margin: 0;
  }

  .tld {
    color: var(--terra);
    font-family: var(--mono);
    text-transform: none;
    letter-spacing: 0;
  }

  h1 {
    font-size: clamp(26px, 5vw, 34px);
    font-weight: 600;
    letter-spacing: -0.01em;
    margin: 4px 0 0;
  }

  .lede {
    font-family: var(--display);
    font-style: italic;
    font-size: 15px;
    color: var(--ink-2);
    margin: 10px 0 0;
    line-height: 1.5;
  }

  .q {
    padding: 18px 0;
    border-top: 1px solid var(--line-soft);
  }

  .qlabel {
    display: block;
    font-size: 15px;
    font-weight: 600;
    color: var(--ink);
  }

  .qhint {
    font-size: 13px;
    color: var(--ink-2);
    margin: 8px 0 0;
    line-height: 1.55;
  }

  .qnote {
    font-size: 12px;
    color: var(--ink-3);
    margin: 10px 0 0;
    line-height: 1.45;
  }

  .weights {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 14px 0 2px;
  }

  .wrow {
    display: grid;
    grid-template-columns: 64px 1fr 38px;
    align-items: center;
    gap: 10px;
  }

  .wlab { font-size: 12.5px; color: var(--ink-2); }

  .wbar {
    height: 8px;
    border-radius: 999px;
    background: var(--paper-3);
    overflow: hidden;
  }

  .wfill {
    display: block;
    height: 100%;
    border-radius: 999px;
    background: var(--terra);
  }

  .wpct {
    font-size: 12px;
    color: var(--ink-3);
    text-align: right;
  }

  .ver {
    font-size: 11.5px;
    color: var(--ink-3);
    margin: 10px 0 0;
  }

  .qhint a,
  .isrc a { color: var(--ink-2); text-decoration: underline; text-underline-offset: 2px; }
  .qhint a:hover,
  .isrc a:hover { color: var(--ink); }

  /* Inputs table: four columns on wide screens, a stacked card per input on
     phones so nothing scrolls sideways. */
  .itable { margin-top: 12px; font-size: 12.5px; }

  .irow {
    display: grid;
    grid-template-columns: 1.3fr 1.5fr 0.9fr 0.7fr;
    gap: 10px;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
    align-items: baseline;
  }

  .ihead {
    border-top: none;
    padding-top: 0;
    font-size: 10.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-3);
  }

  .iin { color: var(--ink); }
  .isrc { color: var(--ink-2); overflow-wrap: anywhere; }
  .inote { display: block; font-size: 11.5px; color: var(--ink-3); margin-top: 2px; }
  .iwhen { font-size: 11.5px; color: var(--ink-3); }

  .tchip {
    display: inline-block;
    font-size: 11px;
    line-height: 1.35;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0 7px;
    color: var(--ink-2);
  }

  .tchip.ed { border-style: dashed; }

  @media (max-width: 600px) {
    .ihead { display: none; }
    .irow {
      grid-template-columns: 1fr auto;
      gap: 3px 10px;
    }
    .iin { grid-column: 1 / -1; font-weight: 600; }
    .isrc { grid-column: 1 / -1; }
    .itype { grid-column: 1; }
    .iwhen { grid-column: 2; text-align: right; }
  }

  .log { list-style: none; margin: 10px 0 0; padding: 0; }

  .log li {
    display: grid;
    grid-template-columns: 92px 1fr;
    gap: 2px 12px;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
    font-size: 12.5px;
  }

  .log li:first-child { border-top: none; }
  .logdate { grid-row: span 2; font-size: 11.5px; color: var(--ink-3); }
  .logtitle { font-weight: 600; color: var(--ink); }
  .logbody { color: var(--ink-2); line-height: 1.5; }

  @media (max-width: 600px) {
    .log li { grid-template-columns: 1fr; }
    .logdate { grid-row: auto; }
  }

  .foot {
    margin-top: 8px;
    padding-top: 18px;
    border-top: 1px solid var(--line-soft);
  }

  .disclaim {
    font-size: 12px;
    color: var(--ink-3);
    line-height: 1.5;
    margin: 0 0 16px;
  }

  .cta {
    width: 100%;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: var(--ink);
    color: var(--paper);
    font-family: var(--sans);
    font-size: 14.5px;
    font-weight: 600;
    transition: background 0.15s ease;
    cursor: pointer;
  }

  .cta:hover { background: var(--terra-deep); }
</style>
