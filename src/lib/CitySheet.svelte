<script>
  import MonthStrip from './MonthStrip.svelte';
  import ScoreInfo from './ScoreInfo.svelte';
  import { stripCells, qolFor, fmtMoney, fmtMonthRange, swimNow, MONTHS, PRESETS, detailStatus, cityCost, partyWord } from './data.svelte.js';

  let { city, month, preset, onclose, onmonth, onstep } = $props();

  let sheetEl = $state(null);

  $effect(() => {
    const onkey = (e) => {
      if (e.key === 'Escape') onclose();
      else if (e.key === 'ArrowLeft') onstep?.(-1);
      else if (e.key === 'ArrowRight') onstep?.(1);
    };
    window.addEventListener('keydown', onkey);
    const prevFocus = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sheetEl?.focus();
    return () => {
      window.removeEventListener('keydown', onkey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  });

  const pw = $derived(PRESETS[preset]?.w ?? PRESETS.balanced.w);
  const pct = (x) => Math.round(x * 100);

  const cells = $derived(stripCells(city, preset));
  const m = $derived(city.months[month]);
  const qol = $derived(qolFor(city, month, preset));
  const saf = $derived(city.safety ?? {});
  const yearEvents = $derived(
    Array.isArray(city.events) ? [...city.events].sort((a, b) => (a.months?.[0] ?? 0) - (b.months?.[0] ?? 0)) : []
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
  >
    <header class="hero">
      <button type="button" class="back" onclick={onclose}>← Atlas</button>
      <div class="hero-ctl">
        {#if onstep}
          <button type="button" class="back step" onclick={() => onstep(-1)} aria-label="Previous city" title="Previous city (←)">‹</button>
          <button type="button" class="back step" onclick={() => onstep(1)} aria-label="Next city" title="Next city (→)">›</button>
        {/if}
        <button type="button" class="back close" onclick={onclose} aria-label="Close">×</button>
      </div>
      <div class="title">
        <p class="kicker">{city.region} · {city.country} · {city.timezone ?? ''}</p>
        <h1>{city.name}</h1>
        <p class="vibe">{city.vibe}</p>
      </div>
      <div class="snap">
        <div class="snapcell">
          <span class="num v">{Math.round(qol)}</span>
          <span class="k">quality · {MONTHS[month]}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{saf.score ?? '—'}</span>
          <span class="k">{saf.label ?? 'safety'}</span>
        </div>
        <div class="snapcell">
          <span class="num v">{fmtMoney(cityCost(m))}</span>
          <span class="k">/mo {partyWord()}</span>
        </div>
        {#if city.schengen}
          <div class="snapcell schengen"><span class="v">◆</span><span class="k">Schengen 90/180</span></div>
        {/if}
        {#if city.swim}
          <div
            class="snapcell swim"
            class:off={!swimNow(city, month)}
            title="{city.swim.name}{city.swim.note ? ` — ${city.swim.note}` : ''}"
          >
            <span class="v">≋ {fmtMonthRange(city.swim.months)}</span>
            <span class="k">{swimNow(city, month) ? `swim ${city.swim.body}` : `${city.swim.body} off-season`}</span>
          </div>
        {/if}
      </div>
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
        <h2>Why {MONTHS[month]} scores {Math.round(qol)}
          <ScoreInfo title="Quality score">
            <p>Five 0–100 sub-scores, weighted by your preset ({PRESETS[preset]?.label ?? 'Balanced'}):
              weather {pct(pw.weather)}%, safety {pct(pw.safety)}%, air {pct(pw.air)}%,
              season {pct(pw.season)}%, events {pct(pw.events)}%.</p>
            <p>When safety falls below 55 it also drags the whole score down — a beautiful
              month in a dangerous place can't ride good weather to the top.</p>
            <p class="src">Built from climate normals, WHO-anchored PM2.5, and the safety index below.</p>
          </ScoreInfo>
        </h2>
        <div class="bars">
          {#each comps as c}
            <div class="bar-row">
              <span class="bar-label">{c.label}</span>
              <div class="bar"><div class="fill" style="width:{c.v}%; background:{barColor(c.v)}"></div></div>
              <span class="num bar-num">{Math.round(c.v)}</span>
            </div>
          {/each}
        </div>
        <table class="climate num">
          <tbody>
            <tr><td>Day / night</td><td>{detailStatus.ready ? `${m.high}° / ${m.low}°F` : '…'}</td></tr>
            <tr><td>Humidity</td><td>{detailStatus.ready ? `${m.hum}%` : '…'}</td></tr>
            <tr><td>Rain days</td><td>{detailStatus.ready ? m.rain : '…'}</td></tr>
            <tr><td>PM2.5</td><td>{detailStatus.ready ? `${m.pm25} µg/m³ · ${m.airCat}` : m.airCat}</td></tr>
            <tr><td>Season</td><td>{m.season}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="block">
        <h2>Safety, two ways
          <ScoreInfo title="Safety score">
            <p>55% violent + 45% property, then a ×0.60–1.40 visitor lens for whether
              travelers are more insulated or more targeted than locals.</p>
            <p>Violent is anchored on the intentional-homicide rate — here
              {saf.violent?.homicideRate ?? '—'}/100k ({saf.violent?.scope ?? 'country'}) — the only
              crime statistic comparable across countries. Property is hand-researched
              petty-theft perception; government advisories are shown as badges, never caps.</p>
            <p class="src">{saf.violent?.source ?? 'World Bank / UNODC'}</p>
          </ScoreInfo>
        </h2>
        {#if !detailStatus.ready}
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
            <span class="bar-label">Women's signal
              <ScoreInfo title="Women's safety signal">
                <p>{saf.womensSafety?.cs ?? '—'}% of women in {city.country} tell Gallup they
                  feel safe walking alone at night — baseline {Math.round(saf.womensSafety?.baseline ?? 0)}
                  on our scale{#if saf.womensSafety?.adj},
                  {saf.womensSafety.adj > 0 ? '+' : ''}{saf.womensSafety.adj} city adjustment{/if}.</p>
                {#if saf.womensSafety?.source}<p>{saf.womensSafety.source}.</p>{/if}
                <p>Displayed alongside, never folded into the headline score — turn on
                  the women's-safety setting to blend it 50/50 into safety across every view.</p>
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
              <span class="eblurb">{e.blurb}</span>
              {#if e.tier >= 3}<span class="etier">major</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <footer class="foot">
      <span>{city.visa}</span>
      <span>Scores per the Atlas methodology — re-verify advisories before travel.</span>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(33, 36, 30, 0.45);
    z-index: 50;
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

  h1 { font-size: clamp(30px, 6vw, 44px); font-weight: 600; }

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

  .snapcell.schengen { border-color: var(--schengen); color: var(--schengen); }

  .snapcell.swim { border-color: var(--teal); color: var(--teal); }
  .snapcell.swim .k { color: var(--teal); }

  .snapcell.swim.off { border-color: var(--line); color: var(--ink-3); opacity: 0.75; }
  .snapcell.swim.off .k { color: var(--ink-3); }
  .v { font-size: 19px; font-weight: 600; }
  .k { font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-3); }
  .snapcell.schengen .k { color: var(--schengen); }

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
  .eblurb { color: var(--ink-2); }

  .etier {
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--terra);
    border: 1px solid var(--terra);
    border-radius: 999px;
    padding: 1px 8px;
  }

  li.major .ename { color: var(--terra-deep); }

  .foot {
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid var(--line);
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 11.5px;
    color: var(--ink-3);
  }
</style>
