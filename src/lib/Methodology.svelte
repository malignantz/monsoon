<script>
  // A read-only companion to Settings.svelte — same scrim/card shell and visual
  // language, but a scrollable sources-and-methods write-up instead of controls.
  // Opened from the footer's "methodology" link.
  let { onclose } = $props();

  let cardEl = $state(null);

  const BRAND_BANDS = ['ok', 'ok', 'good', 'good', 'good', 'great', 'great', 'good', 'good', 'good', 'ok', 'ok'];

  // The headline Top Pick weights (Top Pick preset · METHODOLOGY §6).
  const WEIGHTS = [
    { label: 'Weather', pct: 35 },
    { label: 'Safety', pct: 24 },
    { label: 'Air', pct: 18 },
    { label: 'Season', pct: 13 },
    { label: 'Events', pct: 10 }
  ];

  $effect(() => {
    const onkey = (e) => {
      if (e.key === 'Escape') onclose();
    };
    window.addEventListener('keydown', onkey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cardEl?.focus();
    return () => {
      window.removeEventListener('keydown', onkey);
      document.body.style.overflow = prevOverflow;
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
      <p class="kicker">Methodology<span class="tld"> · v5</span></p>
      <h1>How a month is scored</h1>
      <p class="lede">Every city is scored independently for all twelve months. One headline
        <strong>Top Pick</strong> number blends five measures — each computed from sourced data,
        not vibes. Here's exactly what goes in.</p>
    </header>

    <section class="q">
      <span class="qlabel">The headline: Top Pick</span>
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
      <p class="qnote">Top Pick defaults. Livability and High season re-weight the same
        sub-scores live; Livability ignores events and only subtracts a small peak-season
        crowding penalty. The safety floor always applies.</p>
    </section>

    <section class="q">
      <span class="qlabel">Weather</span>
      <p class="qhint">Day-high and night-low temperature against separate comfort bands, humidity,
        and a tiered rain penalty (a few tropical downpours ≠ a washout). A per-month
        extreme-weather flag scales the whole term down for typhoon, flood, and heatwave months.</p>
      <p class="src">Source · climate normals for temperature, humidity, rain-days &amp; seasonal hazards</p>
    </section>

    <section class="q">
      <span class="qlabel">Air</span>
      <p class="qhint">PM2.5 climatology on a two-tier penalty curve — gentle to 35 µg/m³, then
        steep, mirroring where health impact accelerates. Thresholds anchored to the WHO 2021 guidelines.</p>
      <p class="src">Source · PM2.5 climatology · WHO 2021 air-quality guideline &amp; interim targets</p>
    </section>

    <section class="q">
      <span class="qlabel">Safety</span>
      <p class="qhint">A homicide-anchored violent term (the only violent-crime stat comparable across
        countries) plus a hand-researched property/petty-crime term, then a visitor-risk multiplier for
        whether tourists are insulated from or targeted by local crime. Government travel advisories drive
        a <em>badge</em>, never a silent change to the number.</p>
      <p class="src">Source · World Bank / UNODC &amp; WHO homicide rates · hand-set property &amp; visitor-risk research · US State Dept + UK FCDO advisories</p>
    </section>

    <section class="q">
      <span class="qlabel">Women's street-safety</span>
      <p class="qhint">Shown alongside Safety but <strong>not folded into the headline</strong> unless the
        women's-safety setting is enabled. A country baseline of women who feel safe walking alone at night, plus a hand-set
        per-city adjustment for harassment of foreign women and within-country variation.</p>
      <p class="src">Source · Gallup World Poll via the Georgetown WPS Index · hand-set city deltas</p>
    </section>

    <section class="q">
      <span class="qlabel">Season &amp; Events</span>
      <p class="qhint">Season scores the month's tourism phase (peak → off). Events reflects the scale of
        notable festivals that month — weighted lightly, because over a multi-week stay a single festival
        matters less than breathable air and safe streets.</p>
      <p class="src">Source · per-city seasonal calendars &amp; reviewed event listings</p>
    </section>

    <section class="q">
      <span class="qlabel">Cost &amp; Best Value</span>
      <p class="qhint">Each city's monthly cost is built from eight itemized, dated, sourced components for
        one anchor persona (a solo nomad living mid-range), then scaled for a couple and adjusted for
        accommodation seasonality. <strong>Best Value</strong> is the only place the Top Pick score meets cost — Top Pick
        divided by a damped cost, so "best value" rewards cheap-<em>and</em>-nice, not merely cheap.</p>
      <p class="src">Source · per-city cost-evidence store (rent, utilities, food, transit, coworking, …) with receipts &amp; dates</p>
    </section>

    <section class="q sources">
      <span class="qlabel">Sources at a glance</span>
      <ul>
        <li>WHO 2021 air-quality guidelines &amp; interim targets</li>
        <li>World Bank &amp; UNODC intentional-homicide rates; WHO modeled estimates where data is stale</li>
        <li>Gallup World Poll feel-safe data via the Georgetown WPS Index</li>
        <li>US State Department &amp; UK FCDO travel advisories (display badges only)</li>
        <li>Per-city cost-evidence store with itemized, dated receipts</li>
        <li>Climate normals for temperature, humidity, rain-days &amp; seasonal hazards</li>
        <li>Hero photography from Wikimedia Commons, with license &amp; attribution</li>
      </ul>
    </section>

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
    z-index: 60;
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

  .src {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--ink-3);
    margin: 10px 0 0;
    line-height: 1.45;
  }

  .sources ul {
    margin: 10px 0 0;
    padding-left: 18px;
  }

  .sources li {
    font-size: 12.5px;
    color: var(--ink-2);
    line-height: 1.5;
    margin-bottom: 4px;
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
